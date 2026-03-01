import JSZip from 'jszip';
import { db } from '../db/database';
import { fileService } from './fileService';
import { generateUUID, getExtension } from '../utils';
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

const BACKUP_VERSION = '1.0.0';

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
      dossiers,
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
    return content.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_match, label, oldId) => {
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
      const jsonContent = await jsonFile.async('string');
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

      // Create ID mappings (old ID -> new ID)
      const dossierIdMap = new Map<DossierId, DossierId>();
      const elementIdMap = new Map<ElementId, ElementId>();
      const linkIdMap = new Map<LinkId, LinkId>();
      const assetIdMap = new Map<AssetId, AssetId>();

      // Import dossiers
      onProgress?.('Import des dossiers...');
      for (const inv of data.dossiers) {
        const newId = generateUUID();
        dossierIdMap.set(inv.id, newId);

        await db.dossiers.add({
          ...inv,
          id: newId,
          createdAt: new Date(inv.createdAt),
          updatedAt: new Date(inv.updatedAt),
        });
        result.dossiers++;
      }

      // Import assets
      onProgress?.('Import des fichiers...');
      for (const assetMeta of data.assets) {
        try {
          const assetFile = zip.file(assetMeta.archivePath);
          if (!assetFile) continue;

          const arrayBuffer = await assetFile.async('arraybuffer');
          const srcDossierId = assetMeta.dossierId || (assetMeta as any).investigationId;
          const newDossierId = dossierIdMap.get(srcDossierId);
          if (!newDossierId) continue;

          // Create File object and save via fileService
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

      // Import elements
      onProgress?.('Import des éléments...');
      for (const element of data.elements) {
        const newId = generateUUID();
        // Legacy compat: old backups use investigationId instead of dossierId
        const srcDossierId = element.dossierId || (element as any).investigationId;
        const newDossierId = dossierIdMap.get(srcDossierId);
        if (!newDossierId) continue;

        elementIdMap.set(element.id, newId);

        // Map asset IDs
        const newAssetIds = (element.assetIds || [])
          .map((oldId: AssetId) => assetIdMap.get(oldId))
          .filter((id): id is AssetId => id !== undefined);

        await db.elements.add({
          ...element,
          id: newId,
          dossierId: newDossierId,
          assetIds: newAssetIds,
          parentGroupId: null, // Reset group relations
          childIds: [],
          date: element.date ? new Date(element.date) : null,
          createdAt: new Date(element.createdAt),
          updatedAt: new Date(element.updatedAt),
        });
        result.elements++;
      }

      // Import links
      onProgress?.('Import des liens...');
      for (const link of data.links) {
        const srcDossierId = link.dossierId || (link as any).investigationId;
        const newDossierId = dossierIdMap.get(srcDossierId);
        const newFromId = elementIdMap.get(link.fromId);
        const newToId = elementIdMap.get(link.toId);

        if (!newDossierId || !newFromId || !newToId) continue;

        const newLinkId = generateUUID();
        linkIdMap.set(link.id, newLinkId);
        await db.links.add({
          ...link,
          id: newLinkId,
          dossierId: newDossierId,
          fromId: newFromId,
          toId: newToId,
          date: link.date ? new Date(link.date) : null,
          createdAt: new Date(link.createdAt),
          updatedAt: new Date(link.updatedAt),
        });
        result.links++;
      }

      // Import views
      onProgress?.('Import des vues...');
      for (const view of data.views || []) {
        const srcDossierId = view.dossierId || (view as any).investigationId;
        const newDossierId = dossierIdMap.get(srcDossierId);
        if (!newDossierId) continue;

        await db.views.add({
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

      // Import reports
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

        await db.reports.add({
          ...report,
          id: generateUUID(),
          dossierId: newDossierId,
          sections: remappedSections,
          createdAt: new Date(report.createdAt),
          updatedAt: new Date(report.updatedAt),
        });
      }

      // Import tag sets (global, no dossier ID mapping needed)
      onProgress?.('Import des tags...');
      for (const tagSet of data.tagSets || []) {
        // Check if tag set with same name already exists ('name' is not indexed, use filter)
        const allTagSets = await db.tagSets.toArray();
        const existing = allTagSets.find(ts => ts.name === tagSet.name);
        if (!existing) {
          await db.tagSets.add({
            ...tagSet,
            id: generateUUID(),
          });
        }
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

  /**
   * Download blob as a file
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const backupService = new BackupService();
