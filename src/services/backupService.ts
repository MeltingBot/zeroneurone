import JSZip from 'jszip';
import { ZIP_LIMITS, ZipEntryTooLargeError, readZipEntryBuffer, readZipEntryText } from './zipLimits';
import { db } from '../db/database';
import { dossierRepository } from '../db/repositories/dossierRepository';
import { fileService } from './fileService';
import { exportService } from './exportService';
import { importService } from './importService';
import { loadDossierSnapshot } from './dossierSnapshot';
import { generateUUID, stripLocalOnlyDossierFields } from '../utils';
import type {
  Dossier,
  Element,
  Link,
  View,
  Report,
  TagSet,
  DossierId,
  AssetId,
  ElementId,
  LinkId,
  CustomIcon,
} from '../types';
import type { JsonMappingTemplate } from '../utils/jsonMapping';
import { replaceReportRefs } from '../utils/reportRefs';
import { errorText, importMessage } from './importMessages';

/**
 * 2.x: one dossier ZIP per dossier (the format of the dossier export, so a
 * backup carries everything that export carries: tabs, groups, comments,
 * saved queries, report, files, plugin data) plus the global data.
 * 1.x (read only): flat tables, without tabs, groups, comments or queries.
 */
const BACKUP_VERSION = '2.0.0';
const BACKUP_FORMAT = 'zeroneurone-backup';

/**
 * A backup written by a newer major version may hold fields this build does not
 * understand; importing it would silently drop them. Older majors stay readable.
 */
export function isSupportedBackupVersion(version: string): boolean {
  const major = Number.parseInt(version.split('.')[0], 10);
  if (!Number.isFinite(major)) return false;
  return major <= Number.parseInt(BACKUP_VERSION.split('.')[0], 10);
}

/** Rows of old backups carry investigationId instead of dossierId */
type Archived<T> = T & { investigationId?: DossierId };

/** Format 1.x */
interface LegacyBackupData {
  version: string;
  exportedAt: string;
  dossiers: Dossier[];
  elements: Archived<Element>[];
  links: Archived<Link>[];
  assets: Archived<AssetMetadata>[];
  views: Archived<View>[];
  reports: Archived<Report>[];
  tagSets: TagSet[];
}

interface AssetMetadata {
  id: string;
  dossierId: string;
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  archivePath: string;
}

/** Format 2.x: backup.json */
interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: string;
  exportedAt: string;
  dossiers: Array<{ file: string; dossier: Dossier }>;
  tagSets: TagSet[];
  customIcons: CustomIcon[];
  jsonMappings: JsonMappingTemplate[];
}

export interface BackupImportResult {
  success: boolean;
  dossiers: number;
  elements: number;
  links: number;
  assets: number;
  errors: string[];
  warnings: string[];
}

const toDate = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(value as string);

class BackupService {
  /**
   * Every dossier as its own dossier ZIP, plus the tag families, custom icons
   * and import templates. Dossiers are read from their Y.Doc, the source of
   * truth, closed ones included.
   */
  async exportAll(onProgress?: (message: string) => void): Promise<Blob> {
    const zip = new JSZip();
    const dossiers = await db.dossiers.toArray();
    const entries: BackupManifest['dossiers'] = [];

    for (const [index, dossier] of dossiers.entries()) {
      onProgress?.(importMessage('backup.progress.exportDossier', {
        index: index + 1, count: dossiers.length, name: dossier.name,
      }));
      const snapshot = await loadDossierSnapshot(dossier.id);
      const blob = await exportService.exportToZip(
        dossier, snapshot.elements, snapshot.links, snapshot.assets, snapshot.report,
        snapshot.tabs, snapshot.views, snapshot.queries, snapshot.queryHistory, snapshot.comments,
      );
      const file = `dossiers/${String(index + 1).padStart(4, '0')}.zip`;
      // Already compressed: stored as is
      zip.file(file, blob, { compression: 'STORE' });
      entries.push({ file, dossier: stripLocalOnlyDossierFields(dossier) });
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      dossiers: entries,
      tagSets: await db.tagSets.toArray(),
      customIcons: await db.customIcons.toArray(),
      jsonMappings: await db.jsonMappings.toArray(),
    };
    zip.file('backup.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  _remapReportContent(
    content: string,
    elementIdMap: Map<ElementId, ElementId>,
    linkIdMap: Map<LinkId, LinkId>,
  ): string {
    // Replace [[Label|old-id]] with [[Label|new-id]]
    return replaceReportRefs(content, (label, oldId) => {
      const newId = elementIdMap.get(oldId) || linkIdMap.get(oldId) || oldId;
      return `[[${label}|${newId}]]`;
    });
  }

  /**
   * Restore a backup. Adds to the existing data, never replaces it: restored
   * dossiers get new ids.
   */
  async importAll(file: File, onProgress?: (message: string) => void): Promise<BackupImportResult> {
    const result: BackupImportResult = {
      success: false, dossiers: 0, elements: 0, links: 0, assets: 0, errors: [], warnings: [],
    };

    try {
      onProgress?.(importMessage('backup.progress.reading'));
      const zip = await JSZip.loadAsync(file);

      const jsonFile = zip.file('backup.json');
      if (!jsonFile) {
        result.errors.push(importMessage('backup.missingBackupJson'));
        return result;
      }

      // A full backup holds every dossier, hence the archive-wide bound
      let jsonContent: string;
      try {
        jsonContent = await readZipEntryText(jsonFile, ZIP_LIMITS.MAX_ZIP_SIZE);
      } catch (error) {
        if (!(error instanceof ZipEntryTooLargeError)) throw error;
        result.errors.push(importMessage('backup.backupTooLarge'));
        return result;
      }
      const rawData = JSON.parse(jsonContent);

      // Legacy compat: normalize 'investigations' key → 'dossiers'
      if (rawData.investigations && !rawData.dossiers) {
        rawData.dossiers = rawData.investigations;
        delete rawData.investigations;
      }

      if (!rawData.version || !Array.isArray(rawData.dossiers)) {
        result.errors.push(importMessage('backup.invalidFormat'));
        return result;
      }
      if (!isSupportedBackupVersion(rawData.version)) {
        result.errors.push(
          importMessage('backup.incompatibleVersion', { version: rawData.version, expected: BACKUP_VERSION })
        );
        return result;
      }

      if (rawData.format === BACKUP_FORMAT) {
        await this.importDossierArchives(zip, rawData as BackupManifest, result, onProgress);
      } else {
        await this.importLegacy(zip, rawData as LegacyBackupData, result, onProgress);
      }
      result.success = result.errors.length === 0 || result.dossiers > 0;
      onProgress?.(importMessage('backup.progress.done'));
    } catch (error) {
      result.errors.push(importMessage('common.importError', { message: errorText(error) }));
    }

    return result;
  }

  /** Format 2.x: each dossier ZIP goes through the dossier import. */
  private async importDossierArchives(
    zip: JSZip,
    manifest: BackupManifest,
    result: BackupImportResult,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    await this.importGlobalData(manifest);

    for (const [index, { file, dossier }] of manifest.dossiers.entries()) {
      onProgress?.(importMessage('backup.progress.importDossier', {
        index: index + 1, count: manifest.dossiers.length, name: dossier.name,
      }));
      const entry = zip.file(file);
      if (!entry) {
        result.errors.push(importMessage('backup.missingDossier', { name: dossier.name }));
        continue;
      }

      // Closure and retention are restored after the import: a closed or
      // expired dossier would refuse it
      const {
        closedAt, closureHistory, retentionDays, retentionPolicy, retentionFrom, ...rest
      } = dossier;
      const newId = generateUUID();
      await db.dossiers.add({
        ...rest,
        id: newId,
        origin: 'created',
        startDate: toDate(rest.startDate),
        createdAt: toDate(rest.createdAt) ?? new Date(),
        updatedAt: toDate(rest.updatedAt) ?? new Date(),
      });

      try {
        const buffer = await readZipEntryBuffer(entry, ZIP_LIMITS.MAX_ZIP_SIZE);
        const imported = await importService.importFromZip(
          new File([buffer], `${dossier.name}.zip`, { type: 'application/zip' }), newId,
        );
        if (!imported.success) throw new Error(imported.errors.join(', '));
        await db.dossiers.update(newId, {
          closedAt: toDate(closedAt),
          closureHistory: (closureHistory ?? []).map((c) => ({
            closedAt: new Date(c.closedAt), reopenedAt: new Date(c.reopenedAt),
          })),
          retentionDays,
          retentionPolicy,
          retentionFrom,
        });
        result.dossiers++;
        result.elements += imported.elementsImported;
        result.links += imported.linksImported;
        result.assets += imported.assetsImported;
        result.warnings.push(...imported.warnings.map((w) => `${dossier.name} : ${w}`));
      } catch (error) {
        // A dossier that failed leaves nothing behind
        await dossierRepository.delete(newId).catch(() => {});
        await fileService.deleteDossierAssets(newId).catch(() => {});
        result.errors.push(importMessage('backup.dossierFailed', { name: dossier.name, message: errorText(error) }));
      }
    }
  }

  /** Tag families by name, icons and import templates by id: only the missing ones. */
  private async importGlobalData(manifest: BackupManifest): Promise<void> {
    const knownTagSetNames = new Set((await db.tagSets.toArray()).map((ts) => ts.name));
    const tagSets = (manifest.tagSets ?? []).filter((ts) => !knownTagSetNames.has(ts.name));
    const knownIcons = new Set(await db.customIcons.toCollection().primaryKeys());
    const icons = (manifest.customIcons ?? []).filter((icon) => !knownIcons.has(icon.id));
    const knownMappings = new Set(await db.jsonMappings.toCollection().primaryKeys());
    const mappings = (manifest.jsonMappings ?? []).filter((m) => !knownMappings.has(m.id));
    await db.transaction('rw', [db.tagSets, db.customIcons, db.jsonMappings], async () => {
      await db.tagSets.bulkAdd(tagSets.map((ts) => ({ ...ts, id: generateUUID() })));
      await db.customIcons.bulkAdd(icons);
      await db.jsonMappings.bulkAdd(mappings);
    });
  }

  /** Format 1.x: flat tables, written in one transaction. */
  private async importLegacy(
    zip: JSZip,
    data: LegacyBackupData,
    result: BackupImportResult,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    // Create ID mappings (old ID -> new ID)
    const dossierIdMap = new Map<DossierId, DossierId>();
    const elementIdMap = new Map<ElementId, ElementId>();
    const linkIdMap = new Map<LinkId, LinkId>();
    const assetIdMap = new Map<AssetId, AssetId>();

    // Every row is prepared first and written in one transaction: a failure
    // leaves no half-restored dossier. Files go to OPFS beforehand (outside
    // any transaction) and are removed again if the write fails.
    for (const inv of data.dossiers) dossierIdMap.set(inv.id, generateUUID());

    onProgress?.(importMessage('backup.progress.files'));
    try {
      for (const assetMeta of data.assets) {
        try {
          const assetFile = zip.file(assetMeta.archivePath);
          if (!assetFile) continue;

          const arrayBuffer = await readZipEntryBuffer(assetFile, ZIP_LIMITS.MAX_FILE_SIZE_IN_ZIP);
          const srcDossierId = assetMeta.dossierId || assetMeta.investigationId;
          const newDossierId = srcDossierId && dossierIdMap.get(srcDossierId);
          if (!newDossierId) continue;

          const fileObj = new File([arrayBuffer], assetMeta.filename, {
            type: assetMeta.mimeType,
          });
          const savedAsset = await fileService.saveAsset(newDossierId, fileObj);
          assetIdMap.set(assetMeta.id, savedAsset.id);
          result.assets++;
        } catch (error) {
          console.warn(`Failed to import asset:`, error);
        }
      }

      onProgress?.(importMessage('backup.progress.elements'));
      const dossierRows = data.dossiers.map((inv) => ({
        ...inv,
        id: dossierIdMap.get(inv.id)!,
        createdAt: new Date(inv.createdAt),
        updatedAt: new Date(inv.updatedAt),
      }));

      const elementRows: Element[] = [];
      for (const element of data.elements) {
        // Legacy compat: old backups use investigationId instead of dossierId
        const srcDossierId = element.dossierId || element.investigationId;
        const newDossierId = srcDossierId && dossierIdMap.get(srcDossierId);
        if (!newDossierId) continue;
        const newId = generateUUID();
        elementIdMap.set(element.id, newId);
        elementRows.push({
          ...element,
          id: newId,
          dossierId: newDossierId,
          assetIds: (element.assetIds || [])
            .map((oldId: AssetId) => assetIdMap.get(oldId))
            .filter((id): id is AssetId => id !== undefined),
          parentGroupId: null, // Reset group relations
          childIds: [],
          date: element.date ? new Date(element.date) : null,
          createdAt: new Date(element.createdAt),
          updatedAt: new Date(element.updatedAt),
        });
      }

      const linkRows: Link[] = [];
      for (const link of data.links) {
        const srcDossierId = link.dossierId || link.investigationId;
        const newDossierId = srcDossierId && dossierIdMap.get(srcDossierId);
        const newFromId = elementIdMap.get(link.fromId);
        const newToId = elementIdMap.get(link.toId);
        if (!newDossierId || !newFromId || !newToId) continue;
        const newLinkId = generateUUID();
        linkIdMap.set(link.id, newLinkId);
        linkRows.push({
          ...link,
          id: newLinkId,
          dossierId: newDossierId,
          fromId: newFromId,
          toId: newToId,
          date: link.date ? new Date(link.date) : null,
          createdAt: new Date(link.createdAt),
          updatedAt: new Date(link.updatedAt),
        });
      }

      const viewRows: View[] = [];
      for (const view of data.views || []) {
        const srcDossierId = view.dossierId || view.investigationId;
        const newDossierId = srcDossierId && dossierIdMap.get(srcDossierId);
        if (!newDossierId) continue;
        viewRows.push({
          ...view,
          id: generateUUID(),
          dossierId: newDossierId,
          hiddenElementIds: (view.hiddenElementIds || [])
            .map((eid: ElementId) => elementIdMap.get(eid))
            .filter(Boolean) as ElementId[],
          elementPositions: (view.elementPositions || [])
            .map((ep: { id: ElementId; position: { x: number; y: number } }) => {
              const newId = elementIdMap.get(ep.id);
              return newId ? { ...ep, id: newId } : null;
            })
            .filter((ep): ep is NonNullable<typeof ep> => ep !== null),
          createdAt: new Date(view.createdAt),
        });
      }

      const reportRows: Report[] = [];
      for (const report of data.reports || []) {
        const srcDossierId = report.dossierId || report.investigationId;
        const newDossierId = srcDossierId && dossierIdMap.get(srcDossierId);
        if (!newDossierId) continue;
        // Remap element/link references in report sections
        const remappedSections = (report.sections || []).map((section) => ({
          ...section,
          id: generateUUID(),
          content: this._remapReportContent(section.content || '', elementIdMap, linkIdMap),
          elementIds: (section.elementIds || [])
            .map((eid: ElementId) => elementIdMap.get(eid))
            .filter((id): id is ElementId => !!id),
        }));
        reportRows.push({
          ...report,
          id: generateUUID(),
          dossierId: newDossierId,
          sections: remappedSections,
          createdAt: new Date(report.createdAt),
          updatedAt: new Date(report.updatedAt),
        });
      }

      // Tag sets are global: only the names not already there
      const knownTagSetNames = new Set((await db.tagSets.toArray()).map((ts) => ts.name));
      const tagSetRows: TagSet[] = [];
      for (const tagSet of data.tagSets || []) {
        if (knownTagSetNames.has(tagSet.name)) continue;
        knownTagSetNames.add(tagSet.name);
        tagSetRows.push({ ...tagSet, id: generateUUID() });
      }

      onProgress?.(importMessage('backup.progress.writing'));
      await db.transaction('rw', [db.dossiers, db.elements, db.links, db.views, db.reports, db.tagSets], async () => {
        await db.dossiers.bulkAdd(dossierRows);
        await db.elements.bulkAdd(elementRows);
        await db.links.bulkAdd(linkRows);
        await db.views.bulkAdd(viewRows);
        await db.reports.bulkAdd(reportRows);
        await db.tagSets.bulkAdd(tagSetRows);
      });
      result.dossiers = dossierRows.length;
      result.elements = elementRows.length;
      result.links = linkRows.length;
    } catch (error) {
      // Nothing was written to the tables: take the files back out of OPFS
      for (const newDossierId of dossierIdMap.values()) {
        await fileService.deleteDossierAssets(newDossierId).catch(() => {});
      }
      result.assets = 0;
      throw error;
    }

  }
}

export const backupService = new BackupService();
