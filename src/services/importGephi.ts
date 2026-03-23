/**
 * Gephi Import Service
 * Supports two native Gephi formats:
 * - GEXF (Graph Exchange XML Format) - Gephi desktop native format
 * - Gephi Lite JSON - Gephi Lite workspace format
 */

import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  DossierId,
  Element,
  ElementId,
  Link,
  Property,
  ElementShape,
  LinkId,
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';

// ============================================================================
// Size scaling constants
// ============================================================================

// ZeroNeurone named sizes: small=40, medium=56, large=72 (pixels)
// Gephi rawSize is arbitrary. We scale proportionally to a usable pixel range.
const MIN_SIZE_PX = 20;
const MAX_SIZE_PX = 120;

// ============================================================================
// i18n helper
// ============================================================================

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:gephi.${key}`, options) as string;

// ============================================================================
// Format Detection
// ============================================================================

/** Detect GEXF XML format from file content */
export function isGEXFFormat(content: string): boolean {
  return content.includes('<gexf') && (
    content.includes('gexf.net') || content.includes('xmlns')
  );
}

/** Detect Gephi Lite JSON format from parsed data */
export function isGephiLiteFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.type === 'gephi-lite' && d.graphDataset != null;
}

// ============================================================================
// GEXF Shape → ZeroNeurone Shape mapping
// ============================================================================

const GEXF_SHAPE_MAP: Record<string, ElementShape> = {
  disc: 'circle',
  circle: 'circle',
  square: 'square',
  diamond: 'diamond',
  triangle: 'diamond', // closest available
  image: 'rectangle',
};

// ============================================================================
// GEXF Import
// ============================================================================

export async function importGEXF(
  content: string,
  targetDossierId: DossierId,
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
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');

    // Check for XML parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      result.errors.push(t('errors.parseError'));
      return result;
    }

    // Validate root element (handle namespaced or non-namespaced)
    const gexf = doc.querySelector('gexf') || doc.documentElement;
    if (!gexf || gexf.localName !== 'gexf') {
      result.errors.push(t('errors.invalidGexf'));
      return result;
    }

    // Find graph element
    const graph = gexf.querySelector('graph');
    if (!graph) {
      result.errors.push(t('errors.missingGraph'));
      return result;
    }

    const defaultEdgeType = graph.getAttribute('edgedefault') || 'undirected';
    const isDirectedByDefault = defaultEdgeType === 'directed';

    // Parse attribute definitions: <attributes class="node|edge"> → <attribute id title type>
    const nodeAttrDefs = new Map<string, { title: string; type: string }>();
    const edgeAttrDefs = new Map<string, { title: string; type: string }>();

    for (const attrs of Array.from(gexf.querySelectorAll('attributes'))) {
      const cls = attrs.getAttribute('class') || '';
      const targetMap = cls === 'edge' ? edgeAttrDefs : nodeAttrDefs;
      for (const attr of Array.from(attrs.querySelectorAll('attribute'))) {
        const id = attr.getAttribute('id');
        const title = attr.getAttribute('title') || id || '';
        const type = attr.getAttribute('type') || 'string';
        if (id) targetMap.set(id, { title, type });
      }
    }

    // ID mapping: GEXF node id → ZeroNeurone ElementId
    const nodeIdMap = new Map<string, ElementId>();

    // Grid layout for nodes without viz:position
    let gridX = 0;
    let gridY = 0;
    const gridSpacing = 200;
    const gridCols = 10;

    // Import nodes — two-pass: collect then write (to scale sizes proportionally)
    const nodesContainer = graph.querySelector('nodes');
    const xmlNodes = nodesContainer
      ? Array.from(nodesContainer.querySelectorAll(':scope > node'))
      : Array.from(graph.querySelectorAll('node'));

    // Pass 1: parse all nodes and collect raw sizes
    interface ParsedNode {
      element: Element;
      rawSize: number | null;
    }
    const parsedNodes: ParsedNode[] = [];

    for (const node of xmlNodes) {
      const gexfId = node.getAttribute('id');
      if (!gexfId) {
        result.warnings.push(t('warnings.nodeNoId'));
        continue;
      }

      const label = node.getAttribute('label') || gexfId;
      const newId = generateUUID() as ElementId;
      nodeIdMap.set(gexfId, newId);

      // Parse attvalues
      const properties: Property[] = [];
      for (const av of Array.from(node.querySelectorAll('attvalue'))) {
        const forId = av.getAttribute('for');
        const value = av.getAttribute('value');
        if (forId != null && value != null) {
          const def = nodeAttrDefs.get(forId);
          const key = def?.title || forId;
          const gexfType = def?.type || '';
          const propType = (gexfType === 'integer' || gexfType === 'float' || gexfType === 'double' || gexfType === 'long')
            ? 'number' : (gexfType === 'boolean' ? 'boolean' : inferPropertyType(value));
          properties.push({ key, value, type: propType });
        }
      }
      properties.push({ key: 'gephi_id', value: gexfId, type: 'text' });

      // Parse viz:position
      const vizPos = node.querySelector('position') ||
        findVizElement(node, 'position');
      let position = { x: gridX * gridSpacing, y: gridY * gridSpacing };
      if (vizPos) {
        const px = parseFloat(vizPos.getAttribute('x') || '0');
        const py = parseFloat(vizPos.getAttribute('y') || '0');
        if (!isNaN(px) && !isNaN(py)) {
          position = { x: px, y: -py }; // Gephi Y is inverted
        }
      } else {
        gridX++;
        if (gridX >= gridCols) { gridX = 0; gridY++; }
      }

      // Parse viz:color
      let color = DEFAULT_ELEMENT_VISUAL.color;
      const vizColor = node.querySelector('color') ||
        findVizElement(node, 'color');
      if (vizColor) {
        const hex = vizColor.getAttribute('hex');
        if (hex) {
          color = hex;
        } else {
          const r = parseInt(vizColor.getAttribute('r') || '0');
          const g = parseInt(vizColor.getAttribute('g') || '0');
          const b = parseInt(vizColor.getAttribute('b') || '0');
          color = rgbToHex(r, g, b);
        }
      }

      // Parse viz:size (raw value, will be scaled after collecting all nodes)
      let rawSize: number | null = null;
      const vizSize = node.querySelector('size') ||
        findVizElement(node, 'size');
      if (vizSize) {
        const val = parseFloat(vizSize.getAttribute('value') || '0');
        if (val > 0) rawSize = val;
      }

      // Parse viz:shape
      let shape: ElementShape = DEFAULT_ELEMENT_VISUAL.shape;
      const vizShape = node.querySelector('shape') ||
        findVizElement(node, 'shape');
      if (vizShape) {
        const val = vizShape.getAttribute('value') || '';
        shape = GEXF_SHAPE_MAP[val.toLowerCase()] || shape;
      }

      parsedNodes.push({
        rawSize,
        element: {
          id: newId,
          dossierId: targetDossierId,
          label,
          notes: '',
          tags: ['gephi'],
          properties,
          confidence: null,
          source: 'GEXF',
          date: null,
          dateRange: null,
          position,
          isPositionLocked: false,
          geo: null,
          visual: {
            ...DEFAULT_ELEMENT_VISUAL,
            color,
            borderColor: darkenColor(color),
            shape,
            size: 'medium', // placeholder, scaled below
          },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Pass 2: scale sizes proportionally and write to DB
    const scaledSizes = scaleGephiSizes(parsedNodes.map(n => n.rawSize));
    for (let i = 0; i < parsedNodes.length; i++) {
      parsedNodes[i].element.visual.size = scaledSizes[i];
      await db.elements.add(parsedNodes[i].element);
      result.elementsImported++;
    }

    // Import edges
    const edgesContainer = graph.querySelector('edges');
    const edges = edgesContainer
      ? Array.from(edgesContainer.querySelectorAll(':scope > edge'))
      : Array.from(graph.querySelectorAll('edge'));

    for (const edge of edges) {
      const sourceId = edge.getAttribute('source');
      const targetId = edge.getAttribute('target');
      if (!sourceId || !targetId) {
        result.warnings.push(t('warnings.edgeNoSourceTarget'));
        continue;
      }

      const fromId = nodeIdMap.get(sourceId);
      const toId = nodeIdMap.get(targetId);
      if (!fromId || !toId) {
        result.warnings.push(t('warnings.edgeMissingNode'));
        continue;
      }

      const edgeLabel = edge.getAttribute('label') || '';
      const edgeType = edge.getAttribute('type') || defaultEdgeType;
      const isDirected = edgeType === 'directed' || (edgeType !== 'undirected' && isDirectedByDefault);
      const weight = parseFloat(edge.getAttribute('weight') || '1');

      // Parse edge attvalues
      const linkProperties: Property[] = [];
      for (const av of Array.from(edge.querySelectorAll('attvalue'))) {
        const forId = av.getAttribute('for');
        const value = av.getAttribute('value');
        if (forId != null && value != null) {
          const def = edgeAttrDefs.get(forId);
          const key = def?.title || forId;
          const gexfType = def?.type || '';
          const propType = (gexfType === 'integer' || gexfType === 'float' || gexfType === 'double' || gexfType === 'long')
            ? 'number' : (gexfType === 'boolean' ? 'boolean' : inferPropertyType(value));
          linkProperties.push({ key, value, type: propType });
        }
      }

      // Parse viz:color for edge
      let edgeColor = DEFAULT_LINK_VISUAL.color;
      const vizColor = edge.querySelector('color') ||
        findVizElement(edge, 'color');
      if (vizColor) {
        const hex = vizColor.getAttribute('hex');
        if (hex) {
          edgeColor = hex;
        } else {
          const r = parseInt(vizColor.getAttribute('r') || '0');
          const g = parseInt(vizColor.getAttribute('g') || '0');
          const b = parseInt(vizColor.getAttribute('b') || '0');
          edgeColor = rgbToHex(r, g, b);
        }
      }

      // Parse viz:thickness
      let thickness = DEFAULT_LINK_VISUAL.thickness;
      const vizThickness = edge.querySelector('thickness') ||
        findVizElement(edge, 'thickness');
      if (vizThickness) {
        const val = parseFloat(vizThickness.getAttribute('value') || '0');
        if (val > 0) thickness = Math.max(1, Math.min(10, Math.round(val)));
      } else if (weight > 0 && weight !== 1) {
        // Use weight as thickness hint
        thickness = Math.max(1, Math.min(10, Math.round(weight)));
      }

      const link: Link = {
        id: generateUUID() as LinkId,
        dossierId: targetDossierId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label: edgeLabel,
        notes: '',
        tags: ['gephi'],
        properties: linkProperties,
        confidence: null,
        source: 'GEXF',
        date: null,
        dateRange: null,
        directed: isDirected,
        direction: isDirected ? 'forward' : 'none',
        visual: {
          ...DEFAULT_LINK_VISUAL,
          color: edgeColor,
          thickness,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      result.linksImported++;
    }

    // Extract GEXF <meta> and append to dossier description
    const meta = gexf.querySelector('meta');
    if (meta) {
      const parts: string[] = [];
      const creator = meta.querySelector('creator')?.textContent?.trim();
      const description = meta.querySelector('description')?.textContent?.trim();
      const keywords = meta.querySelector('keywords')?.textContent?.trim();
      if (description) parts.push(description);
      if (creator) parts.push(`Creator: ${creator}`);
      if (keywords) parts.push(`Keywords: ${keywords}`);
      if (parts.length > 0) {
        const dossier = await db.dossiers.get(targetDossierId);
        if (dossier) {
          const existing = dossier.description?.trim();
          const metaText = `[GEXF] ${parts.join(' | ')}`;
          await db.dossiers.update(targetDossierId, {
            description: existing ? `${existing}\n${metaText}` : metaText,
            updatedAt: new Date(),
          });
        }
      }
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(t('errors.importError', {
      message: error instanceof Error ? error.message : t('errors.unknownError'),
    }));
  }

  return result;
}

// ============================================================================
// Gephi Lite JSON Import
// ============================================================================

/** Expected structure of a Gephi Lite workspace JSON */
interface GephiLiteWorkspace {
  type: 'gephi-lite';
  version?: string;
  graphDataset: {
    fullGraph: {
      nodes?: Array<{ key: string; attributes?: Record<string, unknown> }>;
      edges?: Array<{
        key?: string;
        source: string;
        target: string;
        attributes?: Record<string, unknown>;
        undirected?: boolean;
      }>;
      options?: {
        type?: 'directed' | 'undirected' | 'mixed';
      };
    };
    nodeData?: Record<string, Record<string, unknown>>;
    edgeData?: Record<string, Record<string, unknown>>;
    layout?: Record<string, { x: number; y: number }>;
    nodeRenderingData?: Record<string, {
      x?: number;
      y?: number;
      color?: string;
      size?: number;
      label?: string | null;
      image?: string | null;
    }>;
    edgeRenderingData?: Record<string, {
      color?: string;
      weight?: number;
      label?: string | null;
    }>;
    metadata?: {
      title?: string;
      description?: string;
    };
    nodeFields?: Array<{ id: string; itemType: string }>;
    edgeFields?: Array<{ id: string; itemType: string }>;
  };
  appearance?: {
    nodesColor?: {
      type: string;
      field?: { id: string; itemType: string; type: string };
      colorPalette?: Record<string, string>;
      missingColor?: string;
      value?: string;
    };
    edgesColor?: {
      type: string;
      field?: { id: string; itemType: string; type: string };
      colorPalette?: Record<string, string>;
      missingColor?: string;
      value?: string;
    };
    edgesSize?: {
      type: string;
      field?: { id: string; itemType: string; type: string };
      missingSize?: number;
      minSize?: number;
      maxSize?: number;
    };
  };
}

export async function importGephiLiteJSON(
  content: string,
  targetDossierId: DossierId,
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
    const data = JSON.parse(content) as GephiLiteWorkspace;

    if (!data.graphDataset) {
      result.errors.push(t('errors.missingDataset'));
      return result;
    }

    const ds = data.graphDataset;
    const fullGraph = ds.fullGraph;

    if (!fullGraph || !fullGraph.nodes || fullGraph.nodes.length === 0) {
      result.errors.push(t('errors.invalidGephiLite'));
      return result;
    }

    const defaultGraphType = fullGraph.options?.type || 'undirected';
    const isDirectedByDefault = defaultGraphType === 'directed';

    // Build color palette from appearance if available (partition by field)
    const nodesColorCfg = data.appearance?.nodesColor;
    const colorPalette = nodesColorCfg?.colorPalette;
    const colorFieldId = nodesColorCfg?.type === 'partition' ? nodesColorCfg.field?.id : null;
    const fixedColor = nodesColorCfg?.type === 'fixed' ? nodesColorCfg.value : null;

    // Edge appearance config
    const edgesColorCfg = data.appearance?.edgesColor;
    const edgeColorPalette = edgesColorCfg?.colorPalette;
    const edgeColorFieldId = edgesColorCfg?.type === 'partition' ? edgesColorCfg.field?.id : null;
    const edgeFixedColor = edgesColorCfg?.type === 'fixed' ? edgesColorCfg.value : null;

    const edgesSizeCfg = data.appearance?.edgesSize;
    const edgeSizeFieldId = edgesSizeCfg?.type === 'ranking' ? edgesSizeCfg.field?.id : null;
    const edgeSizeMin = edgesSizeCfg?.minSize ?? 1;
    const edgeSizeMax = edgesSizeCfg?.maxSize ?? 10;
    const edgeSizeMissing = edgesSizeCfg?.missingSize ?? 1;

    // ID mapping: Gephi Lite node key → ZeroNeurone ElementId
    const nodeIdMap = new Map<string, ElementId>();

    // Grid layout fallback
    let gridX = 0;
    let gridY = 0;
    const gridSpacing = 200;
    const gridCols = 10;

    // Import nodes — two-pass: collect then write (to scale sizes proportionally)
    interface ParsedLiteNode {
      element: Element;
      rawSize: number | null;
    }
    const parsedLiteNodes: ParsedLiteNode[] = [];

    for (const node of fullGraph.nodes) {
      const key = node.key;
      if (!key) continue;

      const newId = generateUUID() as ElementId;
      nodeIdMap.set(key, newId);

      // Resolve label: renderingData > nodeData > node attributes > key
      const renderData = ds.nodeRenderingData?.[key];
      const nodeData = ds.nodeData?.[key];
      const label = renderData?.label
        || (nodeData?.label != null ? String(nodeData.label) : null)
        || (node.attributes?.label != null ? String(node.attributes.label) : null)
        || key;

      // Build properties from nodeData (exclude rendering fields, keep rawSize)
      const properties: Property[] = [];
      const renderingFields = new Set(['label', 'color', 'size', 'x', 'y', 'image', 'fixed']);
      if (nodeData) {
        for (const [k, v] of Object.entries(nodeData)) {
          if (v != null && !renderingFields.has(k)) {
            properties.push({ key: k, value: String(v), type: inferPropertyType(v) });
          }
        }
      }
      // Also add node.attributes if present
      if (node.attributes) {
        for (const [k, v] of Object.entries(node.attributes)) {
          if (v != null && !renderingFields.has(k) && !properties.some(p => p.key === k)) {
            properties.push({ key: k, value: String(v), type: inferPropertyType(v) });
          }
        }
      }
      properties.push({ key: 'gephi_id', value: key, type: 'text' });

      // Position: layout > renderingData > grid fallback
      let position = { x: gridX * gridSpacing, y: gridY * gridSpacing };
      const layoutPos = ds.layout?.[key];
      if (layoutPos && typeof layoutPos.x === 'number' && typeof layoutPos.y === 'number') {
        position = { x: layoutPos.x, y: -layoutPos.y }; // Gephi Y inverted
      } else if (renderData && typeof renderData.x === 'number' && typeof renderData.y === 'number') {
        position = { x: renderData.x, y: -renderData.y };
      } else {
        gridX++;
        if (gridX >= gridCols) { gridX = 0; gridY++; }
      }

      // Color: appearance palette > renderingData > nodeData.color > default
      let color = DEFAULT_ELEMENT_VISUAL.color;
      if (fixedColor) {
        color = parseColorToHex(fixedColor) || color;
      } else if (colorPalette && colorFieldId && nodeData?.[colorFieldId] != null) {
        const paletteKey = String(nodeData[colorFieldId]);
        color = colorPalette[paletteKey] || color;
      } else {
        const rawColor = renderData?.color
          || (nodeData?.color != null ? String(nodeData.color) : null);
        color = (rawColor ? parseColorToHex(rawColor) : null) || color;
      }

      // Raw size: renderingData.size > nodeData.size (scaled proportionally after collecting all nodes)
      const renderSize = renderData?.size;
      const dataSize = nodeData?.size != null ? Number(nodeData.size) : null;
      const rawSize = (renderSize != null && renderSize > 0) ? renderSize
        : (dataSize != null && dataSize > 0) ? dataSize
        : null;

      parsedLiteNodes.push({
        rawSize,
        element: {
          id: newId,
          dossierId: targetDossierId,
          label,
          notes: '',
          tags: ['gephi'],
          properties,
          confidence: null,
          source: 'Gephi Lite',
          date: null,
          dateRange: null,
          position,
          isPositionLocked: false,
          geo: null,
          visual: {
            ...DEFAULT_ELEMENT_VISUAL,
            color,
            borderColor: darkenColor(color),
            shape: 'circle',
            size: 'medium', // placeholder, scaled below
          },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Pass 2: scale sizes proportionally and write to DB
    const scaledLiteSizes = scaleGephiSizes(parsedLiteNodes.map(n => n.rawSize));
    for (let i = 0; i < parsedLiteNodes.length; i++) {
      parsedLiteNodes[i].element.visual.size = scaledLiteSizes[i];
      await db.elements.add(parsedLiteNodes[i].element);
      result.elementsImported++;
    }

    // Import edges — two-pass for proportional thickness scaling
    interface ParsedLiteEdge {
      link: Link;
      rawThicknessField: number | null;
    }
    const parsedLiteEdges: ParsedLiteEdge[] = [];

    if (fullGraph.edges) {
      for (const edge of fullGraph.edges) {
        if (!edge.source || !edge.target) continue;

        const fromId = nodeIdMap.get(edge.source);
        const toId = nodeIdMap.get(edge.target);
        if (!fromId || !toId) {
          result.warnings.push(t('warnings.edgeMissingNode'));
          continue;
        }

        const edgeKey = edge.key || `${edge.source}-${edge.target}`;
        const edgeRender = ds.edgeRenderingData?.[edgeKey];
        const edgeData = ds.edgeData?.[edgeKey];

        // Label
        const edgeLabel = edgeRender?.label
          || (edgeData?.label != null ? String(edgeData.label) : '')
          || (edge.attributes?.label != null ? String(edge.attributes.label) : '');

        // Directed
        const isDirected = edge.undirected === true ? false : isDirectedByDefault;

        // Color: appearance palette > edgeRenderingData > default
        let edgeColor = DEFAULT_LINK_VISUAL.color;
        if (edgeFixedColor) {
          edgeColor = parseColorToHex(edgeFixedColor) || edgeColor;
        } else if (edgeColorPalette && edgeColorFieldId && edgeData?.[edgeColorFieldId] != null) {
          const paletteKey = String(edgeData[edgeColorFieldId]);
          edgeColor = edgeColorPalette[paletteKey] || edgeColor;
        } else if (edgeRender?.color) {
          edgeColor = parseColorToHex(edgeRender.color) || edgeColor;
        }

        // Collect raw thickness field value for ranking (scaled in pass 2)
        let rawThicknessField: number | null = null;
        let thickness = DEFAULT_LINK_VISUAL.thickness;
        if (edgeSizeFieldId && edgeData?.[edgeSizeFieldId] != null) {
          const fieldVal = Number(edgeData[edgeSizeFieldId]);
          if (!isNaN(fieldVal) && fieldVal > 0) {
            rawThicknessField = fieldVal;
          } else {
            thickness = Math.max(1, Math.min(10, Math.round(edgeSizeMissing)));
          }
        } else {
          const weight = edgeRender?.weight ?? (edgeData?.weight != null ? Number(edgeData.weight) : null);
          if (weight != null && weight > 0 && weight !== 1) {
            thickness = Math.max(1, Math.min(10, Math.round(weight)));
          }
        }

        // Build properties from edgeData
        const linkProperties: Property[] = [];
        const edgeRenderFields = new Set(['label', 'color', 'weight', 'rawWeight']);
        if (edgeData) {
          for (const [k, v] of Object.entries(edgeData)) {
            if (v != null && !edgeRenderFields.has(k)) {
              linkProperties.push({ key: k, value: String(v), type: inferPropertyType(v) });
            }
          }
        }
        if (edge.attributes) {
          for (const [k, v] of Object.entries(edge.attributes)) {
            if (v != null && !edgeRenderFields.has(k) && !linkProperties.some(p => p.key === k)) {
              linkProperties.push({ key: k, value: String(v), type: inferPropertyType(v) });
            }
          }
        }

        parsedLiteEdges.push({
          rawThicknessField,
          link: {
            id: generateUUID() as LinkId,
            dossierId: targetDossierId,
            fromId,
            toId,
            sourceHandle: null,
            targetHandle: null,
            label: edgeLabel,
            notes: '',
            tags: ['gephi'],
            properties: linkProperties,
            confidence: null,
            source: 'Gephi Lite',
            date: null,
            dateRange: null,
            directed: isDirected,
            direction: isDirected ? 'forward' : 'none',
            visual: {
              ...DEFAULT_LINK_VISUAL,
              color: edgeColor,
              thickness,
            },
            curveOffset: { x: 0, y: 0 },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    }

    // Pass 2: scale edge thickness proportionally for ranking mode, then write
    if (edgeSizeFieldId) {
      const rawVals = parsedLiteEdges.map(e => e.rawThicknessField);
      const validVals = rawVals.filter((v): v is number => v != null && v > 0);
      if (validVals.length > 0) {
        const minVal = Math.min(...validVals);
        const maxVal = Math.max(...validVals);
        const range = maxVal - minVal;
        for (let i = 0; i < parsedLiteEdges.length; i++) {
          const raw = rawVals[i];
          if (raw != null && raw > 0) {
            const ratio = range > 0 ? (raw - minVal) / range : 0.5;
            parsedLiteEdges[i].link.visual.thickness = Math.max(1, Math.min(10,
              Math.round(edgeSizeMin + ratio * (edgeSizeMax - edgeSizeMin))
            ));
          }
        }
      }
    }

    for (const parsed of parsedLiteEdges) {
      await db.links.add(parsed.link);
      result.linksImported++;
    }

    // Append metadata to dossier description
    const metaTitle = ds.metadata?.title;
    const metaDesc = ds.metadata?.description;
    if (metaTitle || metaDesc) {
      const parts: string[] = [];
      if (metaTitle) parts.push(metaTitle);
      if (metaDesc) parts.push(metaDesc);
      const metaText = `[Gephi Lite] ${parts.join(' — ')}`;
      const dossier = await db.dossiers.get(targetDossierId);
      if (dossier) {
        const existing = dossier.description?.trim();
        await db.dossiers.update(targetDossierId, {
          description: existing ? `${existing}\n${metaText}` : metaText,
          updatedAt: new Date(),
        });
      }
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, { updatedAt: new Date() });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(t('errors.importError', {
      message: error instanceof Error ? error.message : t('errors.unknownError'),
    }));
  }

  return result;
}

// ============================================================================
// Utility functions
// ============================================================================

/** Find a viz-namespaced element (handles both prefixed and unprefixed) */
function findVizElement(parent: globalThis.Element, localName: string): globalThis.Element | null {
  // Try with viz: prefix
  const prefixed = parent.querySelector(`viz\\:${localName}`);
  if (prefixed) return prefixed;
  // Try namespace-aware lookup
  const byNS = parent.getElementsByTagNameNS('http://gexf.net/1.3/viz', localName);
  if (byNS.length > 0) return byNS[0];
  const byNS12 = parent.getElementsByTagNameNS('http://gexf.net/1.2/viz', localName);
  if (byNS12.length > 0) return byNS12[0];
  return null;
}

/** Convert RGB values to hex color string */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Infer property type from a value */
function inferPropertyType(value: unknown): import('../types').PropertyType {
  if (typeof value === 'number' || (typeof value === 'string' && value !== '' && !isNaN(Number(value)) && isFinite(Number(value)))) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

/** Parse CSS color string (hex or rgb()) to hex */
function parseColorToHex(color: string): string | null {
  if (color.startsWith('#')) return color;
  const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (match) return rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
  return null;
}

/**
 * Scale raw Gephi sizes to ZeroNeurone pixel sizes, preserving proportions.
 * Uses the raw values directly (they represent circle diameter in Gephi),
 * with a minimum floor so small nodes remain visible.
 * If all values are identical, returns medium (56px).
 */
function scaleGephiSizes(rawSizes: (number | null)[]): (number | 'medium')[] {
  const valid = rawSizes.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return rawSizes.map(() => 'medium');

  const maxRaw = Math.max(...valid);
  if (maxRaw === 0) return rawSizes.map(() => 'medium');

  // If all identical, return medium equivalent
  const minRaw = Math.min(...valid);
  if (maxRaw === minRaw) return rawSizes.map(v => v != null && v > 0 ? 56 : 'medium');

  // Scale so that max → MAX_SIZE_PX, preserving ratios, with a floor at MIN_SIZE_PX
  const scale = MAX_SIZE_PX / maxRaw;
  return rawSizes.map(v => {
    if (v == null || v <= 0) return 'medium';
    return Math.max(MIN_SIZE_PX, Math.round(v * scale));
  });
}

/** Darken a hex color for border usage */
function darkenColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return '#737373';
  try {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 60);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 60);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 60);
    return rgbToHex(r, g, b);
  } catch {
    return '#737373';
  }
}
