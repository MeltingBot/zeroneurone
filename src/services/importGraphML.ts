/** GraphML import: nodes and edges with their data keys */

import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { DossierId, Element, ElementId, Link, Position, GeoData, Confidence, ElementShape, LinkStyle, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { isValidLinkStyle, isValidShape } from './importValidators';
import { importedDate } from './importDates';
import type { ImportResult, ImportService } from './importService';

/**
 * Import from GraphML file (graph format compatible with Gephi, yEd, etc.)
 */
export async function importFromGraphML(
  svc: ImportService,
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
      const nodeData = parseGraphMLData(node, keyDefs);

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
      let geo: GeoData | null = null;
      const lat = nodeData.lat || nodeData.latitude;
      const lng = nodeData.lng || nodeData.lon || nodeData.longitude;
      if (lat !== undefined && lng !== undefined) {
        const latNum = typeof lat === 'number' ? lat : parseFloat(lat);
        const lngNum = typeof lng === 'number' ? lng : parseFloat(lng);
        if (!isNaN(latNum) && !isNaN(lngNum)) {
          geo = { type: 'point', lat: latNum, lng: lngNum };
        }
      }

      const element: Element = {
        id: newId,
        dossierId: targetDossierId,
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
          shape: isValidShape(nodeData.shape) ? nodeData.shape as ElementShape : DEFAULT_ELEMENT_VISUAL.shape,
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
      const edgeData = parseGraphMLData(edge, keyDefs);

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
        const parsed = importedDate(String(dateValue));
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
        dossierId: targetDossierId,
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
          style: isValidLinkStyle(edgeData.style) ? edgeData.style as LinkStyle : DEFAULT_LINK_VISUAL.style,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      result.linksImported++;
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });

    result.success = result.elementsImported > 0;
    if (result.linksImported > 0) {
      await svc.applyImportDisplaySettings(targetDossierId);
    }
  } catch (error) {
    result.errors.push(`Erreur d'import GraphML: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  return result;
}

/**
 * Parse data elements from a GraphML node or edge
 */
function parseGraphMLData(
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
