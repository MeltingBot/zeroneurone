import type { Table } from 'dexie';
import JSZip from 'jszip';
import { ZIP_LIMITS, ZipEntryTooLargeError, readZipEntryBuffer, readZipEntryText } from './zipLimits';
import { selectZipTabs, zipTabsOverview, type ImportedTabPlan, type ZipTabSelection, type ZipTabsOverview } from './zipTabSelection';
import { db } from '../db/database';
import { getPlugins } from '../plugins/pluginRegistry';
import { generateUUID } from '../utils';
import { decryptZip, isEncryptedZipBuffer } from './encryption/zipEncryption';
import type { DossierId, Element, ElementId, Link, LinkId, AssetId, Position, Property, Report, ReportSection, ReportSectionId, CanvasTab, TabId, View, ViewId, SavedQuery, SavedQueryId, Comment, CommentId } from '../types';
import { CUSTOM_ICON_PREFIX, isCustomIconName } from '../types';
import { useQueryStore } from '../stores/queryStore';
import { useTagSetStore } from '../stores/tagSetStore';
import { useCustomIconStore } from '../stores/customIconStore';
import { tagSetRepository, customIconRepository } from '../db/repositories';
import { sanitizeSvgIcon } from '../utils/svgIcon';
import { normalizeGeo } from '../utils/geo';
import { remapDismissedSuggestions } from './linkSuggestions';
import { getEvaluationModel, isEvaluationModel, sanitizeEvaluation } from '../utils/evaluation';
import { isDossierOptions } from '../utils/dossierOptions';
import type { ExportData, ExportedAssetMeta } from './exportService';
import { fileService, FileValidationError } from './fileService';
import { parseOsintrackerFile } from './importOsintracker';
import { dataUrlToFile } from '../utils/dataUrl';
import i18next from 'i18next';
import { importPredicaGraph, isPredicaGraphFormat } from './importPredictagraph';
import { importOsintIndustries, isOsintIndustriesFormat } from './importOsintIndustries';
import { importOIPalette, isOIPaletteFormat } from './importOIPalette';
import { importExcalidraw, isExcalidrawFormat } from './importExcalidraw';
import { importSTIX2, isSTIX2Format } from './importSTIX2';
import { importGephiLiteJSON, isGephiLiteFormat } from './importGephi';
import { importGenealogyFile, type GenealogyImportOptions } from './genealogy';
import { parseDateValue, parsePropertyDate } from '../utils/dates';
import { reportMediaProgress } from './importProgress';
import { reportRefRegex } from '../utils/reportRefs';
import { importFromCSV } from './importCsv';
import { analyzeGeoJSONFields as analyzeGeoJSONFieldsImpl, importFromGeoJSON as importFromGeoJSONImpl } from './importGeoJSON';
import { importFromGraphML as importFromGraphMLImpl } from './importGraphML';

/**
 * Date / datetime property values of a ZeroNeurone archive, as Dates. An
 * archive that records its time zone (v2.61.0+) holds exact instants; in older
 * or generated ones, 00:00 UTC stands for a calendar day (`parsePropertyDate`).
 */
function importedProperties<T extends Property[] | undefined>(properties: T, exact: boolean): T {
  if (!Array.isArray(properties)) return properties;
  return properties.map((p) => {
    if ((p.type !== 'date' && p.type !== 'datetime') || typeof p.value !== 'string') return p;
    const value = exact ? parseDateValue(p.value) : parsePropertyDate(p.value);
    return value ? { ...p, value } : p;
  }) as T;
}

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

export interface ImportResult {
  success: boolean;
  elementsImported: number;
  linksImported: number;
  eventsImported?: number;
  assetsImported: number;
  reportImported: boolean;
  errors: string[];
  warnings: string[];
  /** Into an open dossier, from chosen tabs: the tabs to fill, by name */
  tabPlan?: ImportedTabPlan[];
  /** New ids of elements brought only as linked ones, filed in a tab left out:
   *  kept out of the open tab (ghosts of the tabs they are linked from) */
  linkedOnlyIds?: string[];
}

export interface CSVImportOptions {
  hasHeaders: boolean;
  delimiter: string;
  createMissingElements: boolean;
}

/** Bounding box of elements for placement preview */
export interface ImportBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  elementCount: number;
}

/**
 * Writes rows in a few transactions instead of one per row: thousands of
 * single-row transactions kept the import waiting on IndexedDB for seconds.
 * Batches leave the event loop free in between, so progress can be shown.
 */
async function bulkAddInBatches<T>(table: Table<T, string>, rows: T[], size = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await table.bulkAdd(rows.slice(i, i + size));
  }
}

export class ImportService {
  /**
   * Calculate bounding box from export data elements
   */
  private calculateBoundingBox(data: ExportData): ImportBoundingBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of data.elements) {
      const x = el.position?.x || 0;
      const y = el.position?.y || 0;
      // Assume a default element size for bounding calculation
      const width = 150;
      const height = 60;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    // Handle empty data
    if (data.elements.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 };
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      elementCount: data.elements.length,
    };
  }

  /**
   * Parse a ZIP file and return the bounding box without importing
   * Used for placement preview before importing into existing dossier
   */
  async parseZipForPlacement(
    file: File,
    selection?: ZipTabSelection,
  ): Promise<{ boundingBox: ImportBoundingBox; success: boolean; error?: string; tabs?: ZipTabsOverview }> {
    try {
      // Security check
      if (file.size > ZIP_LIMITS.MAX_ZIP_SIZE) {
        return { boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 }, success: false, error: 'Fichier trop volumineux' };
      }

      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      if (Object.keys(zip.files).length > ZIP_LIMITS.MAX_FILES_IN_ZIP) {
        return { boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 }, success: false, error: 'Trop de fichiers dans l\'archive' };
      }

      // Read dossier.json (or legacy investigation.json)
      const jsonFile = zip.file('dossier.json') || zip.file('investigation.json');
      if (!jsonFile) {
        return { boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 }, success: false, error: 'Pas de fichier dossier.json' };
      }

      const content = await readZipEntryText(jsonFile, ZIP_LIMITS.MAX_JSON_SIZE);
      const data = JSON.parse(content) as ExportData;
      const boundingBox = this.calculateBoundingBox(selection ? selectZipTabs(data, selection) : data);

      return { boundingBox, success: true, tabs: zipTabsOverview(data) };
    } catch (error) {
      return {
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 },
        success: false,
        error: error instanceof ZipEntryTooLargeError
          ? 'Fichier dossier.json trop volumineux'
          : error instanceof Error ? error.message : 'Erreur de lecture'
      };
    }
  }

  /**
   * Import from ZIP file (full dossier export with assets)
   * Includes ZIP bomb protection and file validation
   * @param positionOffset - Optional offset to apply to all element positions (for importing into existing dossier)
   */
  async importFromZip(
    file: File,
    targetDossierId: DossierId,
    positionOffset?: Position,
    /** Only these tabs of the archive (into an open dossier) */
    selection?: ZipTabSelection,
    /** Stops the import between two media files, before the graph is written */
    signal?: AbortSignal,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      // ========== SECURITY CHECK: ZIP file size ==========
      if (file.size > ZIP_LIMITS.MAX_ZIP_SIZE) {
        const maxMB = (ZIP_LIMITS.MAX_ZIP_SIZE / 1024 / 1024).toFixed(0);
        result.errors.push(`Archive trop volumineuse. Taille max: ${maxMB} Mo`);
        return result;
      }

      const zip = await JSZip.loadAsync(file);

      // ========== SECURITY CHECK: File count in ZIP ==========
      const fileCount = Object.keys(zip.files).length;
      if (fileCount > ZIP_LIMITS.MAX_FILES_IN_ZIP) {
        result.errors.push(`Trop de fichiers dans l'archive. Max: ${ZIP_LIMITS.MAX_FILES_IN_ZIP}`);
        return result;
      }

      // Read the JSON metadata (or legacy investigation.json)
      const jsonFile = zip.file('dossier.json') || zip.file('investigation.json');
      if (!jsonFile) {
        result.errors.push('Archive invalide: dossier.json manquant');
        return result;
      }

      // ========== SECURITY CHECK: JSON size, enforced while decompressing ==========
      let jsonContent: string;
      try {
        jsonContent = await readZipEntryText(jsonFile, ZIP_LIMITS.MAX_JSON_SIZE);
      } catch (error) {
        if (!(error instanceof ZipEntryTooLargeError)) throw error;
        const maxMB = (ZIP_LIMITS.MAX_JSON_SIZE / 1024 / 1024).toFixed(0);
        result.errors.push(`Fichier JSON trop volumineux. Taille max: ${maxMB} Mo`);
        return result;
      }

      const rawData = JSON.parse(jsonContent);

      // Legacy compat: normalize 'investigation' key → 'dossier'
      if (rawData.investigation && !rawData.dossier) {
        rawData.dossier = rawData.investigation;
        delete rawData.investigation;
      }

      let data = rawData as ExportData;

      // Validate structure
      if (!data.version || !data.elements || !data.links) {
        result.errors.push('Format JSON invalide: champs manquants');
        return result;
      }

      // Chosen tabs only: their elements, links and files, before anything is written
      const tabsLeftOut = new Set(
        (selection ? (data.tabs ?? []).filter((tab) => !selection.tabIds.includes(tab.id)) : [])
          .flatMap((tab) => tab.memberElementIds ?? []),
      );
      if (selection) data = selectZipTabs(data, selection);

      // Check retention expiration on imported dossier
      if (data.dossier?.retentionDays && data.dossier.createdAt) {
        const createdAt = new Date(data.dossier.createdAt).getTime();
        const expiresAt = createdAt + data.dossier.retentionDays * 86400000;
        if (Date.now() > expiresAt) {
          const expiredDays = Math.ceil((Date.now() - expiresAt) / 86400000);
          result.warnings.push(
            i18next.t('import.retentionExpired', { ns: 'modals', days: expiredDays })
          );
        }
      }

      // ========== SECURITY CHECK: Element/Link/Asset counts ==========
      if (data.elements.length > ZIP_LIMITS.MAX_ELEMENTS) {
        result.errors.push(`Trop d'elements. Max: ${ZIP_LIMITS.MAX_ELEMENTS}`);
        return result;
      }
      if (data.links.length > ZIP_LIMITS.MAX_LINKS) {
        result.errors.push(`Trop de liens. Max: ${ZIP_LIMITS.MAX_LINKS}`);
        return result;
      }
      if (data.assets && data.assets.length > ZIP_LIMITS.MAX_ASSETS) {
        result.errors.push(`Trop de fichiers joints. Max: ${ZIP_LIMITS.MAX_ASSETS}`);
        return result;
      }

      // Create ID mappings (old ID -> new ID)
      const elementIdMap = new Map<ElementId, ElementId>();
      const assetIdMap = new Map<AssetId, AssetId>();
      const linkIdMap = new Map<LinkId, LinkId>();

      // Track total decompressed size for ZIP bomb detection
      let totalDecompressedSize = jsonContent.length;

      // Import assets from ZIP (if present)
      if (data.assets && data.assets.length > 0) {
        const mediaTotal = data.assets.length;
        let mediaDone = 0;
        reportMediaProgress(0, mediaTotal);
        for (const assetMeta of data.assets) {
          if (signal?.aborted) break;
          try {
            const assetFile = zip.file(assetMeta.archivePath);
            if (!assetFile) {
              result.warnings.push(`Asset introuvable dans l'archive: ${assetMeta.filename}`);
              continue;
            }

            // ========== SECURITY CHECK: Individual file size, enforced while decompressing ==========
            let arrayBuffer: ArrayBuffer;
            try {
              arrayBuffer = await readZipEntryBuffer(assetFile, ZIP_LIMITS.MAX_FILE_SIZE_IN_ZIP);
            } catch (error) {
              if (!(error instanceof ZipEntryTooLargeError)) throw error;
              const maxMB = (ZIP_LIMITS.MAX_FILE_SIZE_IN_ZIP / 1024 / 1024).toFixed(0);
              result.warnings.push(`Asset ignore (trop volumineux, max ${maxMB} Mo): ${assetMeta.filename}`);
              continue;
            }

            // ========== SECURITY CHECK: Total decompressed size ==========
            totalDecompressedSize += arrayBuffer.byteLength;
            if (totalDecompressedSize > ZIP_LIMITS.MAX_DECOMPRESSED_SIZE) {
              const maxGB = (ZIP_LIMITS.MAX_DECOMPRESSED_SIZE / 1024 / 1024 / 1024).toFixed(1);
              result.errors.push(`Taille totale decompresse trop importante. Max: ${maxGB} Go`);
              return result;
            }

            // ========== SECURITY CHECK: Compression ratio (ZIP bomb detection) ==========
            // Only check if we have meaningful compressed size
            if (file.size > 1024) {
              const compressionRatio = totalDecompressedSize / file.size;
              if (compressionRatio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
                result.errors.push(`Ratio de compression suspect (possible ZIP bomb)`);
                return result;
              }
            }

            const newAssetId = await this.importAssetFromBuffer(
              arrayBuffer,
              assetMeta,
              targetDossierId
            );
            assetIdMap.set(assetMeta.id, newAssetId);
            result.assetsImported++;
          } catch (error) {
            // Handle file validation errors specifically
            if (error instanceof FileValidationError) {
              result.warnings.push(`Asset ignore: ${assetMeta.filename} - ${error.message}`);
            } else {
              result.warnings.push(
                `Asset ignore: ${assetMeta.filename} - ${error instanceof Error ? error.message : 'Erreur'}`
              );
            }
          } finally {
            reportMediaProgress(++mediaDone, mediaTotal);
          }
        }
      }

      if (signal?.aborted) {
        result.errors.push('Import annulé');
        return result;
      }

      // Import tag families and custom icons, remapping icon references
      await this.importTagSetsAndCustomIcons(data, result);

      // Adopt the evaluation model of the archive (before elements land in the dossier)
      await this.applyImportedEvaluationModel(data.dossier?.evaluationModel, targetDossierId, result);

      // Import elements and links (with optional position offset)
      await this.importElementsAndLinks(data, targetDossierId, elementIdMap, assetIdMap, linkIdMap, result, positionOffset);

      // Chosen tabs merged into an open dossier: the caller fills its tabs of
      // the same names (through the tab store, synced); the rest goes to the open tab
      if (selection && selection.recreateTabs !== false && positionOffset && data.tabs && data.tabs.length > 0) {
        const inChosenTab = new Set(data.tabs.flatMap((tab) => tab.memberElementIds ?? []));
        result.linkedOnlyIds = data.elements
          .filter((el) => tabsLeftOut.has(el.id) && !inChosenTab.has(el.id))
          .map((el) => elementIdMap.get(el.id))
          .filter((id): id is ElementId => id !== undefined);
        result.tabPlan = data.tabs.map((importedTab) => ({
          name: importedTab.name || '',
          memberIds: (importedTab.memberElementIds || [])
            .map((oldId: ElementId) => elementIdMap.get(oldId))
            .filter((id): id is ElementId => id !== undefined),
        }));
      }
      await this.applyImportedDismissedSuggestions(data.dossier?.dismissedSuggestions, targetDossierId, elementIdMap);
      await this.applyImportedOptions(data.dossier?.options, targetDossierId);

      // Import report if present (with element and link ID remapping)
      if (data.report && data.report.sections && data.report.sections.length > 0 && (!selection || selection.includeReport)) {
        await this.importReport(data.report, targetDossierId, result, elementIdMap, linkIdMap);
      }

      // Plugin import hooks
      const importHooks = getPlugins('import:hooks');
      for (const hook of importHooks) {
        try {
          await hook.onImport(zip, targetDossierId);
        } catch (e) {
          console.warn(`Plugin import hook "${hook.name}" failed:`, e);
        }
      }

      result.success = true;
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetDossierId);
      }
    } catch (error) {
      if (error instanceof ImportValidationError) {
        result.errors.push(error.message);
      } else {
        result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }

    return result;
  }

  /**
   * Import from JSON file with auto-detection of format
   * Supports: ZeroNeurone native, OSINT Industries, Graph Palette (OI), PredicaGraph
   */
  async importFromJSON(
    content: string,
    targetDossierId: DossierId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      const data = JSON.parse(content);
      const format = this.detectJsonFormat(data);

      let importResult: ImportResult;
      switch (format) {
        case 'zeroneurone':
          importResult = await this.importNativeJSON(data, targetDossierId);
          break;
        case 'osint-industries':
          importResult = await importOsintIndustries(content, targetDossierId);
          break;
        case 'oi-palette':
          importResult = await importOIPalette(content, targetDossierId);
          break;
        case 'predicagraph':
          importResult = await importPredicaGraph(content, targetDossierId);
          break;
        case 'excalidraw':
          importResult = await importExcalidraw(content, targetDossierId);
          break;
        case 'stix2':
          importResult = await importSTIX2(content, targetDossierId);
          break;
        case 'gephi-lite':
          importResult = await importGephiLiteJSON(content, targetDossierId);
          break;
        case 'geojson':
          importResult = await this.importFromGeoJSON(content, targetDossierId);
          break;
        default:
          result.errors.push('Format JSON non reconnu. Formats supportés: ZeroNeurone, OSINT Industries, Graph Palette, PredicaGraph, Excalidraw, STIX 2.1, Gephi Lite, GeoJSON');
          return result;
      }

      if (importResult.success && importResult.linksImported > 0) {
        await this.applyImportDisplaySettings(targetDossierId);
      }
      return importResult;
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Detect the JSON format from parsed data
   */
  detectJsonFormat(data: unknown): 'zeroneurone' | 'osint-industries' | 'oi-palette' | 'predicagraph' | 'excalidraw' | 'stix2' | 'gephi-lite' | 'geojson' | 'unknown' {
    // Gephi Lite: { type: "gephi-lite", graphDataset: {...} }
    if (isGephiLiteFormat(data)) {
      return 'gephi-lite';
    }

    // Excalidraw: { type: "excalidraw", elements: [...] }
    if (isExcalidrawFormat(data)) {
      return 'excalidraw';
    }

    // STIX 2.1: { type: "bundle", objects: [...] }
    if (isSTIX2Format(data)) {
      return 'stix2';
    }

    // GeoJSON: { type: "FeatureCollection", features: [...] }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
        return 'geojson';
      }
    }

    // ZeroNeurone native: { version, elements, links }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      if (obj.version && obj.elements && obj.links) {
        return 'zeroneurone';
      }
    }

    // OSINT Industries: Array with objects having module, query, status
    if (isOsintIndustriesFormat(data)) {
      return 'osint-industries';
    }

    // Graph Palette (OI): { nodes } with textNode, moduleNode, imageNode types
    if (isOIPaletteFormat(data)) {
      return 'oi-palette';
    }

    // PredicaGraph: { nodes, edges } with node.data.type like person, location, social-*
    if (isPredicaGraphFormat(data)) {
      return 'predicagraph';
    }

    return 'unknown';
  }

  /**
   * Adopt the evaluation model of an imported ZeroNeurone archive, but only
   * for an empty dossier that never chose one (a dossier created for the
   * import). An existing dossier keeps its model: the user stays in control,
   * and a warning tells them the gradings may show as another scale.
   */
  private async applyImportedEvaluationModel(
    rawModel: unknown,
    targetDossierId: DossierId,
    result: ImportResult
  ): Promise<void> {
    if (!isEvaluationModel(rawModel)) return;
    const { useDossierStore } = await import('../stores/dossierStore');
    const store = useDossierStore.getState();
    const isOpen = store.currentDossier?.id === targetDossierId;
    const dossier = isOpen ? store.currentDossier : await db.dossiers.get(targetDossierId);
    if (!dossier || getEvaluationModel(dossier) === rawModel) return;

    const elementCount = isOpen
      ? store.elements.length
      : await db.elements.where('dossierId').equals(targetDossierId).count();
    if (dossier.evaluationModel === undefined && elementCount === 0) {
      if (isOpen) {
        await store.updateDossier(targetDossierId, { evaluationModel: rawModel });
      } else {
        await db.dossiers.update(targetDossierId, { evaluationModel: rawModel });
      }
      return;
    }
    result.warnings.push(
      i18next.t('import.evaluationModelKept', {
        ns: 'modals',
        imported: i18next.t(`evaluation.models.${rawModel}`, { ns: 'common' }),
        current: i18next.t(`evaluation.models.${getEvaluationModel(dossier)}`, { ns: 'common' }),
      })
    );
  }

  /**
   * Add the link suggestions dismissed in the imported dossier to the target's,
   * rewritten for the new element ids, so they don't come back after import.
   */
  private async applyImportedDismissedSuggestions(
    raw: unknown,
    targetDossierId: DossierId,
    elementIdMap: ReadonlyMap<string, string>
  ): Promise<void> {
    if (!Array.isArray(raw) || raw.length === 0) return;
    const imported = remapDismissedSuggestions(raw.filter((id): id is string => typeof id === 'string'), elementIdMap);
    if (imported.length === 0) return;
    const { useDossierStore } = await import('../stores/dossierStore');
    const store = useDossierStore.getState();
    const isOpen = store.currentDossier?.id === targetDossierId;
    const dossier = isOpen ? store.currentDossier : await db.dossiers.get(targetDossierId);
    if (!dossier) return;
    const dismissedSuggestions = [...new Set([...(dossier.dismissedSuggestions ?? []), ...imported])];
    if (isOpen) {
      await store.updateDossier(targetDossierId, { dismissedSuggestions });
    } else {
      await db.dossiers.update(targetDossierId, { dismissedSuggestions });
    }
  }

  /**
   * Take the dossier options of the archive the target has not set itself:
   * an option chosen in the target dossier always wins.
   */
  private async applyImportedOptions(raw: unknown, targetDossierId: DossierId): Promise<void> {
    if (!isDossierOptions(raw)) return;
    const { useDossierStore } = await import('../stores/dossierStore');
    const store = useDossierStore.getState();
    const isOpen = store.currentDossier?.id === targetDossierId;
    const dossier = isOpen ? store.currentDossier : await db.dossiers.get(targetDossierId);
    if (!dossier) return;
    const options = { ...raw, ...dossier.options };
    if (JSON.stringify(options) === JSON.stringify(dossier.options ?? {})) return;
    if (isOpen) {
      await store.updateDossier(targetDossierId, { options });
    } else {
      await db.dossiers.update(targetDossierId, { options });
    }
  }

  /**
   * Apply default display settings for imported dossiers
   * Sets curved links with auto anchoring for better readability
   */
  async applyImportDisplaySettings(dossierId: DossierId): Promise<void> {
    const dossier = await db.dossiers.get(dossierId);
    if (!dossier) return;
    await db.dossiers.update(dossierId, {
      settings: {
        ...dossier.settings,
        linkAnchorMode: 'auto',
        linkCurveMode: 'curved',
      },
    });
  }

  /**
   * Import the TagSets (tag families) and custom icons embedded in an export.
   *
   * - Custom icons are re-sanitized (defense in depth), deduplicated by
   *   content, and recreated under new IDs; `custom:<oldId>` references in
   *   element visuals and imported TagSets are remapped (mutates `data`).
   * - TagSets are created only when no local TagSet with the same name exists
   *   (the local version always wins — the user stays in control).
   */
  private async importTagSetsAndCustomIcons(
    data: ExportData,
    result: ImportResult
  ): Promise<void> {
    const iconIdMap = new Map<string, string>();

    // 1. Recreate custom icons (dedup by identical SVG content)
    if (data.customIcons && data.customIcons.length > 0) {
      for (const exported of data.customIcons.slice(0, 500)) {
        try {
          if (typeof exported.svg !== 'string' || typeof exported.id !== 'string') continue;
          const svg = sanitizeSvgIcon(exported.svg);
          const name = typeof exported.name === 'string' && exported.name.trim()
            ? exported.name.trim().slice(0, 100)
            : 'icon';
          const icon = await customIconRepository.create(name, svg);
          iconIdMap.set(exported.id, icon.id);
        } catch {
          result.warnings.push(
            i18next.t('import.customIconSkipped', { ns: 'modals', name: exported.name ?? '?' })
          );
        }
      }
    }

    const remapIcon = (iconName: string | null | undefined): string | null => {
      if (!iconName) return null;
      if (!isCustomIconName(iconName)) return iconName;
      const newId = iconIdMap.get(iconName.slice(CUSTOM_ICON_PREFIX.length));
      return newId ? `${CUSTOM_ICON_PREFIX}${newId}` : null;
    };

    // 2. Create missing TagSets (never overwrite an existing local family)
    if (data.tagSets && data.tagSets.length > 0) {
      for (const exported of data.tagSets) {
        try {
          if (typeof exported.name !== 'string' || !exported.name.trim()) continue;
          const existing = await tagSetRepository.getByName(exported.name);
          if (existing) continue;
          await tagSetRepository.create({
            name: exported.name.trim(),
            description: typeof exported.description === 'string' ? exported.description : '',
            defaultVisual: {
              color: exported.defaultVisual?.color ?? null,
              shape: exported.defaultVisual?.shape ?? null,
              icon: remapIcon(exported.defaultVisual?.icon),
            },
            suggestedProperties: Array.isArray(exported.suggestedProperties)
              ? exported.suggestedProperties
              : [],
            isBuiltIn: false,
          });
        } catch (e) {
          console.warn(`TagSet import failed for "${exported.name}":`, e);
        }
      }
    }

    // 3. Remap custom icon references carried by element visuals
    if (iconIdMap.size > 0) {
      for (const el of data.elements) {
        if (el.visual && isCustomIconName(el.visual.icon)) {
          el.visual.icon = remapIcon(el.visual.icon);
        }
      }
    }

    // Refresh in-memory stores so the imported families/icons show up
    try {
      const tagSets = await tagSetRepository.getAll();
      useTagSetStore.setState({ tagSets: new Map(tagSets.map(t => [t.id, t])) });
      const icons = await customIconRepository.getAll();
      useCustomIconStore.setState({ icons: new Map(icons.map(i => [i.id, i])) });
    } catch { /* stores refresh on next load */ }
  }

  /**
   * Import native ZeroNeurone JSON format (without assets)
   */
  private async importNativeJSON(
    data: ExportData,
    targetDossierId: DossierId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      // Validate structure
      if (!data.version || !data.elements || !data.links) {
        result.errors.push('Format JSON invalide: champs manquants');
        return result;
      }

      // Create ID mappings
      const elementIdMap = new Map<ElementId, ElementId>();
      const assetIdMap = new Map<AssetId, AssetId>(); // Will be empty for JSON import
      const linkIdMap = new Map<LinkId, LinkId>();

      // Import tag families and custom icons, remapping icon references
      await this.importTagSetsAndCustomIcons(data, result);

      // Adopt the evaluation model of the file (before elements land in the dossier)
      await this.applyImportedEvaluationModel(data.dossier?.evaluationModel, targetDossierId, result);

      // Import elements and links (no assets for JSON-only import)
      await this.importElementsAndLinks(data, targetDossierId, elementIdMap, assetIdMap, linkIdMap, result);
      await this.applyImportedDismissedSuggestions(data.dossier?.dismissedSuggestions, targetDossierId, elementIdMap);
      await this.applyImportedOptions(data.dossier?.options, targetDossierId);

      // Import report if present (with element and link ID remapping)
      if (data.report && data.report.sections && data.report.sections.length > 0) {
        await this.importReport(data.report, targetDossierId, result, elementIdMap, linkIdMap);
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Import from OSINTracker file (.osintracker)
   */
  async importFromOsintracker(
    content: string,
    targetDossierId: DossierId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      // Parse the OSINTracker file (async to load type mappings)
      const parsed = await parseOsintrackerFile(content);

      // Create ID mappings (original ID -> new ID)
      const elementIdMap = new Map<string, ElementId>();
      const assetIdMap = new Map<string, AssetId>();

      // Import assets first (images from base64)
      for (const assetData of parsed.assets) {
        try {
          const file = dataUrlToFile(assetData.dataUrl, assetData.filename);
          const asset = await fileService.saveAsset(targetDossierId, file);
          assetIdMap.set(assetData.originalElementId, asset.id);
          result.assetsImported++;
        } catch (error) {
          result.warnings.push(
            `Asset ignoré: ${assetData.filename} - ${error instanceof Error ? error.message : 'Erreur'}`
          );
        }
      }

      // Import elements
      for (const parsedElement of parsed.elements) {
        const newId = generateUUID();
        elementIdMap.set(parsedElement.originalId, newId);

        // Get asset ID if this element had an image
        const assetId = assetIdMap.get(parsedElement.originalId);

        const element: Element = {
          id: newId,
          dossierId: targetDossierId,
          label: parsedElement.label,
          notes: parsedElement.notes,
          tags: parsedElement.tags,
          properties: parsedElement.properties,
          confidence: parsedElement.confidence,
          source: parsedElement.source || '',
          date: parsedElement.date,
          dateRange: parsedElement.dateRange,
          position: parsedElement.position,
          isPositionLocked: parsedElement.isPositionLocked ?? false,
          geo: normalizeGeo(parsedElement.geo),
          visual: parsedElement.visual,
          assetIds: assetId ? [assetId] : [],
          parentGroupId: parsedElement.parentGroupId,
          isGroup: parsedElement.isGroup,
          isAnnotation: parsedElement.isAnnotation ?? false,
          childIds: parsedElement.childIds,
          events: parsedElement.events,
          createdAt: parsedElement.createdAt,
          updatedAt: parsedElement.updatedAt,
        };

        await db.elements.add(element);
        result.elementsImported++;
      }

      // Import links with mapped IDs
      for (const parsedLink of parsed.links) {
        const fromId = elementIdMap.get(parsedLink.originalFromId);
        const toId = elementIdMap.get(parsedLink.originalToId);

        if (!fromId || !toId) {
          result.warnings.push(
            `Lien ignoré: éléments source/cible non trouvés (${parsedLink.label})`
          );
          continue;
        }

        const link: Link = {
          id: generateUUID(),
          dossierId: targetDossierId,
          fromId,
          toId,
          sourceHandle: parsedLink.sourceHandle,
          targetHandle: parsedLink.targetHandle,
          label: parsedLink.label,
          notes: '',
          tags: parsedLink.tags || [],
          properties: parsedLink.properties,
          confidence: parsedLink.confidence,
          source: parsedLink.source || '',
          date: parsedLink.date,
          dateRange: parsedLink.dateRange,
          directed: parsedLink.direction !== 'none',
          direction: parsedLink.direction,
          visual: parsedLink.visual,
          curveOffset: { x: 0, y: 0 },
          createdAt: parsedLink.createdAt,
          updatedAt: parsedLink.updatedAt,
        };

        await db.links.add(link);
        result.linksImported++;
      }

      // Update dossier with OSINTracker name and description
      await db.dossiers.update(targetDossierId, {
        name: parsed.dossier.name,
        description: parsed.dossier.description,
        updatedAt: new Date(),
      });

      // Add stats to warnings if there were skipped items
      if (parsed.stats.skippedElements > 0) {
        result.warnings.push(`${parsed.stats.skippedElements} élément(s) ignoré(s) (sans position)`);
      }
      if (parsed.stats.skippedLinks > 0) {
        result.warnings.push(`${parsed.stats.skippedLinks} lien(s) ignoré(s) (éléments invalides)`);
      }

      result.success = true;
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetDossierId);
      }
    } catch (error) {
      result.errors.push(
        `Erreur d'import OSINTracker: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }

    return result;
  }

  /**
   * Properties of a GeoJSON FeatureCollection that hold a value in at least one
   * feature, in file order, so the user can pick the one that names elements.
   * `suggested` is the first usual name key (name, nom, label…) found, else the
   * first field. Returns null when the content is not a FeatureCollection.
   */
  analyzeGeoJSONFields(content: string): ReturnType<typeof analyzeGeoJSONFieldsImpl> {
    return analyzeGeoJSONFieldsImpl(content);
  }

  /**
   * Import from GeoJSON file (FeatureCollection with Points and Polygons)
   * Points → elements with geo point, Polygons → elements with geo zone.
   * `labelField` names the property used as element label; features where it
   * is empty fall back to the usual name keys. `fields`, when given, lists the
   * properties to import: the others are ignored (the label field is kept).
   */
  importFromGeoJSON(
    content: string,
    targetDossierId: DossierId,
    options: { labelField?: string; fields?: string[]; tag?: string } = {}
  ): Promise<ImportResult> {
    return importFromGeoJSONImpl(content, targetDossierId, options);
  }
  /**
   * Import from GraphML file (graph format compatible with Gephi, yEd, etc.)
   */
  importFromGraphML(
    content: string,
    targetDossierId: DossierId
  ): Promise<ImportResult> {
    return importFromGraphMLImpl(this, content, targetDossierId);
  }

  /**
   * Import elements and links from export data
   * @param positionOffset - Optional offset to apply to all element positions
   */
  private async importElementsAndLinks(
    data: ExportData,
    targetDossierId: DossierId,
    elementIdMap: Map<ElementId, ElementId>,
    assetIdMap: Map<AssetId, AssetId>,
    linkIdMap: Map<LinkId, LinkId>,
    result: ImportResult,
    positionOffset?: Position
  ): Promise<void> {
    // Archives recording their zone (v2.61.0+) hold exact date instants
    const exactDates = Boolean(data.timeZone);

    // First pass: create ID mappings for all elements
    for (const importedElement of data.elements) {
      const newId = generateUUID();
      elementIdMap.set(importedElement.id, newId);
    }

    // Second pass: import elements with mapped IDs, written in batches below
    const elements: Element[] = [];
    for (const importedElement of data.elements) {
      const newId = elementIdMap.get(importedElement.id)!;

      // Map old asset IDs to new ones (only those that were successfully imported)
      const newAssetIds = (importedElement.assetIds || [])
        .map((oldId: AssetId) => assetIdMap.get(oldId))
        .filter((id): id is AssetId => id !== undefined);

      // Map parentGroupId to new ID
      const newParentGroupId = importedElement.parentGroupId
        ? elementIdMap.get(importedElement.parentGroupId) || null
        : null;

      // Map childIds to new IDs
      const newChildIds = (importedElement.childIds || [])
        .map((oldId: ElementId) => elementIdMap.get(oldId))
        .filter((id): id is ElementId => id !== undefined);

      // Apply position offset if provided, but ONLY to top-level elements
      // Children of groups have positions relative to their parent, so we don't offset them
      const shouldApplyOffset = positionOffset && !importedElement.parentGroupId;
      const position = shouldApplyOffset
        ? {
            x: (importedElement.position?.x || 0) + positionOffset.x,
            y: (importedElement.position?.y || 0) + positionOffset.y,
          }
        : importedElement.position;

      const element: Element = {
        ...importedElement,
        id: newId,
        dossierId: targetDossierId,
        position,
        assetIds: newAssetIds,
        properties: importedProperties(importedElement.properties, exactDates),
        events: Array.isArray(importedElement.events)
          ? importedElement.events.map((ev) => ({ ...ev, properties: importedProperties(ev.properties, exactDates) }))
          : importedElement.events,
        geo: normalizeGeo(importedElement.geo),
        evaluation: sanitizeEvaluation(importedElement.evaluation),
        date: importedElement.date ? new Date(importedElement.date) : null,
        dateRange: importedElement.dateRange
          ? {
              ...importedElement.dateRange, // keeps precision / approximate
              start: importedElement.dateRange.start
                ? new Date(importedElement.dateRange.start)
                : null,
              end: importedElement.dateRange.end
                ? new Date(importedElement.dateRange.end)
                : null,
            }
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentGroupId: newParentGroupId,
        childIds: newChildIds,
      };

      elements.push(element);
    }
    await bulkAddInBatches(db.elements, elements);
    result.elementsImported += elements.length;

    // Import links with updated element IDs
    const links: Link[] = [];
    for (const importedLink of data.links) {
      const newFromId = elementIdMap.get(importedLink.fromId);
      const newToId = elementIdMap.get(importedLink.toId);

      if (!newFromId || !newToId) {
        result.warnings.push(
          `Lien ignore: elements source/cible non trouves (${importedLink.label})`
        );
        continue;
      }

      const newLinkId = generateUUID();
      // Store mapping for report content remapping
      linkIdMap.set(importedLink.id, newLinkId as LinkId);

      const link: Link = {
        ...importedLink,
        id: newLinkId,
        dossierId: targetDossierId,
        fromId: newFromId,
        toId: newToId,
        properties: importedProperties(importedLink.properties, exactDates),
        evaluation: sanitizeEvaluation(importedLink.evaluation),
        date: importedLink.date ? new Date(importedLink.date) : null,
        // Handle direction with backwards compatibility
        direction: importedLink.direction || (importedLink.directed ? 'forward' : 'none'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      links.push(link);
    }
    await bulkAddInBatches(db.links, links);
    result.linksImported += links.length;

    // Import tabs with remapped element IDs (only for new dossier, not merge)
    // When merging (positionOffset is set), imported elements go to the active tab instead
    if (data.tabs && data.tabs.length > 0 && !positionOffset) {
      for (const importedTab of data.tabs) {
        const newTabId = generateUUID() as TabId;
        const newMemberIds = (importedTab.memberElementIds || [])
          .map((oldId: ElementId) => elementIdMap.get(oldId))
          .filter((id): id is ElementId => id !== undefined);
        const newExcludedIds = (importedTab.excludedElementIds || [])
          .map((oldId: ElementId) => elementIdMap.get(oldId))
          .filter((id): id is ElementId => id !== undefined);

        const tab: CanvasTab = {
          id: newTabId,
          dossierId: targetDossierId,
          name: importedTab.name || '',
          order: importedTab.order ?? 0,
          memberElementIds: newMemberIds,
          excludedElementIds: newExcludedIds,
          viewport: { x: 0, y: 0, zoom: 1 }, // Viewport is local, reset on import
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.canvasTabs.add(tab);
      }
    }

    // Import saved views with remapped element IDs (new dossier only, not merge)
    if (data.views && data.views.length > 0 && !positionOffset) {
      for (const importedView of data.views) {
        const newHidden = (importedView.hiddenElementIds || [])
          .map((oldId: ElementId) => elementIdMap.get(oldId))
          .filter((id): id is ElementId => id !== undefined);
        const newPositions = (importedView.elementPositions || [])
          .map((p) => {
            const newId = elementIdMap.get(p.id);
            return newId ? { id: newId, position: p.position } : null;
          })
          .filter((p): p is { id: ElementId; position: Position } => p !== null);

        const view: View = {
          ...importedView,
          id: generateUUID() as ViewId,
          dossierId: targetDossierId,
          hiddenElementIds: newHidden,
          elementPositions: newPositions.length > 0 ? newPositions : undefined,
          // Tab IDs are regenerated on import and not tracked, so reset to the
          // global "All" view rather than dangle on a stale tab id.
          activeTabId: null,
          viewport: { x: 0, y: 0, zoom: 1 }, // Viewport is local, reset on import
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.views.add(view);
      }
    }

    // Import saved ZNQuery queries (new dossier only). Queries are field/tag/value
    // based (no element IDs), so only id + dossierId are regenerated.
    if (data.queries && data.queries.length > 0 && !positionOffset) {
      for (const importedQuery of data.queries) {
        const query: SavedQuery = {
          ...importedQuery,
          id: generateUUID() as SavedQueryId,
          dossierId: targetDossierId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.savedQueries.add(query);
      }
    }

    // Import comments (new dossier only) with remapped targets. Comments are
    // normally Y.Doc-only; they're staged in Dexie here and migrated to the
    // Y.Doc on first load (see the comments migration in loadDossier).
    if (data.comments && data.comments.length > 0 && !positionOffset) {
      for (const importedComment of data.comments) {
        const newTargetId = importedComment.targetType === 'link'
          ? linkIdMap.get(importedComment.targetId)
          : elementIdMap.get(importedComment.targetId);
        if (!newTargetId) continue; // target didn't survive import — drop the comment

        const comment: Comment = {
          ...importedComment,
          id: generateUUID() as CommentId,
          dossierId: targetDossierId,
          targetId: newTargetId,
        };
        await db.comments.add(comment);
      }
    }

    // Restore recent ZNQuery history (session-level) into the target dossier's
    // own history, most-recent-first, deduplicated, capped at 5.
    if (data.queryHistory && data.queryHistory.length > 0 && !positionOffset) {
      useQueryStore.getState().mergeRecentQueries(targetDossierId, data.queryHistory);
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });
  }

  /**
   * Import a report with its sections
   */
  private async importReport(
    importedReport: Report,
    targetDossierId: DossierId,
    result: ImportResult,
    elementIdMap?: Map<ElementId, ElementId>,
    linkIdMap?: Map<LinkId, LinkId>
  ): Promise<void> {
    try {
      // Check if a report already exists for this dossier
      const existingReports = await db.reports
        .where({ dossierId: targetDossierId })
        .toArray();

      if (existingReports.length > 0) {
        // Report already exists, skip import but add warning
        result.warnings.push('Un rapport existe déjà pour cette dossier, rapport non importé');
        return;
      }

      // Create new report with new IDs and remapped content
      const newReportId = generateUUID();
      const newSections: ReportSection[] = importedReport.sections.map((section, index) => ({
        ...section,
        id: generateUUID() as ReportSectionId,
        order: section.order ?? index,
        // Remap element and link references in content (e.g., [[Label|oldId]] -> [[Label|newId]])
        content: this.remapElementReferencesInContent(section.content, elementIdMap, linkIdMap),
        // Remap elementIds array if present
        elementIds: section.elementIds?.map(id => elementIdMap?.get(id as ElementId) || id) || [],
      }));

      const report: Report = {
        id: newReportId,
        dossierId: targetDossierId,
        title: importedReport.title || 'Rapport importé',
        sections: newSections,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.reports.add(report);
      result.reportImported = true;
    } catch (error) {
      result.warnings.push(
        `Rapport non importé: ${error instanceof Error ? error.message : 'Erreur'}`
      );
    }
  }

  /**
   * Remap element and link references in Markdown content from old IDs to new IDs
   * Format: [[Label|oldId]] -> [[Label|newId]]
   */
  private remapElementReferencesInContent(
    content: string,
    elementIdMap?: Map<ElementId, ElementId>,
    linkIdMap?: Map<LinkId, LinkId>
  ): string {
    if (!content) {
      return content;
    }

    const hasElementMap = elementIdMap && elementIdMap.size > 0;
    const hasLinkMap = linkIdMap && linkIdMap.size > 0;

    if (!hasElementMap && !hasLinkMap) {
      return content;
    }

    return content.replace(reportRefRegex(), (match, label, oldId) => {
      // Try element map first
      if (hasElementMap) {
        const newElementId = elementIdMap!.get(oldId as ElementId)
          || elementIdMap!.get(oldId.toLowerCase() as ElementId);
        if (newElementId) {
          return `[[${label}|${newElementId}]]`;
        }
      }

      // Then try link map
      if (hasLinkMap) {
        const newLinkId = linkIdMap!.get(oldId as LinkId)
          || linkIdMap!.get(oldId.toLowerCase() as LinkId);
        if (newLinkId) {
          return `[[${label}|${newLinkId}]]`;
        }
      }

      // If no mapping found, keep original (will show as deleted)
      return match;
    });
  }

  /**
   * Import a single asset from ArrayBuffer
   */
  private async importAssetFromBuffer(
    arrayBuffer: ArrayBuffer,
    assetMeta: ExportedAssetMeta,
    targetDossierId: DossierId
  ): Promise<AssetId> {
    // Create a File object from the buffer
    const file = new File([arrayBuffer], assetMeta.filename, {
      type: assetMeta.mimeType,
    });

    // Use fileService to save the asset (handles deduplication, thumbnails, etc.)
    const asset = await fileService.saveAsset(targetDossierId, file);

    return asset.id;
  }

  /**
   * Import unified CSV file with type column (elements and links in one file)
   */
  importFromCSV(
    content: string,
    targetDossierId: DossierId,
    options: Partial<CSVImportOptions> = {}
  ): Promise<ImportResult> {
    return importFromCSV(this, content, targetDossierId, options);
  }

  /**
   * Import from genealogy file (GEDCOM 5.5.1/7.0, GeneWeb .gw)
   */
  async importFromGenealogy(
    file: File,
    targetDossierId: DossierId,
    options?: Partial<GenealogyImportOptions>
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      const importData = await importGenealogyFile(file, targetDossierId, options);

      // Save elements to database
      for (const element of importData.elements) {
        if (element.id) {
          await db.elements.add(element as Element);
          result.elementsImported++;
        }
      }

      // Save links to database
      for (const link of importData.links) {
        if (link.id && link.fromId && link.toId) {
          await db.links.add(link as Link);
          result.linksImported++;
        }
      }

      // Update dossier timestamp
      await db.dossiers.update(targetDossierId, {
        updatedAt: new Date(),
      });

      result.errors = importData.result.errors;
      result.warnings = importData.result.warnings;
      result.success = result.elementsImported > 0;

      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetDossierId);
      }
    } catch (error) {
      result.errors.push(`Erreur d'import généalogie: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Read file content as text
   */
  readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsText(file);
    });
  }
}

export const importService = new ImportService();

/** Retourne true si le File est un .znzip (archive chiffrée) */
export async function isEncryptedZipFile(file: File): Promise<boolean> {
  const slice = await file.slice(0, 4).arrayBuffer();
  return isEncryptedZipBuffer(slice);
}

/**
 * Déchiffre un fichier .znzip avec le mot de passe fourni.
 * Retourne un File .zip standard prêt à être passé à importService.importFromZip().
 * Lance si le mot de passe est incorrect.
 */
export async function decryptZipFile(file: File, password: string): Promise<File> {
  const buf = await file.arrayBuffer();
  const plainBuf = await decryptZip(buf, password);
  const zipName = file.name.replace(/\.znzip$/i, '.zip');
  return new File([plainBuf], zipName, { type: 'application/zip' });
}
