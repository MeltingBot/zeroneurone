import JSZip from 'jszip';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  InvestigationId,
  Element,
  ElementId,
  Link,
  AssetId,
  Position,
  GeoCoordinates,
  Confidence,
  ElementShape,
  LinkStyle,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ExportData, ExportedAssetMeta } from './exportService';
import { fileService, FileValidationError } from './fileService';
import { parseOsintrackerFile, dataUrlToFile } from './importOsintracker';

// ============================================================================
// SECURITY LIMITS FOR ZIP IMPORTS (ZIP bomb protection)
// ============================================================================
const ZIP_LIMITS = {
  // Maximum ZIP file size: 500 MB
  MAX_ZIP_SIZE: 500 * 1024 * 1024,

  // Maximum total decompressed size: 2 GB (ZIP bomb protection)
  MAX_DECOMPRESSED_SIZE: 2 * 1024 * 1024 * 1024,

  // Maximum number of files in ZIP
  MAX_FILES_IN_ZIP: 10000,

  // Maximum single file size inside ZIP: 100 MB (matches file upload limit)
  MAX_FILE_SIZE_IN_ZIP: 100 * 1024 * 1024,

  // Maximum JSON content size: 50 MB
  MAX_JSON_SIZE: 50 * 1024 * 1024,

  // Maximum elements/links in a single import
  MAX_ELEMENTS: 50000,
  MAX_LINKS: 100000,
  MAX_ASSETS: 5000,

  // Compression ratio threshold for ZIP bomb detection
  MAX_COMPRESSION_RATIO: 100, // If decompressed/compressed > 100, suspicious
};

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

export type ImportFormat = 'json' | 'csv' | 'zip';

export interface ImportResult {
  success: boolean;
  elementsImported: number;
  linksImported: number;
  assetsImported: number;
  errors: string[];
  warnings: string[];
}

export interface CSVImportOptions {
  hasHeaders: boolean;
  delimiter: string;
  createMissingElements: boolean;
}

class ImportService {
  /**
   * Import from ZIP file (full investigation export with assets)
   * Includes ZIP bomb protection and file validation
   */
  async importFromZip(
    file: File,
    targetInvestigationId: InvestigationId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
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

      // ========== SECURITY CHECK: Estimate decompressed size ==========
      let estimatedDecompressedSize = 0;
      for (const [, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
          // JSZip stores _data with uncompressed size in some versions
          // We'll track actual size as we decompress files
          estimatedDecompressedSize += (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
        }
      }

      // Read the JSON metadata
      const jsonFile = zip.file('investigation.json');
      if (!jsonFile) {
        result.errors.push('Archive invalide: investigation.json manquant');
        return result;
      }

      const jsonContent = await jsonFile.async('string');

      // ========== SECURITY CHECK: JSON size ==========
      if (jsonContent.length > ZIP_LIMITS.MAX_JSON_SIZE) {
        const maxMB = (ZIP_LIMITS.MAX_JSON_SIZE / 1024 / 1024).toFixed(0);
        result.errors.push(`Fichier JSON trop volumineux. Taille max: ${maxMB} Mo`);
        return result;
      }

      const data = JSON.parse(jsonContent) as ExportData;

      // Validate structure
      if (!data.version || !data.elements || !data.links) {
        result.errors.push('Format JSON invalide: champs manquants');
        return result;
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

      // Track total decompressed size for ZIP bomb detection
      let totalDecompressedSize = jsonContent.length;

      // Import assets from ZIP (if present)
      if (data.assets && data.assets.length > 0) {
        for (const assetMeta of data.assets) {
          try {
            const assetFile = zip.file(assetMeta.archivePath);
            if (!assetFile) {
              result.warnings.push(`Asset introuvable dans l'archive: ${assetMeta.filename}`);
              continue;
            }

            const arrayBuffer = await assetFile.async('arraybuffer');

            // ========== SECURITY CHECK: Individual file size ==========
            if (arrayBuffer.byteLength > ZIP_LIMITS.MAX_FILE_SIZE_IN_ZIP) {
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
              targetInvestigationId
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
          }
        }
      }

      // Import elements and links
      await this.importElementsAndLinks(data, targetInvestigationId, elementIdMap, assetIdMap, result);

      result.success = true;
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
   * Import from JSON file (without assets)
   */
  async importFromJSON(
    content: string,
    targetInvestigationId: InvestigationId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      errors: [],
      warnings: [],
    };

    try {
      const data = JSON.parse(content) as ExportData;

      // Validate structure
      if (!data.version || !data.elements || !data.links) {
        result.errors.push('Format JSON invalide: champs manquants');
        return result;
      }

      // Create ID mappings
      const elementIdMap = new Map<ElementId, ElementId>();
      const assetIdMap = new Map<AssetId, AssetId>(); // Will be empty for JSON import

      // Import elements and links (no assets for JSON-only import)
      await this.importElementsAndLinks(data, targetInvestigationId, elementIdMap, assetIdMap, result);

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
    targetInvestigationId: InvestigationId
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
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
          const asset = await fileService.saveAsset(targetInvestigationId, file);
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
          investigationId: targetInvestigationId,
          label: parsedElement.label,
          notes: parsedElement.notes,
          tags: parsedElement.tags,
          properties: parsedElement.properties,
          confidence: parsedElement.confidence,
          source: parsedElement.source || '',
          date: parsedElement.date,
          dateRange: parsedElement.dateRange,
          position: parsedElement.position,
          geo: parsedElement.geo,
          visual: parsedElement.visual,
          assetIds: assetId ? [assetId] : [],
          parentGroupId: parsedElement.parentGroupId,
          isGroup: parsedElement.isGroup,
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
          investigationId: targetInvestigationId,
          fromId,
          toId,
          sourceHandle: parsedLink.sourceHandle,
          targetHandle: parsedLink.targetHandle,
          label: parsedLink.label,
          notes: '',
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

      // Update investigation with OSINTracker name and description
      await db.investigations.update(targetInvestigationId, {
        name: parsed.investigation.name,
        description: parsed.investigation.description,
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
    } catch (error) {
      result.errors.push(
        `Erreur d'import OSINTracker: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }

    return result;
  }

  /**
   * Import elements and links from export data
   */
  private async importElementsAndLinks(
    data: ExportData,
    targetInvestigationId: InvestigationId,
    elementIdMap: Map<ElementId, ElementId>,
    assetIdMap: Map<AssetId, AssetId>,
    result: ImportResult
  ): Promise<void> {
    // Import elements with updated asset IDs
    for (const importedElement of data.elements) {
      const newId = generateUUID();
      elementIdMap.set(importedElement.id, newId);

      // Map old asset IDs to new ones (only those that were successfully imported)
      const newAssetIds = (importedElement.assetIds || [])
        .map((oldId: AssetId) => assetIdMap.get(oldId))
        .filter((id): id is AssetId => id !== undefined);

      const element: Element = {
        ...importedElement,
        id: newId,
        investigationId: targetInvestigationId,
        assetIds: newAssetIds,
        date: importedElement.date ? new Date(importedElement.date) : null,
        dateRange: importedElement.dateRange
          ? {
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
        parentGroupId: null, // Reset group relations
        childIds: [],
      };

      await db.elements.add(element);
      result.elementsImported++;
    }

    // Import links with updated element IDs
    for (const importedLink of data.links) {
      const newFromId = elementIdMap.get(importedLink.fromId);
      const newToId = elementIdMap.get(importedLink.toId);

      if (!newFromId || !newToId) {
        result.warnings.push(
          `Lien ignore: elements source/cible non trouves (${importedLink.label})`
        );
        continue;
      }

      const link: Link = {
        ...importedLink,
        id: generateUUID(),
        investigationId: targetInvestigationId,
        fromId: newFromId,
        toId: newToId,
        date: importedLink.date ? new Date(importedLink.date) : null,
        // Handle direction with backwards compatibility
        direction: importedLink.direction || (importedLink.directed ? 'forward' : 'none'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      result.linksImported++;
    }

    // Update investigation timestamp
    await db.investigations.update(targetInvestigationId, {
      updatedAt: new Date(),
    });
  }

  /**
   * Import a single asset from ArrayBuffer
   */
  private async importAssetFromBuffer(
    arrayBuffer: ArrayBuffer,
    assetMeta: ExportedAssetMeta,
    targetInvestigationId: InvestigationId
  ): Promise<AssetId> {
    // Create a File object from the buffer
    const file = new File([arrayBuffer], assetMeta.filename, {
      type: assetMeta.mimeType,
    });

    // Use fileService to save the asset (handles deduplication, thumbnails, etc.)
    const asset = await fileService.saveAsset(targetInvestigationId, file);

    return asset.id;
  }

  /**
   * Import elements from CSV file
   */
  async importElementsFromCSV(
    content: string,
    targetInvestigationId: InvestigationId,
    options: Partial<CSVImportOptions> = {}
  ): Promise<ImportResult> {
    const opts: CSVImportOptions = {
      hasHeaders: true,
      delimiter: ',',
      createMissingElements: true,
      ...options,
    };

    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      errors: [],
      warnings: [],
    };

    try {
      const lines = content.split('\n').filter((line) => line.trim());
      if (lines.length === 0) {
        result.errors.push('Fichier CSV vide');
        return result;
      }

      let headers: string[];
      let dataLines: string[];

      if (opts.hasHeaders) {
        headers = this.parseCSVLine(lines[0], opts.delimiter);
        dataLines = lines.slice(1);
      } else {
        // Default headers for elements
        headers = ['label', 'notes', 'tags', 'positionX', 'positionY'];
        dataLines = lines;
      }

      // Find column indices
      const labelIdx = headers.findIndex((h) => h.toLowerCase() === 'label');
      const notesIdx = headers.findIndex((h) => h.toLowerCase() === 'notes');
      const tagsIdx = headers.findIndex((h) => h.toLowerCase() === 'tags');
      const posXIdx = headers.findIndex((h) => h.toLowerCase().includes('positionx') || h.toLowerCase() === 'x');
      const posYIdx = headers.findIndex((h) => h.toLowerCase().includes('positiony') || h.toLowerCase() === 'y');
      const geoLatIdx = headers.findIndex((h) => h.toLowerCase().includes('lat'));
      const geoLngIdx = headers.findIndex((h) => h.toLowerCase().includes('lng') || h.toLowerCase().includes('lon'));
      const dateIdx = headers.findIndex((h) => h.toLowerCase() === 'date');
      const confidenceIdx = headers.findIndex((h) => h.toLowerCase() === 'confidence');
      const sourceIdx = headers.findIndex((h) => h.toLowerCase() === 'source');
      const colorIdx = headers.findIndex((h) => h.toLowerCase() === 'color');
      const shapeIdx = headers.findIndex((h) => h.toLowerCase() === 'shape');

      if (labelIdx === -1) {
        result.errors.push('Colonne "label" requise non trouvee');
        return result;
      }

      // Process each row
      let rowNum = opts.hasHeaders ? 2 : 1;
      for (const line of dataLines) {
        try {
          const values = this.parseCSVLine(line, opts.delimiter);
          if (values.length === 0) continue;

          const label = values[labelIdx]?.trim();
          if (!label) {
            result.warnings.push(`Ligne ${rowNum}: label vide, ligne ignoree`);
            rowNum++;
            continue;
          }

          // Parse position
          const position: Position = {
            x: posXIdx >= 0 ? parseFloat(values[posXIdx]) || Math.random() * 500 : Math.random() * 500,
            y: posYIdx >= 0 ? parseFloat(values[posYIdx]) || Math.random() * 500 : Math.random() * 500,
          };

          // Parse geo coordinates
          let geo: GeoCoordinates | null = null;
          if (geoLatIdx >= 0 && geoLngIdx >= 0) {
            const lat = parseFloat(values[geoLatIdx]);
            const lng = parseFloat(values[geoLngIdx]);
            if (!isNaN(lat) && !isNaN(lng)) {
              geo = { lat, lng };
            }
          }

          // Parse date
          let date: Date | null = null;
          if (dateIdx >= 0 && values[dateIdx]) {
            const parsed = new Date(values[dateIdx]);
            if (!isNaN(parsed.getTime())) {
              date = parsed;
            }
          }

          // Parse confidence
          let confidence: Confidence | null = null;
          if (confidenceIdx >= 0 && values[confidenceIdx]) {
            const conf = parseInt(values[confidenceIdx]);
            if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
              confidence = conf as Confidence;
            }
          }

          // Parse tags
          const tags: string[] = tagsIdx >= 0 && values[tagsIdx]
            ? values[tagsIdx].split(';').map((t) => t.trim()).filter(Boolean)
            : [];

          const element: Element = {
            id: generateUUID(),
            investigationId: targetInvestigationId,
            label,
            notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
            tags,
            properties: [],
            confidence,
            source: sourceIdx >= 0 ? values[sourceIdx] || '' : '',
            date,
            dateRange: null,
            position,
            geo,
            visual: {
              ...DEFAULT_ELEMENT_VISUAL,
              color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_ELEMENT_VISUAL.color,
              shape: shapeIdx >= 0 && this.isValidShape(values[shapeIdx])
                ? (values[shapeIdx] as ElementShape)
                : DEFAULT_ELEMENT_VISUAL.shape,
            },
            assetIds: [],
            parentGroupId: null,
            isGroup: false,
            childIds: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await db.elements.add(element);
          result.elementsImported++;
        } catch (error) {
          result.warnings.push(`Ligne ${rowNum}: ${error instanceof Error ? error.message : 'Erreur'}`);
        }
        rowNum++;
      }

      // Update investigation timestamp
      await db.investigations.update(targetInvestigationId, {
        updatedAt: new Date(),
      });

      result.success = result.elementsImported > 0;
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Import links from CSV file
   */
  async importLinksFromCSV(
    content: string,
    targetInvestigationId: InvestigationId,
    options: Partial<CSVImportOptions> = {}
  ): Promise<ImportResult> {
    const opts: CSVImportOptions = {
      hasHeaders: true,
      delimiter: ',',
      createMissingElements: false,
      ...options,
    };

    const result: ImportResult = {
      success: false,
      elementsImported: 0,
      linksImported: 0,
      assetsImported: 0,
      errors: [],
      warnings: [],
    };

    try {
      const lines = content.split('\n').filter((line) => line.trim());
      if (lines.length === 0) {
        result.errors.push('Fichier CSV vide');
        return result;
      }

      // Get existing elements to map by label
      const existingElements = await db.elements
        .where({ investigationId: targetInvestigationId })
        .toArray();
      const elementsByLabel = new Map<string, Element>();
      existingElements.forEach((el) => {
        elementsByLabel.set(el.label.toLowerCase(), el);
      });

      let headers: string[];
      let dataLines: string[];

      if (opts.hasHeaders) {
        headers = this.parseCSVLine(lines[0], opts.delimiter);
        dataLines = lines.slice(1);
      } else {
        headers = ['from', 'to', 'label'];
        dataLines = lines;
      }

      // Find column indices
      const fromIdx = headers.findIndex((h) =>
        h.toLowerCase() === 'from' || h.toLowerCase() === 'fromid' || h.toLowerCase() === 'source'
      );
      const toIdx = headers.findIndex((h) =>
        h.toLowerCase() === 'to' || h.toLowerCase() === 'toid' || h.toLowerCase() === 'target'
      );
      const labelIdx = headers.findIndex((h) => h.toLowerCase() === 'label');
      const notesIdx = headers.findIndex((h) => h.toLowerCase() === 'notes');
      const directedIdx = headers.findIndex((h) => h.toLowerCase() === 'directed');
      const colorIdx = headers.findIndex((h) => h.toLowerCase() === 'color');
      const styleIdx = headers.findIndex((h) => h.toLowerCase() === 'style');

      if (fromIdx === -1 || toIdx === -1) {
        result.errors.push('Colonnes "from" et "to" requises non trouvees');
        return result;
      }

      // Process each row
      let rowNum = opts.hasHeaders ? 2 : 1;
      for (const line of dataLines) {
        try {
          const values = this.parseCSVLine(line, opts.delimiter);
          if (values.length === 0) continue;

          const fromValue = values[fromIdx]?.trim().toLowerCase();
          const toValue = values[toIdx]?.trim().toLowerCase();

          if (!fromValue || !toValue) {
            result.warnings.push(`Ligne ${rowNum}: from/to vide, ligne ignoree`);
            rowNum++;
            continue;
          }

          // Find elements by label
          let fromElement = elementsByLabel.get(fromValue);
          let toElement = elementsByLabel.get(toValue);

          // Create missing elements if option enabled
          if (!fromElement && opts.createMissingElements) {
            fromElement = {
              id: generateUUID(),
              investigationId: targetInvestigationId,
              label: values[fromIdx].trim(),
              notes: '',
              tags: [],
              properties: [],
              confidence: null,
              source: '',
              date: null,
              dateRange: null,
              position: { x: Math.random() * 500, y: Math.random() * 500 },
              geo: null,
              visual: { ...DEFAULT_ELEMENT_VISUAL },
              assetIds: [],
              parentGroupId: null,
              isGroup: false,
              childIds: [],
              events: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await db.elements.add(fromElement);
            elementsByLabel.set(fromValue, fromElement);
            result.elementsImported++;
          }

          if (!toElement && opts.createMissingElements) {
            toElement = {
              id: generateUUID(),
              investigationId: targetInvestigationId,
              label: values[toIdx].trim(),
              notes: '',
              tags: [],
              properties: [],
              confidence: null,
              source: '',
              date: null,
              dateRange: null,
              position: { x: Math.random() * 500, y: Math.random() * 500 },
              geo: null,
              visual: { ...DEFAULT_ELEMENT_VISUAL },
              assetIds: [],
              parentGroupId: null,
              isGroup: false,
              childIds: [],
              events: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await db.elements.add(toElement);
            elementsByLabel.set(toValue, toElement);
            result.elementsImported++;
          }

          if (!fromElement || !toElement) {
            result.warnings.push(
              `Ligne ${rowNum}: element(s) non trouve(s): ${!fromElement ? fromValue : ''} ${!toElement ? toValue : ''}`
            );
            rowNum++;
            continue;
          }

          const isDirected = directedIdx >= 0 ? values[directedIdx]?.toLowerCase() === 'true' : false;
          const link: Link = {
            id: generateUUID(),
            investigationId: targetInvestigationId,
            fromId: fromElement.id,
            toId: toElement.id,
            sourceHandle: null,
            targetHandle: null,
            label: labelIdx >= 0 ? values[labelIdx] || '' : '',
            notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
            properties: [],
            confidence: null,
            source: '',
            date: null,
            dateRange: null,
            directed: isDirected,
            direction: isDirected ? 'forward' : 'none',
            visual: {
              ...DEFAULT_LINK_VISUAL,
              color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_LINK_VISUAL.color,
              style: styleIdx >= 0 && this.isValidLinkStyle(values[styleIdx])
                ? (values[styleIdx] as LinkStyle)
                : DEFAULT_LINK_VISUAL.style,
            },
            curveOffset: { x: 0, y: 0 },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await db.links.add(link);
          result.linksImported++;
        } catch (error) {
          result.warnings.push(`Ligne ${rowNum}: ${error instanceof Error ? error.message : 'Erreur'}`);
        }
        rowNum++;
      }

      // Update investigation timestamp
      await db.investigations.update(targetInvestigationId, {
        updatedAt: new Date(),
      });

      result.success = result.linksImported > 0 || result.elementsImported > 0;
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
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

  private parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  private isValidShape(value: string | undefined): boolean {
    if (!value) return false;
    return ['circle', 'square', 'diamond', 'rectangle', 'hexagon'].includes(value.toLowerCase());
  }

  private isValidLinkStyle(value: string | undefined): boolean {
    if (!value) return false;
    return ['solid', 'dashed', 'dotted'].includes(value.toLowerCase());
  }
}

export const importService = new ImportService();
