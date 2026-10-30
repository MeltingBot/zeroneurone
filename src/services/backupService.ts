import JSZip from 'jszip';
import { ZIP_LIMITS, ZipEntryTooLargeError, readZipEntryBuffer, readZipEntryText } from './zipLimits';
import { db } from '../db/database';
import { fileService } from './fileService';
import { generateUUID, getExtension, stripLocalOnlyDossierFields } from '../utils';
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
} from '../types';
import { replaceReportRefs } from '../utils/reportRefs';

const BACKUP_VERSION = '1.0.0';

/**
 * A backup written by a newer major version may hold fields this build does not
 * understand; importing it would silently drop them. Older majors stay readable.
 */
export function isSupportedBackupVersion(version: string): boolean {
  const major = Number.parseInt(version.split('.')[0], 10);
  if (!Number.isFinite(major)) return false;
  return major <= Number.parseInt(BACKUP_VERSION.split('.')[0], 10);
}

interface BackupData {
  version: string;
  exportedAt: string;
  dossiers: Dossier[];
  elements: Element[];
  links: Link[];
  assets: AssetMetadata[];
  views: View[];
  reports: Report[];
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

class BackupService {
  /**
   * Export all data to a ZIP file
   */
  async exportAll(): Promise<Blob> {
    const zip = new JSZip();

    // Load all data from IndexedDB
    const [dossiers, elements, links, assets, views, reports, tagSets] =
      await Promise.all([
        db.dossiers.toArray(),
        db.elements.toArray(),
        db.links.toArray(),
        db.assets.toArray(),
        db.views.toArray(),
        db.reports.toArray(),
        db.tagSets.toArray(),
      ]);

    // Prepare asset metadata and add files to ZIP
    const assetsMetadata: AssetMetadata[] = [];

    for (const asset of assets) {
      try {
        const file = await fileService.getAssetFile(asset);
        const arrayBuffer = await file.arrayBuffer();

        // Create archive path: assets/{uuid}.{ext}
        const ext = getExtension(asset.filename);
        const archivePath = `assets/${generateUUID()}.${ext}`;

        // Add file to ZIP
        zip.file(archivePath, arrayBuffer);

        // Store metadata
        assetsMetadata.push({
          id: asset.id,
          dossierId: asset.dossierId,
          filename: asset.filename,
          mimeType: asset.mimeType,
          size: asset.size,
          hash: asset.hash,
          archivePath,
        });
      } catch (error) {
        console.warn(`Failed to export asset ${asset.filename}:`, error);
      }
    }

    // Create backup data
    const backupData: BackupData = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      dossiers: dossiers.map(stripLocalOnlyDossierFields),
      elements,
      links,
      assets: assetsMetadata,
      views,
      reports,
      tagSets,
    };

    // Add JSON metadata
    zip.file('backup.json', JSON.stringify(backupData, null, 2));

    // Generate ZIP blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Import all data from a backup ZIP file
   * This ADDS data to existing data (doesn't replace)
   */
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

  async importAll(
    file: File,
    onProgress?: (message: string) => void
  ): Promise<{
    success: boolean;
    dossiers: number;
    elements: number;
    links: number;
    assets: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      dossiers: 0,
      elements: 0,
      links: 0,
      assets: 0,
      errors: [] as string[],
    };

    try {
      onProgress?.('Lecture de l\'archive...');
      const zip = await JSZip.loadAsync(file);

      // Read the JSON metadata
      const jsonFile = zip.file('backup.json');
      if (!jsonFile) {
        result.errors.push('Archive invalide: backup.json manquant');
        return result;
      }

      onProgress?.('Analyse des données...');
      // A full backup holds every dossier, hence the archive-wide bound
      let jsonContent: string;
      try {
        jsonContent = await readZipEntryText(jsonFile, ZIP_LIMITS.MAX_ZIP_SIZE);
      } catch (error) {
        if (!(error instanceof ZipEntryTooLargeError)) throw error;
        result.errors.push('Archive invalide: backup.json trop volumineux');
        return result;
      }
      const rawData = JSON.parse(jsonContent);

      // Legacy compat: normalize 'investigations' key → 'dossiers'
      if (rawData.investigations && !rawData.dossiers) {
        rawData.dossiers = rawData.investigations;
        delete rawData.investigations;
      }

      const data = rawData as BackupData;

      // Validate structure
      if (!data.version || !data.dossiers) {
        result.errors.push('Format de sauvegarde invalide');
        return result;
      }

      if (!isSupportedBackupVersion(data.version)) {
        result.errors.push(
          `Sauvegarde en version ${data.version}, incompatible avec cette version de l'application ` +
          `(format ${BACKUP_VERSION}). Mettez à jour ZeroNeurone avant de restaurer.`
        );
        return result;
      }

      // Create ID mappings (old ID -> new ID)
      const dossierIdMap = new Map<DossierId, DossierId>();
      const elementIdMap = new Map<ElementId, ElementId>();
      const linkIdMap = new Map<LinkId, LinkId>();
      const assetIdMap = new Map<AssetId, AssetId>();

      // Every row is prepared first and written in one transaction: a failure
      // leaves no half-restored dossier. Files go to OPFS beforehand (outside
      // any transaction) and are removed again if the write fails.
      for (const inv of data.dossiers) dossierIdMap.set(inv.id, generateUUID());

      onProgress?.('Import des fichiers...');
      try {
        for (const assetMeta of data.assets) {
          try {
            const assetFile = zip.file(assetMeta.archivePath);
            if (!assetFile) continue;

            const arrayBuffer = await readZipEntryBuffer(assetFile, ZIP_LIMITS.MAX_FILE_SIZE_IN_ZIP);
            const srcDossierId = assetMeta.dossierId || (assetMeta as any).investigationId;
            const newDossierId = dossierIdMap.get(srcDossierId);
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

        onProgress?.('Import des éléments...');
        const dossierRows = data.dossiers.map((inv) => ({
          ...inv,
          id: dossierIdMap.get(inv.id)!,
          createdAt: new Date(inv.createdAt),
          updatedAt: new Date(inv.updatedAt),
        }));

        const elementRows: Element[] = [];
        for (const element of data.elements) {
          // Legacy compat: old backups use investigationId instead of dossierId
          const srcDossierId = element.dossierId || (element as any).investigationId;
          const newDossierId = dossierIdMap.get(srcDossierId);
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
          const srcDossierId = link.dossierId || (link as any).investigationId;
          const newDossierId = dossierIdMap.get(srcDossierId);
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
          const srcDossierId = view.dossierId || (view as any).investigationId;
          const newDossierId = dossierIdMap.get(srcDossierId);
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
          const srcDossierId = report.dossierId || (report as any).investigationId;
          const newDossierId = dossierIdMap.get(srcDossierId);
          if (!newDossierId) continue;
          // Remap element/link references in report sections
          const remappedSections = (report.sections || []).map((section: any) => ({
            ...section,
            id: generateUUID(),
            content: this._remapReportContent(section.content || '', elementIdMap, linkIdMap),
            elementIds: (section.elementIds || [])
              .map((eid: ElementId) => elementIdMap.get(eid))
              .filter(Boolean),
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

        onProgress?.('Écriture des données...');
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

      result.success = true;
      onProgress?.('Import terminé');
    } catch (error) {
      result.errors.push(
        `Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }

    return result;
  }
}

export const backupService = new BackupService();
