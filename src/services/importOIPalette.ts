import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  InvestigationId,
  Element,
  ElementId,
  Link,
  Position,
  GeoCoordinates,
  Property,
  AssetId,
} from '../types';
import { db } from '../db/database';
import { fileService } from './fileService';
import { dataUrlToFile } from './importOsintracker';
import type { ImportResult } from './importService';

// ============================================================================
// Graph Palette (OSINT Industries) Format Types
// ============================================================================

interface PaletteSpecFormatEntry {
  type: string;        // 'bool', 'short_text', 'url', 'str', 'int', etc.
  proper_key: string;  // Display name e.g. "Registered", "Name", "Profile Url"
  value: unknown;      // The actual value
  key: string;         // Machine key e.g. "registered", "name", "profile_url"
  platformVariable: boolean;
}

interface PaletteMapEntry {
  type: string;        // 'lat_lng'
  lat_lng?: [number, number];
  popup?: {
    title?: string;
    subtitle?: string;
    date?: string;
    comment?: string;
    url?: string;
  };
}

interface PaletteWidgetContent {
  contact_type?: string;
  value?: string;
  is_obfuscated?: boolean;
  [key: string]: unknown;
}

interface PaletteWidget {
  type: string;        // 'contact_point'
  content?: PaletteWidgetContent[];
}

interface PaletteModuleResult {
  module?: string;
  pretty_name?: string;
  category?: { name?: string };
  spec_format?: PaletteSpecFormatEntry[];
  widgets?: PaletteWidget[];
  front_schema?: {
    map?: PaletteMapEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface PaletteNodeData {
  label?: string;
  queryType?: string;
  query?: string;
  moduleResult?: PaletteModuleResult;
  // locationNode fields
  latitude?: number;
  longitude?: number;
  address?: string;
  // groupNode fields
  title?: string;
  // imageNode fields
  imageSrc?: string;
  [key: string]: unknown;
}

interface PaletteEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  [key: string]: unknown;
}

interface PaletteNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: PaletteNodeData;
  parentId?: string;
  measured?: { width: number; height: number };
  [key: string]: unknown;
}

interface PaletteGraphData {
  nodes: PaletteNode[];
  edges?: PaletteEdge[];
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** Node types to import (others are ignored) */
const IMPORTABLE_TYPES = new Set([
  'textNode',
  'moduleNode',
  'locationNode',
  'groupNode',
]);

/** Node types to skip entirely */
const SKIP_TYPES = new Set([
  'imageNode',
  'timelineNode',
]);

/** spec_format keys that represent profile images (handled as assets) */
const IMAGE_KEYS = new Set(['profile_pic', 'picture_url', 'profile_image']);

/** spec_format keys to skip (internal/non-useful) */
const SKIP_KEYS = new Set(['registered', 'platform_variables']);

// ============================================================================
// Parser
// ============================================================================

/**
 * Import a Graph Palette (OSINT Industries visual export) into an investigation
 */
export async function importOIPalette(
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
    const data = JSON.parse(content) as PaletteGraphData;

    if (!data.nodes || !Array.isArray(data.nodes)) {
      result.errors.push('Format Graph Palette invalide: champ "nodes" manquant');
      return result;
    }

    // Create ID mapping (Palette node ID -> new UUID)
    const nodeIdMap = new Map<string, ElementId>();

    // Build children map: parentId -> child nodes (for groupNode content extraction)
    const childrenByParent = new Map<string, PaletteNode[]>();
    for (const node of data.nodes) {
      if (node.parentId) {
        const children = childrenByParent.get(node.parentId) || [];
        children.push(node);
        childrenByParent.set(node.parentId, children);
      }
    }

    // Filter top-level importable nodes (skip imageNodes and children)
    const importableNodes = data.nodes.filter(node => {
      if (SKIP_TYPES.has(node.type)) return false;
      if (node.parentId) return false;
      if (!IMPORTABLE_TYPES.has(node.type)) {
        result.warnings.push(`Type de noeud ignoré: ${node.type} (${node.data?.label || node.id})`);
        return false;
      }
      return true;
    });

    // Import top-level nodes + promote group children as tagged elements
    for (const node of importableNodes) {
      // For groupNodes: promote meaningful children as individual elements tagged with group title
      if (node.type === 'groupNode') {
        const children = childrenByParent.get(node.id) || [];
        const groupTag = node.data.title || node.data.label || 'Groupe';

        const meaningfulChildren = children.filter(
          child => child.type === 'textNode' || child.type === 'moduleNode'
        );

        if (meaningfulChildren.length > 0) {
          for (const child of meaningfulChildren) {
            const { element, warnings: childWarnings, assetsImported } = await convertPaletteNode(
              child, targetInvestigationId, groupTag
            );
            if (childWarnings.length > 0) result.warnings.push(...childWarnings);
            result.assetsImported += assetsImported;
            if (!element) continue;

            // Compute absolute position: group position + child relative position
            element.position = {
              x: node.position.x + child.position.x,
              y: node.position.y + child.position.y,
            };

            nodeIdMap.set(child.id, element.id);
            await db.elements.add(element);
            result.elementsImported++;
          }
          // Also map the group ID to the first child for edge resolution
          if (meaningfulChildren.length > 0) {
            const firstChildId = nodeIdMap.get(meaningfulChildren[0].id);
            if (firstChildId) nodeIdMap.set(node.id, firstChildId);
          }
          continue;
        }
        // If no meaningful children, fall through to create group as regular element
      }

      const { element, warnings, assetsImported } = await convertPaletteNode(node, targetInvestigationId);

      if (warnings.length > 0) {
        result.warnings.push(...warnings);
      }
      result.assetsImported += assetsImported;

      if (!element) continue;

      nodeIdMap.set(node.id, element.id);
      await db.elements.add(element);
      result.elementsImported++;
    }

    // Import edges
    if (data.edges && Array.isArray(data.edges)) {
      for (const edge of data.edges) {
        if (!edge.source || !edge.target) {
          result.warnings.push(`Lien ignoré: source ou target manquant`);
          continue;
        }

        const fromId = nodeIdMap.get(edge.source);
        const toId = nodeIdMap.get(edge.target);

        if (!fromId || !toId) {
          // Skip silently - likely an edge to a skipped node type
          continue;
        }

        const link: Link = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          fromId,
          toId,
          sourceHandle: null,
          targetHandle: null,
          label: '',
          notes: '',
          tags: [],
          properties: [],
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          directed: true,
          direction: 'forward',
          visual: { ...DEFAULT_LINK_VISUAL },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        result.linksImported++;
      }
    }

    // Update investigation timestamp
    await db.investigations.update(targetInvestigationId, {
      updatedAt: new Date(),
    });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      `Erreur d'import Graph Palette: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}

/**
 * Convert a Palette node to a ZeroNeurone Element
 * @param groupTag - If set, overrides the tag (used for children promoted from a groupNode)
 */
async function convertPaletteNode(
  node: PaletteNode,
  investigationId: InvestigationId,
  groupTag?: string
): Promise<{ element: Element | null; warnings: string[]; assetsImported: number }> {
  const warnings: string[] = [];
  const properties: Property[] = [];
  const assetIds: AssetId[] = [];
  let visualImageId: AssetId | null = null;
  let assetsImported = 0;
  let label = '';
  let tags: string[] = [];
  let geo: GeoCoordinates | null = null;
  let notes = '';

  const position: Position = {
    x: node.position.x,
    y: node.position.y,
  };

  switch (node.type) {
    case 'textNode': {
      if (node.data.queryType) {
        label = node.data.query || node.data.label || node.id;
        const queryTag = node.data.queryType === 'email' ? 'Email' :
                         node.data.queryType === 'phone' ? 'Téléphone' :
                         node.data.queryType === 'username' ? 'Pseudo' : 'Recherche';
        tags = [queryTag];
        properties.push({ key: 'query_type', value: node.data.queryType, type: 'text' });
      } else {
        label = node.data.label || node.id;
        tags = ['Données'];
      }
      break;
    }

    case 'moduleNode': {
      const modResult = node.data.moduleResult;
      label = modResult?.pretty_name || node.data.label || node.id;
      const categoryTag = modResult?.category?.name || 'Autre';
      tags = [categoryTag];

      const isMapModule = modResult?.module === 'maps' || modResult?.module === 'google_maps';

      // Extract properties from spec_format array
      if (modResult?.spec_format && Array.isArray(modResult.spec_format) && !isMapModule) {
        for (const entry of modResult.spec_format) {
          if (!entry || typeof entry !== 'object') continue;
          const key = entry.key || '';
          const properKey = entry.proper_key || key;

          // Skip internal/meta fields
          if (SKIP_KEYS.has(key)) continue;

          // Skip image fields (handled separately)
          if (IMAGE_KEYS.has(key)) continue;

          // Skip null/empty values
          if (entry.value === null || entry.value === undefined || entry.value === '') continue;

          // Add as property
          const propType = entry.type === 'url' ? 'link' :
                           entry.type === 'int' || entry.type === 'float' ? 'number' : 'text';
          properties.push({
            key: properKey,
            value: String(entry.value),
            type: propType,
          });
        }
      }

      // Handle Google Maps module: extract from front_schema.map
      if (isMapModule && modResult?.front_schema?.map && Array.isArray(modResult.front_schema.map)) {
        const mapEntries = modResult.front_schema.map;
        const noteParts: string[] = [];

        for (const entry of mapEntries) {
          if (entry.type !== 'lat_lng') continue;

          // Use first valid lat_lng for geo
          if (!geo && entry.lat_lng && Array.isArray(entry.lat_lng) && entry.lat_lng.length >= 2) {
            const [lat, lng] = entry.lat_lng;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
              geo = { lat, lng };
            }
          }

          // Extract popup info as notes
          if (entry.popup) {
            const parts: string[] = [];
            if (entry.popup.title) parts.push(`**${entry.popup.title}**`);
            if (entry.popup.subtitle) parts.push(entry.popup.subtitle);
            if (entry.popup.date) parts.push(`_${entry.popup.date}_`);
            if (entry.popup.comment) parts.push(entry.popup.comment);
            if (entry.popup.url) parts.push(entry.popup.url);
            if (parts.length > 0) noteParts.push(parts.join('\n'));
          }
        }

        if (noteParts.length > 0) {
          notes = noteParts.join('\n\n---\n\n');
        }

        if (geo) {
          properties.push({ key: 'Latitude', value: String(geo.lat), type: 'number' });
          properties.push({ key: 'Longitude', value: String(geo.lng), type: 'number' });
        }

        properties.push({ key: 'Lieux', value: String(mapEntries.length), type: 'number' });
      }

      // Handle profile images from spec_format
      if (modResult?.spec_format && Array.isArray(modResult.spec_format)) {
        for (const entry of modResult.spec_format) {
          if (!entry || typeof entry !== 'object') continue;
          if (!IMAGE_KEYS.has(entry.key)) continue;
          if (!entry.value || typeof entry.value !== 'string') continue;

          const picValue = entry.value;
          if (picValue.startsWith('data:image/')) {
            try {
              const filename = `${label.replace(/[^a-zA-Z0-9]/g, '_')}_pic.png`;
              const file = dataUrlToFile(picValue, filename);
              const asset = await fileService.saveAsset(investigationId, file);
              assetIds.push(asset.id);
              visualImageId = asset.id;
              assetsImported++;
            } catch {
              warnings.push(`Image ignorée pour "${label}": erreur de conversion`);
            }
          } else if (picValue.startsWith('http')) {
            properties.push({ key: entry.proper_key || 'Image', value: picValue, type: 'link' });
          }
          break; // Only handle first image found
        }
      }

      // Extract contact points from widgets
      if (modResult?.widgets && Array.isArray(modResult.widgets)) {
        for (const widget of modResult.widgets) {
          if (widget.type !== 'contact_point' || !Array.isArray(widget.content)) continue;
          for (const contact of widget.content) {
            if (!contact.value || contact.is_obfuscated) continue;
            const key = contact.contact_type || 'Contact';
            properties.push({ key, value: String(contact.value), type: 'text' });
          }
        }
      }

      // Add module identifier
      if (modResult?.module) {
        properties.push({ key: 'module_id', value: modResult.module, type: 'text' });
      }
      break;
    }

    case 'locationNode': {
      label = node.data.address || node.data.label || 'Lieu';
      tags = ['Lieu'];

      if (node.data.latitude !== undefined && node.data.longitude !== undefined) {
        const lat = typeof node.data.latitude === 'number' ? node.data.latitude : parseFloat(String(node.data.latitude));
        const lng = typeof node.data.longitude === 'number' ? node.data.longitude : parseFloat(String(node.data.longitude));
        if (!isNaN(lat) && !isNaN(lng)) {
          geo = { lat, lng };
          properties.push({ key: 'Latitude', value: String(lat), type: 'number' });
          properties.push({ key: 'Longitude', value: String(lng), type: 'number' });
        }
      }

      if (node.data.address) {
        properties.push({ key: 'Adresse', value: node.data.address, type: 'text' });
      }
      break;
    }

    case 'groupNode': {
      label = node.data.title || node.data.label || 'Groupe';
      tags = ['Groupe'];
      break;
    }

    default:
      warnings.push(`Type non géré: ${node.type}`);
      return { element: null, warnings, assetsImported: 0 };
  }

  // Override tag with group title when this node is a child promoted from a groupNode
  if (groupTag) {
    tags = [groupTag];
  }

  const element: Element = {
    id: generateUUID(),
    investigationId,
    label,
    notes,
    tags,
    properties,
    confidence: null,
    source: 'OSINT Industries',
    date: null,
    dateRange: null,
    position,
    geo,
    visual: { ...DEFAULT_ELEMENT_VISUAL, image: visualImageId },
    assetIds,
    parentGroupId: null,
    isGroup: node.type === 'groupNode',
    childIds: [],
    events: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { element, warnings, assetsImported };
}

/**
 * Detect if JSON content is a Graph Palette (OI) format
 */
export function isOIPaletteFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;

  // Must have nodes array
  if (!Array.isArray(obj.nodes)) return false;

  // Check for Palette-specific node types
  if (obj.nodes.length > 0) {
    const nodeTypes = new Set(
      (obj.nodes as Array<{ type?: string }>).map(n => n.type).filter(Boolean)
    );
    // Graph Palette has textNode, moduleNode, imageNode, locationNode, etc.
    return nodeTypes.has('textNode') || nodeTypes.has('moduleNode') || nodeTypes.has('imageNode');
  }

  return false;
}
