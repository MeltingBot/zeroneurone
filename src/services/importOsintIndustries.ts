import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  InvestigationId,
  Element,
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
// OSINT Industries Format Types
// ============================================================================

interface OISpecFormatField {
  type: string;        // 'bool', 'str', 'short_text', 'url', 'int', etc.
  proper_key: string;  // Display name e.g. "Registered", "Name"
  value: unknown;      // The actual value
}

interface OIWidgetContent {
  contact_type?: string;
  value?: string;
  is_obfuscated?: boolean;
  [key: string]: unknown;
}

interface OIWidget {
  type: string;        // 'contact_point'
  content?: OIWidgetContent[];
}

interface OIMapEntry {
  type: string;
  lat_lng?: [number, number];
  popup?: {
    title?: string;
    subtitle?: string;
    date?: string;
    comment?: string;
    url?: string;
  };
}

interface OIFrontSchema {
  map?: OIMapEntry[];
  [key: string]: unknown;
}

interface OIModule {
  module?: string;
  pretty_name?: string;
  query?: string;
  query_type?: string;
  status?: string;
  category?: {
    name?: string;
    [key: string]: unknown;
  };
  // Array of ONE wrapper dict: [{fieldName: {type, proper_key, value}, ...}]
  spec_format?: Array<Record<string, OISpecFormatField | unknown>>;
  widgets?: OIWidget[];
  // Array of ONE schema: [{module, body, tags, timeline, map}]
  front_schemas?: OIFrontSchema[];
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** spec_format keys that represent profile images (handled as assets) */
const IMAGE_KEYS = new Set(['profile_pic', 'picture_url', 'profile_image']);

/** spec_format keys to skip (internal/non-useful) */
const SKIP_KEYS = new Set(['registered', 'platform_variables']);

// ============================================================================
// Parser
// ============================================================================

/**
 * Import OSINT Industries JSON results into an investigation
 * Creates a central query element connected to found modules
 */
export async function importOsintIndustries(
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
    const modules = JSON.parse(content) as OIModule[];

    if (!Array.isArray(modules) || modules.length === 0) {
      result.errors.push('Format OSINT Industries invalide: tableau vide ou format incorrect');
      return result;
    }

    // Determine query from first module
    const firstModule = modules[0];
    const query = firstModule.query || 'Recherche';
    const queryType = firstModule.query_type || 'unknown';

    // Determine tag for query element
    const queryTag = queryType === 'email' ? 'Email' :
                     queryType === 'phone' ? 'Téléphone' :
                     queryType === 'username' ? 'Pseudo' : 'Recherche';

    // Create central query element
    const queryId = generateUUID();
    const centerPosition: Position = { x: 0, y: 0 };

    const queryElement: Element = {
      id: queryId,
      investigationId: targetInvestigationId,
      label: query,
      notes: '',
      tags: [queryTag],
      properties: [
        { key: 'type', value: queryType, type: 'text' },
      ],
      confidence: null,
      source: 'OSINT Industries',
      date: null,
      dateRange: null,
      position: centerPosition,
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

    await db.elements.add(queryElement);
    result.elementsImported++;

    // Filter found modules
    const foundModules = modules.filter(m => m.status === 'found');

    if (foundModules.length === 0) {
      result.warnings.push('Aucun module avec status "found" trouvé');
      result.success = true;
      return result;
    }

    // Calculate circle positions for modules around query
    const radius = 300;
    const angleStep = (2 * Math.PI) / foundModules.length;

    for (let i = 0; i < foundModules.length; i++) {
      const mod = foundModules[i];
      const label = mod.pretty_name || mod.module || `Module ${i + 1}`;
      const categoryTag = mod.category?.name || 'Autre';

      // Calculate position in circle around center
      const angle = i * angleStep - Math.PI / 2; // Start from top
      const position: Position = {
        x: centerPosition.x + radius * Math.cos(angle),
        y: centerPosition.y + radius * Math.sin(angle),
      };

      // Extract properties from spec_format
      // OI raw format: array of ONE wrapper dict [{fieldName: {type, proper_key, value}, ...}]
      const properties: Property[] = [];
      const moduleAssetIds: AssetId[] = [];
      let moduleImageId: AssetId | null = null;
      let geo: GeoCoordinates | null = null;
      let notes = '';
      const isMapModule = mod.module === 'maps' || mod.module === 'google_maps';

      if (mod.spec_format && Array.isArray(mod.spec_format) && mod.spec_format.length > 0) {
        const specWrapper = mod.spec_format[0];
        if (specWrapper && typeof specWrapper === 'object') {
          for (const [fieldKey, fieldValue] of Object.entries(specWrapper)) {
            // Skip internal fields
            if (SKIP_KEYS.has(fieldKey)) continue;

            // Check if it's a spec_format field object {type, proper_key, value}
            if (!fieldValue || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) continue;
            const field = fieldValue as OISpecFormatField;
            if (!('proper_key' in field) || !('value' in field)) continue;

            // Skip null/empty values
            if (field.value === null || field.value === undefined || field.value === '') continue;

            // Handle image fields separately
            if (IMAGE_KEYS.has(fieldKey)) {
              const picValue = String(field.value);
              if (picValue.startsWith('data:image/')) {
                try {
                  const filename = `${label.replace(/[^a-zA-Z0-9]/g, '_')}_pic.png`;
                  const file = dataUrlToFile(picValue, filename);
                  const asset = await fileService.saveAsset(targetInvestigationId, file);
                  moduleAssetIds.push(asset.id);
                  moduleImageId = asset.id;
                  result.assetsImported++;
                } catch {
                  result.warnings.push(`Image ignorée pour "${label}": erreur de conversion`);
                }
              } else if (picValue.startsWith('http')) {
                properties.push({ key: field.proper_key || 'Image', value: picValue, type: 'link' });
              }
              continue;
            }

            // Add as property
            const propType = field.type === 'url' ? 'link' :
                             field.type === 'int' || field.type === 'float' ? 'number' : 'text';
            properties.push({
              key: field.proper_key || fieldKey,
              value: String(field.value),
              type: propType,
            });
          }
        }
      }

      // Extract contact points from widgets
      if (mod.widgets && Array.isArray(mod.widgets)) {
        for (const widget of mod.widgets) {
          if (widget.type !== 'contact_point' || !Array.isArray(widget.content)) continue;
          for (const contact of widget.content) {
            if (!contact.value || contact.is_obfuscated) continue;
            const key = contact.contact_type || 'Contact';
            properties.push({ key, value: String(contact.value), type: 'text' });
          }
        }
      }

      // Handle maps module: extract geo and notes from front_schemas
      if (isMapModule && mod.front_schemas && Array.isArray(mod.front_schemas) && mod.front_schemas.length > 0) {
        const schema = mod.front_schemas[0];
        if (schema?.map && Array.isArray(schema.map)) {
          const noteParts: string[] = [];
          for (const entry of schema.map) {
            if (entry.type !== 'lat_lng') continue;
            if (!geo && entry.lat_lng && Array.isArray(entry.lat_lng) && entry.lat_lng.length >= 2) {
              const [lat, lng] = entry.lat_lng;
              if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                geo = { lat, lng };
              }
            }
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
          properties.push({ key: 'Lieux', value: String(schema.map.length), type: 'number' });
        }
      }

      // Add module name as property
      if (mod.module) {
        properties.push({ key: 'module_id', value: mod.module, type: 'text' });
      }

      const moduleId = generateUUID();

      const moduleElement: Element = {
        id: moduleId,
        investigationId: targetInvestigationId,
        label,
        notes,
        tags: [categoryTag],
        properties,
        confidence: null,
        source: 'OSINT Industries',
        date: null,
        dateRange: null,
        position,
        geo,
        visual: { ...DEFAULT_ELEMENT_VISUAL, image: moduleImageId },
        assetIds: moduleAssetIds,
        parentGroupId: null,
        isGroup: false,
        childIds: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(moduleElement);
      result.elementsImported++;

      // Create link from query to module
      const link: Link = {
        id: generateUUID(),
        investigationId: targetInvestigationId,
        fromId: queryId,
        toId: moduleId,
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

    // Update investigation timestamp
    await db.investigations.update(targetInvestigationId, {
      updatedAt: new Date(),
    });

    result.success = true;
  } catch (error) {
    result.errors.push(
      `Erreur d'import OSINT Industries: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}

/**
 * Detect if JSON content is an OSINT Industries format
 */
export function isOsintIndustriesFormat(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return false;

  // Check first element has OI signature fields
  const first = data[0] as Record<string, unknown>;
  return (
    typeof first.module === 'string' &&
    typeof first.status === 'string' &&
    ('query' in first || 'query_type' in first)
  );
}
