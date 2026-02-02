import JSZip from 'jszip';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  InvestigationId,
  Element,
  ElementId,
  Link,
  LinkId,
  AssetId,
  Position,
  GeoCoordinates,
  Confidence,
  ElementShape,
  LinkStyle,
  Property,
  Report,
  ReportSection,
  ReportSectionId,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ExportData, ExportedAssetMeta } from './exportService';
import { fileService, FileValidationError } from './fileService';
import { parseOsintrackerFile, dataUrlToFile } from './importOsintracker';
import { importPredicaGraph, isPredicaGraphFormat } from './importPredictagraph';
import { importOsintIndustries, isOsintIndustriesFormat } from './importOsintIndustries';
import { importOIPalette, isOIPaletteFormat } from './importOIPalette';
import { importExcalidraw, isExcalidrawFormat } from './importExcalidraw';
import { importSTIX2, isSTIX2Format } from './importSTIX2';
import { importGenealogyFile, detectGenealogyFormatFromName, type GenealogyImportOptions } from './genealogy';

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

export type ImportFormat = 'json' | 'csv' | 'zip' | 'graphml';

export interface ImportResult {
  success: boolean;
  elementsImported: number;
  linksImported: number;
  assetsImported: number;
  reportImported: boolean;
  errors: string[];
  warnings: string[];
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

class ImportService {
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
   * Used for placement preview before importing into existing investigation
   */
  async parseZipForPlacement(file: File): Promise<{ boundingBox: ImportBoundingBox; success: boolean; error?: string }> {
    try {
      // Security check
      if (file.size > ZIP_LIMITS.MAX_ZIP_SIZE) {
        return { boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 }, success: false, error: 'Fichier trop volumineux' };
      }

      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Read investigation.json
      const jsonFile = zip.file('investigation.json');
      if (!jsonFile) {
        return { boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 }, success: false, error: 'Pas de fichier investigation.json' };
      }

      const content = await jsonFile.async('string');
      const data = JSON.parse(content) as ExportData;
      const boundingBox = this.calculateBoundingBox(data);

      return { boundingBox, success: true };
    } catch (error) {
      return {
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, elementCount: 0 },
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de lecture'
      };
    }
  }

  /**
   * Import from ZIP file (full investigation export with assets)
   * Includes ZIP bomb protection and file validation
   * @param positionOffset - Optional offset to apply to all element positions (for importing into existing investigation)
   */
  async importFromZip(
    file: File,
    targetInvestigationId: InvestigationId,
    positionOffset?: Position
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
      const linkIdMap = new Map<LinkId, LinkId>();

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

      // Import elements and links (with optional position offset)
      await this.importElementsAndLinks(data, targetInvestigationId, elementIdMap, assetIdMap, linkIdMap, result, positionOffset);

      // Import report if present (with element and link ID remapping)
      if (data.report && data.report.sections && data.report.sections.length > 0) {
        await this.importReport(data.report, targetInvestigationId, result, elementIdMap, linkIdMap);
      }

      result.success = true;
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
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
    targetInvestigationId: InvestigationId
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
          importResult = await this.importNativeJSON(data, targetInvestigationId);
          break;
        case 'osint-industries':
          importResult = await importOsintIndustries(content, targetInvestigationId);
          break;
        case 'oi-palette':
          importResult = await importOIPalette(content, targetInvestigationId);
          break;
        case 'predicagraph':
          importResult = await importPredicaGraph(content, targetInvestigationId);
          break;
        case 'excalidraw':
          importResult = await importExcalidraw(content, targetInvestigationId);
          break;
        case 'stix2':
          importResult = await importSTIX2(content, targetInvestigationId);
          break;
        default:
          result.errors.push('Format JSON non reconnu. Formats supportés: ZeroNeurone, OSINT Industries, Graph Palette, PredicaGraph, Excalidraw, STIX 2.1');
          return result;
      }

      if (importResult.success && importResult.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
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
  private detectJsonFormat(data: unknown): 'zeroneurone' | 'osint-industries' | 'oi-palette' | 'predicagraph' | 'excalidraw' | 'stix2' | 'unknown' {
    // Excalidraw: { type: "excalidraw", elements: [...] }
    if (isExcalidrawFormat(data)) {
      return 'excalidraw';
    }

    // STIX 2.1: { type: "bundle", objects: [...] }
    if (isSTIX2Format(data)) {
      return 'stix2';
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
   * Apply default display settings for imported investigations
   * Sets curved links with auto anchoring for better readability
   */
  private async applyImportDisplaySettings(investigationId: InvestigationId): Promise<void> {
    const investigation = await db.investigations.get(investigationId);
    if (!investigation) return;
    await db.investigations.update(investigationId, {
      settings: {
        ...investigation.settings,
        linkAnchorMode: 'auto',
        linkCurveMode: 'curved',
      },
    });
  }

  /**
   * Import native ZeroNeurone JSON format (without assets)
   */
  private async importNativeJSON(
    data: ExportData,
    targetInvestigationId: InvestigationId
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

      // Import elements and links (no assets for JSON-only import)
      await this.importElementsAndLinks(data, targetInvestigationId, elementIdMap, assetIdMap, linkIdMap, result);

      // Import report if present (with element and link ID remapping)
      if (data.report && data.report.sections && data.report.sections.length > 0) {
        await this.importReport(data.report, targetInvestigationId, result, elementIdMap, linkIdMap);
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
    targetInvestigationId: InvestigationId
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
          isPositionLocked: parsedElement.isPositionLocked ?? false,
          geo: parsedElement.geo,
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
          investigationId: targetInvestigationId,
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
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
    } catch (error) {
      result.errors.push(
        `Erreur d'import OSINTracker: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }

    return result;
  }

  /**
   * Import from GraphML file (graph format compatible with Gephi, yEd, etc.)
   */
  async importFromGraphML(
    content: string,
    targetInvestigationId: InvestigationId
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
      // Parse XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');

      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        result.errors.push('Format GraphML invalide: erreur de parsing XML');
        return result;
      }

      // Get the graphml root element
      const graphml = doc.querySelector('graphml');
      if (!graphml) {
        result.errors.push('Format GraphML invalide: element <graphml> manquant');
        return result;
      }

      // Parse key definitions to understand attribute names
      const keyDefs = new Map<string, { name: string; for: string }>();
      graphml.querySelectorAll('key').forEach((key) => {
        const id = key.getAttribute('id');
        const attrName = key.getAttribute('attr.name') || key.getAttribute('id');
        const forType = key.getAttribute('for') || 'all';
        if (id && attrName) {
          keyDefs.set(id, { name: attrName.toLowerCase(), for: forType });
        }
      });

      // Get the graph element
      const graph = graphml.querySelector('graph');
      if (!graph) {
        result.errors.push('Format GraphML invalide: element <graph> manquant');
        return result;
      }

      // Check if graph is directed by default
      const defaultEdgeDirection = graph.getAttribute('edgedefault') || 'undirected';
      const isDirectedByDefault = defaultEdgeDirection === 'directed';

      // Create ID mapping (GraphML ID -> new UUID)
      const nodeIdMap = new Map<string, ElementId>();

      // Grid layout for nodes without positions
      let gridX = 0;
      let gridY = 0;
      const gridSpacing = 200;
      const gridCols = 10;

      // Import nodes
      const nodes = graph.querySelectorAll('node');
      for (const node of Array.from(nodes)) {
        const graphmlId = node.getAttribute('id');
        if (!graphmlId) {
          result.warnings.push('Noeud sans ID ignoré');
          continue;
        }

        // Parse node data
        const nodeData = this.parseGraphMLData(node, keyDefs);

        // Generate position if not available
        const position: Position = {
          x: typeof nodeData.x === 'number' ? nodeData.x : (gridX * gridSpacing),
          y: typeof nodeData.y === 'number' ? nodeData.y : (gridY * gridSpacing),
        };

        // Advance grid position for next node without position
        if (nodeData.x === undefined || nodeData.y === undefined) {
          gridX++;
          if (gridX >= gridCols) {
            gridX = 0;
            gridY++;
          }
        }

        const newId = generateUUID();
        nodeIdMap.set(graphmlId, newId);

        // Extract label from various possible attribute names
        const nodeLabel = nodeData.label || nodeData.name || nodeData.titre || nodeData.title || graphmlId;

        // Extract notes from various possible attribute names
        const nodeNotes = nodeData.notes || nodeData.description || nodeData.desc || '';

        // Build properties from additional attributes (exclude known fields)
        const knownNodeFields = ['label', 'name', 'titre', 'title', 'notes', 'description', 'desc',
          'tags', 'color', 'colour', 'shape', 'x', 'y', 'lat', 'lng', 'lon', 'longitude', 'latitude'];
        const nodeProperties: Property[] = [];
        for (const [key, value] of Object.entries(nodeData)) {
          if (value !== undefined && !knownNodeFields.includes(key)) {
            nodeProperties.push({ key, value: String(value), type: 'text' });
          }
        }

        // Parse geo coordinates
        let geo: GeoCoordinates | null = null;
        const lat = nodeData.lat || nodeData.latitude;
        const lng = nodeData.lng || nodeData.lon || nodeData.longitude;
        if (lat !== undefined && lng !== undefined) {
          const latNum = typeof lat === 'number' ? lat : parseFloat(lat);
          const lngNum = typeof lng === 'number' ? lng : parseFloat(lng);
          if (!isNaN(latNum) && !isNaN(lngNum)) {
            geo = { lat: latNum, lng: lngNum };
          }
        }

        const element: Element = {
          id: newId,
          investigationId: targetInvestigationId,
          label: String(nodeLabel),
          notes: String(nodeNotes),
          tags: nodeData.tags ? String(nodeData.tags).split(';').map((t: string) => t.trim()).filter(Boolean) : [],
          properties: nodeProperties,
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          position,
          isPositionLocked: false,
          geo,
          visual: {
            ...DEFAULT_ELEMENT_VISUAL,
            color: String(nodeData.color || nodeData.colour || DEFAULT_ELEMENT_VISUAL.color),
            shape: this.isValidShape(nodeData.shape) ? nodeData.shape as ElementShape : DEFAULT_ELEMENT_VISUAL.shape,
          },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.elements.add(element);
        result.elementsImported++;
      }

      // Import edges
      const edges = graph.querySelectorAll('edge');
      for (const edge of Array.from(edges)) {
        const edgeId = edge.getAttribute('id');
        const sourceId = edge.getAttribute('source');
        const targetId = edge.getAttribute('target');

        if (!sourceId || !targetId) {
          result.warnings.push(`Lien ${edgeId || 'sans ID'} ignoré: source ou target manquant`);
          continue;
        }

        const fromId = nodeIdMap.get(sourceId);
        const toId = nodeIdMap.get(targetId);

        if (!fromId || !toId) {
          result.warnings.push(`Lien ${edgeId || 'sans ID'} ignoré: noeud source ou target non trouvé`);
          continue;
        }

        // Parse edge data
        const edgeData = this.parseGraphMLData(edge, keyDefs);

        // Check if this edge has explicit direction
        const edgeDirection = edge.getAttribute('directed');
        const isDirected = edgeDirection === 'true' || (edgeDirection === null && isDirectedByDefault);

        // Extract label from various possible attribute names
        const edgeLabel = edgeData.label || edgeData.edgelabel || edgeData.relation ||
          edgeData.type || edgeData.name || edgeData.titre || '';

        // Extract notes from various possible attribute names
        const edgeNotes = edgeData.notes || edgeData.description || edgeData.desc || '';

        // Parse date from various attribute names
        let edgeDate: Date | null = null;
        const dateValue = edgeData.date || edgeData.date_heure || edgeData.datetime ||
          edgeData.timestamp || edgeData.time || edgeData.date_time;
        if (dateValue) {
          const parsed = new Date(String(dateValue));
          if (!isNaN(parsed.getTime())) {
            edgeDate = parsed;
          }
        }

        // Parse confidence from various attribute names (0-1 scale → 0-100)
        let edgeConfidence: Confidence | null = null;
        const confidenceValue = edgeData.confidence || edgeData.indice_confiance ||
          edgeData.weight || edgeData.poids || edgeData.score;
        if (confidenceValue !== undefined) {
          let conf = typeof confidenceValue === 'number' ? confidenceValue : parseFloat(String(confidenceValue));
          // If value is between 0 and 1, convert to 0-100 scale
          if (conf > 0 && conf <= 1) {
            conf = Math.round(conf * 100);
          }
          // Round to nearest 10
          conf = Math.round(conf / 10) * 10;
          if (conf >= 0 && conf <= 100) {
            edgeConfidence = conf as Confidence;
          }
        }

        // Build properties from additional attributes (exclude known fields)
        const knownEdgeFields = ['label', 'edgelabel', 'relation', 'type', 'name', 'titre',
          'notes', 'description', 'desc', 'date', 'date_heure', 'datetime', 'timestamp', 'time', 'date_time',
          'confidence', 'indice_confiance', 'weight', 'poids', 'score',
          'color', 'colour', 'edgecolor', 'style'];
        const edgeProperties: Property[] = [];
        for (const [key, value] of Object.entries(edgeData)) {
          if (value !== undefined && !knownEdgeFields.includes(key)) {
            edgeProperties.push({ key, value: String(value), type: 'text' });
          }
        }

        const link: Link = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          fromId,
          toId,
          sourceHandle: null,
          targetHandle: null,
          label: String(edgeLabel),
          notes: String(edgeNotes),
          tags: [],
          properties: edgeProperties,
          confidence: edgeConfidence,
          source: '',
          date: null,
          dateRange: edgeDate ? { start: edgeDate, end: edgeDate } : null,
          directed: isDirected,
          direction: isDirected ? 'forward' : 'none',
          visual: {
            ...DEFAULT_LINK_VISUAL,
            color: String(edgeData.color || edgeData.colour || edgeData.edgecolor || DEFAULT_LINK_VISUAL.color),
            style: this.isValidLinkStyle(edgeData.style) ? edgeData.style as LinkStyle : DEFAULT_LINK_VISUAL.style,
          },
          curveOffset: { x: 0, y: 0 },
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

      result.success = result.elementsImported > 0;
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
    } catch (error) {
      result.errors.push(`Erreur d'import GraphML: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Parse data elements from a GraphML node or edge
   */
  private parseGraphMLData(
    element: globalThis.Element,
    keyDefs: Map<string, { name: string; for: string }>
  ): Record<string, string | number | undefined> {
    const data: Record<string, string | number | undefined> = {};

    element.querySelectorAll(':scope > data').forEach((dataEl) => {
      const key = dataEl.getAttribute('key');
      if (key) {
        const keyDef = keyDefs.get(key);
        const attrName = keyDef?.name || key;
        const value = dataEl.textContent?.trim();

        if (value) {
          // Try to parse as number for x/y coordinates
          if (attrName === 'x' || attrName === 'y') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              data[attrName] = num;
            }
          } else {
            data[attrName] = value;
          }
        }
      }
    });

    return data;
  }

  /**
   * Import elements and links from export data
   * @param positionOffset - Optional offset to apply to all element positions
   */
  private async importElementsAndLinks(
    data: ExportData,
    targetInvestigationId: InvestigationId,
    elementIdMap: Map<ElementId, ElementId>,
    assetIdMap: Map<AssetId, AssetId>,
    linkIdMap: Map<LinkId, LinkId>,
    result: ImportResult,
    positionOffset?: Position
  ): Promise<void> {
    // First pass: create ID mappings for all elements
    for (const importedElement of data.elements) {
      const newId = generateUUID();
      elementIdMap.set(importedElement.id, newId);
    }

    // Second pass: import elements with mapped IDs
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
        investigationId: targetInvestigationId,
        position,
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
        parentGroupId: newParentGroupId,
        childIds: newChildIds,
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

      const newLinkId = generateUUID();
      // Store mapping for report content remapping
      linkIdMap.set(importedLink.id, newLinkId as LinkId);

      const link: Link = {
        ...importedLink,
        id: newLinkId,
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
   * Import a report with its sections
   */
  private async importReport(
    importedReport: Report,
    targetInvestigationId: InvestigationId,
    result: ImportResult,
    elementIdMap?: Map<ElementId, ElementId>,
    linkIdMap?: Map<LinkId, LinkId>
  ): Promise<void> {
    try {
      // Check if a report already exists for this investigation
      const existingReports = await db.reports
        .where({ investigationId: targetInvestigationId })
        .toArray();

      if (existingReports.length > 0) {
        // Report already exists, skip import but add warning
        result.warnings.push('Un rapport existe déjà pour cette investigation, rapport non importé');
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
        investigationId: targetInvestigationId,
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

    // Regex to match [[Label|uuid]] pattern (case-insensitive for UUID)
    // uuid format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const refRegex = /\[\[([^\]|]+)\|([a-fA-F0-9-]{36})\]\]/g;

    return content.replace(refRegex, (match, label, oldId) => {
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
   * Import unified CSV file with type column (elements and links in one file)
   */
  async importFromCSV(
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
      reportImported: false,
      errors: [],
      warnings: [],
    };

    try {
      const lines = content.split('\n').filter((line) => line.trim());
      if (lines.length === 0) {
        result.errors.push('Fichier CSV vide');
        return result;
      }

      const headers = this.parseCSVLine(lines[0], opts.delimiter).map(h => h.toLowerCase());
      const dataLines = lines.slice(1);

      // Check if this is a unified format (has 'type' column)
      const typeIdx = headers.findIndex((h) => h === 'type');

      if (typeIdx === -1) {
        // No type column - use legacy detection
        const isLinksCSV = headers.includes('de') || headers.includes('vers') ||
          headers.includes('from') || headers.includes('to') || headers.includes('source') || headers.includes('target');

        if (isLinksCSV) {
          return this.importLinksFromCSV(content, targetInvestigationId, opts);
        } else {
          return this.importElementsFromCSV(content, targetInvestigationId, opts);
        }
      }

      // Unified format with type column
      const labelIdx = headers.findIndex((h) => ['label', 'nom', 'name'].includes(h));
      const deIdx = headers.findIndex((h) => ['de', 'from', 'source'].includes(h));
      const versIdx = headers.findIndex((h) => ['vers', 'to', 'target'].includes(h));
      const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h));
      const tagsIdx = headers.findIndex((h) => ['tags', 'etiquettes'].includes(h));
      const confidenceIdx = headers.findIndex((h) => ['confiance', 'confidence'].includes(h));
      const sourceIdx = headers.findIndex((h) => h === 'source' && deIdx !== headers.indexOf(h)); // Avoid conflict with 'de'
      const dateIdx = headers.findIndex((h) => h === 'date');
      const dateStartIdx = headers.findIndex((h) => ['date_debut', 'date_start'].includes(h));
      const dateEndIdx = headers.findIndex((h) => ['date_fin', 'date_end'].includes(h));
      const latIdx = headers.findIndex((h) => ['latitude', 'lat'].includes(h));
      const lngIdx = headers.findIndex((h) => ['longitude', 'lng', 'lon'].includes(h));
      const posXIdx = headers.findIndex((h) => ['position_x', 'x', 'posx'].includes(h));
      const posYIdx = headers.findIndex((h) => ['position_y', 'y', 'posy'].includes(h));
      const directedIdx = headers.findIndex((h) => ['dirige', 'directed'].includes(h));
      const colorIdx = headers.findIndex((h) => ['couleur', 'color'].includes(h));
      const shapeIdx = headers.findIndex((h) => ['forme', 'shape'].includes(h));
      const styleIdx = headers.findIndex((h) => h === 'style');
      const isGroupIdx = headers.findIndex((h) => ['est_groupe', 'is_group', 'isgroup'].includes(h));
      const parentGroupIdx = headers.findIndex((h) => ['groupe_parent', 'parent_group', 'parentgroup'].includes(h));

      // Known headers (reserved columns) - any other column becomes a property
      const knownHeaders = new Set([
        'type', 'label', 'nom', 'name', 'de', 'from', 'source', 'vers', 'to', 'target',
        'notes', 'description', 'tags', 'etiquettes', 'confiance', 'confidence',
        'date', 'date_debut', 'date_start', 'date_fin', 'date_end',
        'latitude', 'lat', 'longitude', 'lng', 'lon',
        'position_x', 'x', 'posx', 'position_y', 'y', 'posy',
        'dirige', 'directed', 'couleur', 'color', 'forme', 'shape', 'style',
        'est_groupe', 'is_group', 'isgroup', 'groupe_parent', 'parent_group', 'parentgroup',
      ]);

      // Find custom property columns (columns not in knownHeaders)
      const customPropertyIndices: { index: number; name: string }[] = [];
      headers.forEach((header, index) => {
        if (!knownHeaders.has(header) && header.trim()) {
          customPropertyIndices.push({ index, name: header });
        }
      });

      // Track created elements by label for linking
      const elementsByLabel = new Map<string, Element>();

      // First, get existing elements
      const existingElements = await db.elements
        .where({ investigationId: targetInvestigationId })
        .toArray();
      existingElements.forEach((el) => {
        elementsByLabel.set(el.label.toLowerCase(), el);
      });

      // First pass: create all elements
      let rowNum = 2;
      for (const line of dataLines) {
        const values = this.parseCSVLine(line, opts.delimiter);
        if (values.length === 0) {
          rowNum++;
          continue;
        }

        const type = values[typeIdx]?.toLowerCase().trim();
        if (type !== 'element') {
          rowNum++;
          continue;
        }

        const label = labelIdx >= 0 ? values[labelIdx]?.trim() : '';
        if (!label) {
          result.warnings.push(`Ligne ${rowNum}: label vide, élément ignoré`);
          rowNum++;
          continue;
        }

        // Skip if element already exists
        if (elementsByLabel.has(label.toLowerCase())) {
          rowNum++;
          continue;
        }

        // Parse geo coordinates
        let geo: GeoCoordinates | null = null;
        if (latIdx >= 0 && lngIdx >= 0 && values[latIdx] && values[lngIdx]) {
          const lat = parseFloat(values[latIdx]);
          const lng = parseFloat(values[lngIdx]);
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

        // Parse custom properties from additional columns
        const properties: Array<{ key: string; value: string }> = [];
        for (const { index, name } of customPropertyIndices) {
          const value = values[index]?.trim();
          if (value) {
            properties.push({ key: name, value });
          }
        }

        // Parse position
        let posX = Math.random() * 500;
        let posY = Math.random() * 500;
        if (posXIdx >= 0 && values[posXIdx]) {
          const parsed = parseFloat(values[posXIdx]);
          if (!isNaN(parsed)) posX = parsed;
        }
        if (posYIdx >= 0 && values[posYIdx]) {
          const parsed = parseFloat(values[posYIdx]);
          if (!isNaN(parsed)) posY = parsed;
        }

        // Parse group fields
        const isGroup = isGroupIdx >= 0 && ['oui', 'yes', 'true', '1'].includes(values[isGroupIdx]?.toLowerCase().trim());
        const parentGroupId = parentGroupIdx >= 0 && values[parentGroupIdx]?.trim() ? values[parentGroupIdx].trim() : null;

        const element: Element = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          label,
          notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
          tags: tagsIdx >= 0 && values[tagsIdx] ? values[tagsIdx].split(';').map(t => t.trim()).filter(Boolean) : [],
          properties,
          confidence,
          source: sourceIdx >= 0 ? values[sourceIdx] || '' : '',
          date,
          dateRange: null,
          position: { x: posX, y: posY },
          isPositionLocked: false,
          geo,
          visual: {
            ...DEFAULT_ELEMENT_VISUAL,
            color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_ELEMENT_VISUAL.color,
            shape: shapeIdx >= 0 && this.isValidShape(values[shapeIdx]) ? values[shapeIdx] as ElementShape : DEFAULT_ELEMENT_VISUAL.shape,
          },
          assetIds: [],
          parentGroupId,
          isGroup,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.elements.add(element);
        elementsByLabel.set(label.toLowerCase(), element);
        result.elementsImported++;
        rowNum++;
      }

      // Second pass: create all links
      rowNum = 2;
      for (const line of dataLines) {
        const values = this.parseCSVLine(line, opts.delimiter);
        if (values.length === 0) {
          rowNum++;
          continue;
        }

        const type = values[typeIdx]?.toLowerCase().trim();
        if (type !== 'lien' && type !== 'link') {
          rowNum++;
          continue;
        }

        const deValue = deIdx >= 0 ? values[deIdx]?.trim().toLowerCase() : '';
        const versValue = versIdx >= 0 ? values[versIdx]?.trim().toLowerCase() : '';

        if (!deValue || !versValue) {
          result.warnings.push(`Ligne ${rowNum}: de/vers vide, lien ignoré`);
          rowNum++;
          continue;
        }

        let fromElement = elementsByLabel.get(deValue);
        let toElement = elementsByLabel.get(versValue);

        // Create missing elements if option enabled
        if (!fromElement && opts.createMissingElements) {
          fromElement = {
            id: generateUUID(),
            investigationId: targetInvestigationId,
            label: values[deIdx].trim(),
            notes: '',
            tags: [],
            properties: [],
            confidence: null,
            source: '',
            date: null,
            dateRange: null,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            isPositionLocked: false,
            geo: null,
            visual: { ...DEFAULT_ELEMENT_VISUAL },
            assetIds: [],
            parentGroupId: null,
            isGroup: false,
            isAnnotation: false,
            childIds: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.elements.add(fromElement);
          elementsByLabel.set(deValue, fromElement);
          result.elementsImported++;
        }

        if (!toElement && opts.createMissingElements) {
          toElement = {
            id: generateUUID(),
            investigationId: targetInvestigationId,
            label: values[versIdx].trim(),
            notes: '',
            tags: [],
            properties: [],
            confidence: null,
            source: '',
            date: null,
            dateRange: null,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            isPositionLocked: false,
            geo: null,
            visual: { ...DEFAULT_ELEMENT_VISUAL },
            assetIds: [],
            parentGroupId: null,
            isGroup: false,
            isAnnotation: false,
            childIds: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.elements.add(toElement);
          elementsByLabel.set(versValue, toElement);
          result.elementsImported++;
        }

        if (!fromElement || !toElement) {
          result.warnings.push(`Ligne ${rowNum}: élément(s) non trouvé(s): ${!fromElement ? deValue : ''} ${!toElement ? versValue : ''}`);
          rowNum++;
          continue;
        }

        // Parse directed
        const directedValue = directedIdx >= 0 ? values[directedIdx]?.toLowerCase() : '';
        const isDirected = ['true', 'oui', 'yes', '1'].includes(directedValue);

        // Parse confidence
        let linkConfidence: Confidence | null = null;
        if (confidenceIdx >= 0 && values[confidenceIdx]) {
          const conf = parseInt(values[confidenceIdx]);
          if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
            linkConfidence = conf as Confidence;
          }
        }

        // Parse date range
        let dateRange: { start: Date | null; end: Date | null } | null = null;
        if (dateStartIdx >= 0 && values[dateStartIdx]) {
          const startDate = new Date(values[dateStartIdx]);
          const endDate = dateEndIdx >= 0 && values[dateEndIdx] ? new Date(values[dateEndIdx]) : startDate;
          if (!isNaN(startDate.getTime())) {
            dateRange = {
              start: startDate,
              end: !isNaN(endDate.getTime()) ? endDate : startDate,
            };
          }
        }

        // Parse custom properties from additional columns
        const linkProperties: Array<{ key: string; value: string }> = [];
        for (const { index, name } of customPropertyIndices) {
          const value = values[index]?.trim();
          if (value) {
            linkProperties.push({ key: name, value });
          }
        }

        const link: Link = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          fromId: fromElement.id,
          toId: toElement.id,
          sourceHandle: null,
          targetHandle: null,
          label: labelIdx >= 0 ? values[labelIdx] || '' : '',
          notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
          tags: [],
          properties: linkProperties,
          confidence: linkConfidence,
          source: '',
          date: null,
          dateRange,
          directed: isDirected,
          direction: isDirected ? 'forward' : 'none',
          visual: {
            ...DEFAULT_LINK_VISUAL,
            color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_LINK_VISUAL.color,
            style: styleIdx >= 0 && this.isValidLinkStyle(values[styleIdx]) ? values[styleIdx] as LinkStyle : DEFAULT_LINK_VISUAL.style,
          },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        result.linksImported++;
        rowNum++;
      }

      // Update investigation timestamp
      await db.investigations.update(targetInvestigationId, {
        updatedAt: new Date(),
      });

      result.success = result.elementsImported > 0 || result.linksImported > 0;
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Import elements from CSV file (legacy format without type column)
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
      reportImported: false,
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

      // Find column indices (accept both French and English column names)
      const labelIdx = headers.findIndex((h) => ['label', 'nom', 'name'].includes(h.toLowerCase()));
      const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h.toLowerCase()));
      const tagsIdx = headers.findIndex((h) => ['tags', 'etiquettes'].includes(h.toLowerCase()));
      const posXIdx = headers.findIndex((h) => h.toLowerCase().includes('positionx') || h.toLowerCase() === 'x');
      const posYIdx = headers.findIndex((h) => h.toLowerCase().includes('positiony') || h.toLowerCase() === 'y');
      const geoLatIdx = headers.findIndex((h) => ['lat', 'latitude'].includes(h.toLowerCase()));
      const geoLngIdx = headers.findIndex((h) => ['lng', 'lon', 'longitude'].includes(h.toLowerCase()));
      const dateIdx = headers.findIndex((h) => ['date'].includes(h.toLowerCase()));
      const confidenceIdx = headers.findIndex((h) => ['confidence', 'confiance'].includes(h.toLowerCase()));
      const sourceIdx = headers.findIndex((h) => ['source'].includes(h.toLowerCase()));
      const colorIdx = headers.findIndex((h) => ['color', 'couleur'].includes(h.toLowerCase()));
      const shapeIdx = headers.findIndex((h) => ['shape', 'forme'].includes(h.toLowerCase()));

      if (labelIdx === -1) {
        result.errors.push('Colonne "label" requise non trouvée');
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
            isPositionLocked: false,
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
            isAnnotation: false,
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
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
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
      reportImported: false,
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

      // Find column indices (accept both French and English column names)
      const fromIdx = headers.findIndex((h) =>
        ['from', 'fromid', 'source', 'de', 'origine'].includes(h.toLowerCase())
      );
      const toIdx = headers.findIndex((h) =>
        ['to', 'toid', 'target', 'vers', 'destination', 'cible'].includes(h.toLowerCase())
      );
      const labelIdx = headers.findIndex((h) => ['label', 'relation', 'type'].includes(h.toLowerCase()));
      const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h.toLowerCase()));
      const directedIdx = headers.findIndex((h) => ['directed', 'dirige', 'direction'].includes(h.toLowerCase()));
      const colorIdx = headers.findIndex((h) => ['color', 'couleur'].includes(h.toLowerCase()));
      const styleIdx = headers.findIndex((h) => ['style'].includes(h.toLowerCase()));
      const confidenceIdx = headers.findIndex((h) => ['confidence', 'confiance'].includes(h.toLowerCase()));
      const dateStartIdx = headers.findIndex((h) => ['date_debut', 'date_start', 'debut', 'start'].includes(h.toLowerCase()));
      const dateEndIdx = headers.findIndex((h) => ['date_fin', 'date_end', 'fin', 'end'].includes(h.toLowerCase()));

      if (fromIdx === -1 || toIdx === -1) {
        result.errors.push('Colonnes "de" et "vers" (ou "from" et "to") requises non trouvées');
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
              isPositionLocked: false,
              geo: null,
              visual: { ...DEFAULT_ELEMENT_VISUAL },
              assetIds: [],
              parentGroupId: null,
              isGroup: false,
              isAnnotation: false,
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
              isPositionLocked: false,
              geo: null,
              visual: { ...DEFAULT_ELEMENT_VISUAL },
              assetIds: [],
              parentGroupId: null,
              isGroup: false,
              isAnnotation: false,
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

          // Parse directed (accept true/false, oui/non, yes/no)
          const directedValue = directedIdx >= 0 ? values[directedIdx]?.toLowerCase() : '';
          const isDirected = ['true', 'oui', 'yes', '1'].includes(directedValue);

          // Parse confidence
          let linkConfidence: Confidence | null = null;
          if (confidenceIdx >= 0 && values[confidenceIdx]) {
            const conf = parseInt(values[confidenceIdx]);
            if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
              linkConfidence = conf as Confidence;
            }
          }

          // Parse date range
          let dateRange: { start: Date | null; end: Date | null } | null = null;
          if (dateStartIdx >= 0 && values[dateStartIdx]) {
            const startDate = new Date(values[dateStartIdx]);
            const endDate = dateEndIdx >= 0 && values[dateEndIdx] ? new Date(values[dateEndIdx]) : startDate;
            if (!isNaN(startDate.getTime())) {
              dateRange = {
                start: startDate,
                end: !isNaN(endDate.getTime()) ? endDate : startDate,
              };
            }
          }

          const link: Link = {
            id: generateUUID(),
            investigationId: targetInvestigationId,
            fromId: fromElement.id,
            toId: toElement.id,
            sourceHandle: null,
            targetHandle: null,
            label: labelIdx >= 0 ? values[labelIdx] || '' : '',
            notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
            tags: [],
            properties: [],
            confidence: linkConfidence,
            source: '',
            date: null,
            dateRange,
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
      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
    } catch (error) {
      result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Import from genealogy file (GEDCOM 5.5.1/7.0, GeneWeb .gw)
   */
  async importFromGenealogy(
    file: File,
    targetInvestigationId: InvestigationId,
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
      const importData = await importGenealogyFile(file, targetInvestigationId, options);

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

      // Update investigation timestamp
      await db.investigations.update(targetInvestigationId, {
        updatedAt: new Date(),
      });

      result.errors = importData.result.errors;
      result.warnings = importData.result.warnings;
      result.success = result.elementsImported > 0;

      if (result.linksImported > 0) {
        await this.applyImportDisplaySettings(targetInvestigationId);
      }
    } catch (error) {
      result.errors.push(`Erreur d'import généalogie: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }

    return result;
  }

  /**
   * Check if a file is a genealogy file
   */
  isGenealogyFile(file: File): boolean {
    const format = detectGenealogyFormatFromName(file.name);
    return format !== null;
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

  private isValidShape(value: string | number | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return ['circle', 'square', 'diamond', 'rectangle'].includes(value.toLowerCase());
  }

  private isValidLinkStyle(value: string | number | undefined): boolean {
    if (!value || typeof value !== 'string') return false;
    return ['solid', 'dashed', 'dotted'].includes(value.toLowerCase());
  }
}

export const importService = new ImportService();
