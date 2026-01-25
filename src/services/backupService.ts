import JSZip from 'jszip';
import { db } from '../db/database';
import { fileService } from './fileService';
import { generateUUID, getExtension } from '../utils';
import type {
  Investigation,
  Element,
  Link,
  Asset,
  View,
  Report,
  TagSet,
  InvestigationId,
  AssetId,
  ElementId,
} from '../types';

const BACKUP_VERSION = '1.0.0';

interface BackupData {
  version: string;
  exportedAt: string;
  investigations: Investigation[];
  elements: Element[];
  links: Link[];
  assets: AssetMetadata[];
  views: View[];
  reports: Report[];
  tagSets: TagSet[];
}

interface AssetMetadata {
  id: string;
  investigationId: string;
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
    const [investigations, elements, links, assets, views, reports, tagSets] =
      await Promise.all([
        db.investigations.toArray(),
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
          investigationId: asset.investigationId,
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
      investigations,
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
  async importAll(
    file: File,
    onProgress?: (message: string) => void
  ): Promise<{
    success: boolean;
    investigations: number;
    elements: number;
    links: number;
    assets: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      investigations: 0,
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
      const data = JSON.parse(jsonContent) as BackupData;

      // Validate structure
      if (!data.version || !data.investigations) {
        result.errors.push('Format de sauvegarde invalide');
        return result;
      }

      // Create ID mappings (old ID -> new ID)
      const investigationIdMap = new Map<InvestigationId, InvestigationId>();
      const elementIdMap = new Map<ElementId, ElementId>();
      const assetIdMap = new Map<AssetId, AssetId>();

      // Import investigations
      onProgress?.('Import des enquêtes...');
      for (const inv of data.investigations) {
        const newId = generateUUID();
        investigationIdMap.set(inv.id, newId);

        await db.investigations.add({
          ...inv,
          id: newId,
          createdAt: new Date(inv.createdAt),
          updatedAt: new Date(inv.updatedAt),
        });
        result.investigations++;
      }

      // Import assets
      onProgress?.('Import des fichiers...');
      for (const assetMeta of data.assets) {
        try {
          const assetFile = zip.file(assetMeta.archivePath);
          if (!assetFile) continue;

          const arrayBuffer = await assetFile.async('arraybuffer');
          const newInvestigationId = investigationIdMap.get(assetMeta.investigationId);
          if (!newInvestigationId) continue;

          // Create File object and save via fileService
          const fileObj = new File([arrayBuffer], assetMeta.filename, {
            type: assetMeta.mimeType,
          });
          const savedAsset = await fileService.saveAsset(newInvestigationId, fileObj);
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
        const newInvestigationId = investigationIdMap.get(element.investigationId);
        if (!newInvestigationId) continue;

        elementIdMap.set(element.id, newId);

        // Map asset IDs
        const newAssetIds = (element.assetIds || [])
          .map((oldId: AssetId) => assetIdMap.get(oldId))
          .filter((id): id is AssetId => id !== undefined);

        await db.elements.add({
          ...element,
          id: newId,
          investigationId: newInvestigationId,
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
        const newInvestigationId = investigationIdMap.get(link.investigationId);
        const newFromId = elementIdMap.get(link.fromId);
        const newToId = elementIdMap.get(link.toId);

        if (!newInvestigationId || !newFromId || !newToId) continue;

        await db.links.add({
          ...link,
          id: generateUUID(),
          investigationId: newInvestigationId,
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
        const newInvestigationId = investigationIdMap.get(view.investigationId);
        if (!newInvestigationId) continue;

        await db.views.add({
          ...view,
          id: generateUUID(),
          investigationId: newInvestigationId,
          createdAt: new Date(view.createdAt),
        });
      }

      // Import reports
      for (const report of data.reports || []) {
        const newInvestigationId = investigationIdMap.get(report.investigationId);
        if (!newInvestigationId) continue;

        await db.reports.add({
          ...report,
          id: generateUUID(),
          investigationId: newInvestigationId,
          createdAt: new Date(report.createdAt),
          updatedAt: new Date(report.updatedAt),
        });
      }

      // Import tag sets (global, no investigation ID mapping needed)
      onProgress?.('Import des tags...');
      for (const tagSet of data.tagSets || []) {
        // Check if tag set with same name already exists
        const existing = await db.tagSets.where('name').equals(tagSet.name).first();
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
