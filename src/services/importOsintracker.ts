/**
 * OSINTracker Import Service
 *
 * Imports investigations from OSINTracker (.osintracker) files
 * Format: Dexie JSON export with data, relation, and investigation tables
 */

import type { Element, Link, Investigation, Confidence } from '../types';

// ============================================================================
// TYPE MAPPING DEFINITIONS (minimal structure for import)
// ============================================================================

interface TypeMapEntry {
  id: string;
  name: string;
  color: string | null;
}

interface TypeMapData {
  data: {
    dataTypes: TypeMapEntry[];
  };
}

// Type info cache (typeId -> { name, color })
interface TypeInfo {
  name: string;
  color: string | null;
}
let typeMapCache: Map<string, TypeInfo> | null = null;

/**
 * Load and parse the type mapping file to get type names and colors
 */
async function loadTypeMap(): Promise<Map<string, TypeInfo>> {
  if (typeMapCache) {
    return typeMapCache;
  }

  try {
    const response = await fetch('/extra/master.json');
    if (!response.ok) {
      console.warn('Could not load master.json for type mapping');
      return new Map();
    }

    const data: TypeMapData = await response.json();
    const typeMap = new Map<string, TypeInfo>();

    for (const dataType of data.data.dataTypes) {
      typeMap.set(dataType.id, { name: dataType.name, color: dataType.color });
    }

    typeMapCache = typeMap;
    return typeMap;
  } catch (error) {
    console.warn('Error loading master.json:', error);
    return new Map();
  }
}

// ============================================================================
// OSINTRACKER TYPES
// ============================================================================

interface OsintrackerData {
  formatName: 'dexie';
  formatVersion: number;
  data: {
    databaseName: string;
    databaseVersion: number;
    tables: Array<{
      name: string;
      schema: string;
      rowCount: number;
    }>;
    data: Array<{
      tableName: string;
      inbound: boolean;
      rows: any[];
    }>;
  };
}

interface OsintrackerElement {
  id: string;
  investigationId: string;
  value: string;
  typeId: string;
  position: { x: number; y: number };
  comments?: string;
  image?: string; // base64 data URL
  url?: string;
  critical?: boolean;
  countryCode?: string;
  progress?: string; // Badge content (e.g., "En cours", "Terminé")
  creationDate: number;
  editionDate?: number;
}

interface OsintrackerRelation {
  id: string;
  investigationId: string;
  originId: string;
  targetId: string;
  label?: string;
  bidirectional?: boolean;
  comments?: string;
  critical?: boolean;
  rating?: number; // 1-5 scale
  startDate?: number | string | null; // Unix timestamp (seconds) or "undef"
  startTime?: number | string | null; // Unix timestamp (seconds) or "undef"
  endDate?: number | string | null; // Unix timestamp (seconds) or "undef"
  endTime?: number | string | null; // Unix timestamp (seconds) or "undef"
  creationDate: number;
}

interface OsintrackerInvestigation {
  id: string;
  name: string;
  description?: string;
  creationDate: number;
  editionDate?: number;
}

// ============================================================================
// IMPORT RESULT
// ============================================================================

export interface OsintrackerImportResult {
  investigation: Omit<Investigation, 'id'> & { originalId: string };
  elements: Array<Omit<Element, 'id' | 'investigationId'> & { originalId: string }>;
  links: Array<Omit<Link, 'id' | 'investigationId' | 'fromId' | 'toId'> & {
    originalId: string;
    originalFromId: string;
    originalToId: string;
  }>;
  assets: Array<{
    originalElementId: string;
    dataUrl: string;
    filename: string;
    mimeType: string;
  }>;
  stats: {
    elementsCount: number;
    linksCount: number;
    assetsCount: number;
    skippedElements: number;
    skippedLinks: number;
  };
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parse an OSINTracker file and extract data
 */
export async function parseOsintrackerFile(jsonContent: string): Promise<OsintrackerImportResult> {
  // Load type map for category names
  const typeMap = await loadTypeMap();
  const data: OsintrackerData = JSON.parse(jsonContent);

  // Validate format
  if (data.formatName !== 'dexie') {
    throw new Error('Invalid OSINTracker file: expected Dexie format');
  }

  // Extract tables
  const tables: Record<string, any[]> = {};
  for (const table of data.data.data) {
    tables[table.tableName] = table.rows;
  }

  const osintElements = (tables['data'] || []) as OsintrackerElement[];
  const osintRelations = (tables['relation'] || []) as OsintrackerRelation[];
  const osintInvestigations = (tables['investigation'] || []) as OsintrackerInvestigation[];

  // Get the investigation (use first one if multiple)
  const osintInvestigation = osintInvestigations[0];
  if (!osintInvestigation) {
    throw new Error('No investigation found in OSINTracker file');
  }

  // Filter elements and relations for this investigation
  const investigationId = osintInvestigation.id;
  const filteredElements = osintElements.filter(e => e.investigationId === investigationId);
  const filteredRelations = osintRelations.filter(r => r.investigationId === investigationId);

  // Track valid element IDs for link validation
  const validElementIds = new Set(filteredElements.map(e => e.id));

  // Convert investigation
  const investigation: OsintrackerImportResult['investigation'] = {
    originalId: osintInvestigation.id,
    name: osintInvestigation.name || 'Investigation importée',
    description: osintInvestigation.description || '',
    startDate: null,
    creator: '',
    tags: [],
    properties: [],
    createdAt: new Date(osintInvestigation.creationDate),
    updatedAt: new Date(osintInvestigation.editionDate || osintInvestigation.creationDate),
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: {
      defaultElementVisual: {},
      defaultLinkVisual: {},
      suggestedProperties: [],
      existingTags: [],
      tagPropertyAssociations: {},
    },
  };

  // Convert elements
  const elements: OsintrackerImportResult['elements'] = [];
  const assets: OsintrackerImportResult['assets'] = [];
  let skippedElements = 0;

  for (const osintEl of filteredElements) {
    // Skip elements without position
    if (!osintEl.position || typeof osintEl.position.x !== 'number') {
      skippedElements++;
      continue;
    }

    // Get type info (name + color) from master.json
    const typeInfo = osintEl.typeId ? typeMap.get(osintEl.typeId) : null;

    // Build tags
    const tags: string[] = [];

    // Add category from typeId using master.json mapping
    if (typeInfo?.name) {
      tags.push(typeInfo.name);
    }

    if (osintEl.critical) {
      tags.push('Important');
    }

    // Build properties
    const properties: Array<{ key: string; value: string; type: 'text' | 'number' | 'date' | 'link' | 'country' }> = [];

    // Add Badge property from progress field
    if (osintEl.progress) {
      properties.push({ key: 'Badge', value: osintEl.progress, type: 'text' });
    }

    // Add country property with type 'country'
    if (osintEl.countryCode) {
      properties.push({ key: 'Pays', value: osintEl.countryCode, type: 'country' });
    }

    // Determine element color: use type color from master.json, or yellow for critical, or default
    let elementColor = '#fffdf9'; // Default warm white
    let borderColor = '#e8e3db';  // Default border

    if (typeInfo?.color) {
      elementColor = typeInfo.color;
      // Darken the color slightly for border (simple approach)
      borderColor = typeInfo.color;
    }

    if (osintEl.critical) {
      // Override with yellow for critical items
      elementColor = '#fef3c7';
      borderColor = '#f59e0b';
    }

    const element: OsintrackerImportResult['elements'][0] = {
      originalId: osintEl.id,
      label: osintEl.value || 'Sans nom',
      notes: osintEl.comments || '',
      tags,
      properties,
      confidence: null,
      source: osintEl.url || '',
      date: null,
      dateRange: null,
      position: {
        x: osintEl.position.x,
        y: osintEl.position.y,
      },
      geo: null,
      events: [],
      visual: {
        color: elementColor,
        borderColor: borderColor,
        shape: 'rectangle',
        size: 'medium',
        icon: null,
        image: null,
      },
      assetIds: [],
      parentGroupId: null,
      isGroup: false,
      isAnnotation: false,
      childIds: [],
      createdAt: new Date(osintEl.creationDate),
      updatedAt: new Date(osintEl.editionDate || osintEl.creationDate),
    };

    elements.push(element);

    // Extract image as asset
    if (osintEl.image && osintEl.image.startsWith('data:')) {
      const mimeMatch = osintEl.image.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const ext = mimeType.split('/')[1] || 'png';

      assets.push({
        originalElementId: osintEl.id,
        dataUrl: osintEl.image,
        filename: `${osintEl.value || 'image'}.${ext}`.replace(/[/\\?%*:|"<>]/g, '_'),
        mimeType,
      });
    }
  }

  // Helper to convert timestamp to Date
  // OSINTracker uses seconds for dates but milliseconds for creationDate
  // Detect format based on magnitude: > 10^12 = milliseconds, otherwise seconds
  // Also handles "undef" string values in OSINTracker exports
  const timestampToDate = (ts: number | string | null | undefined): Date | null => {
    // Handle null, undefined, 0, or "undef" string
    if (!ts || ts === 0 || ts === 'undef' || typeof ts !== 'number') return null;
    try {
      // If > 10^12, it's already milliseconds; otherwise multiply by 1000
      const ms = ts > 1e12 ? ts : ts * 1000;
      const date = new Date(ms);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  // Helper to combine date timestamp + time timestamp into a Date object
  const combineDateTime = (dateTimestamp: number | string | null | undefined, timeTimestamp: number | string | null | undefined): Date | null => {
    const date = timestampToDate(dateTimestamp);
    if (!date) return null;

    // If time timestamp is provided, extract hours/minutes from it
    if (timeTimestamp) {
      const timeDate = timestampToDate(timeTimestamp);
      if (timeDate) {
        date.setHours(timeDate.getHours());
        date.setMinutes(timeDate.getMinutes());
        date.setSeconds(timeDate.getSeconds());
      }
    }

    return date;
  };

  // Convert relations to links
  const links: OsintrackerImportResult['links'] = [];
  let skippedLinks = 0;

  for (const osintRel of filteredRelations) {
    // Skip links with invalid source/target
    if (!validElementIds.has(osintRel.originId) || !validElementIds.has(osintRel.targetId)) {
      skippedLinks++;
      continue;
    }

    // Convert rating (1-5) to confidence (0-100), rounded to nearest 10
    const rawConfidence = osintRel.rating ? Math.round((osintRel.rating / 5) * 100) : null;
    const confidence = rawConfidence !== null ? (Math.round(rawConfidence / 10) * 10) as Confidence : null;

    // Determine direction
    let direction: 'none' | 'forward' | 'backward' | 'both' = 'forward';
    if (osintRel.bidirectional) {
      direction = 'both';
    }

    // Combine date + time
    const startDateTime = combineDateTime(osintRel.startDate, osintRel.startTime);
    const endDateTime = combineDateTime(osintRel.endDate, osintRel.endTime);

    const link: OsintrackerImportResult['links'][0] = {
      originalId: osintRel.id,
      originalFromId: osintRel.originId,
      originalToId: osintRel.targetId,
      label: osintRel.label || '',
      notes: osintRel.comments || '',
      tags: [],
      direction,
      directed: true, // OSINTracker links are always directed or bidirectional
      confidence,
      source: '',
      date: startDateTime,
      dateRange: startDateTime ? {
        start: startDateTime,
        end: endDateTime ?? null,
      } : null,
      properties: [],
      visual: {
        color: osintRel.critical ? '#f59e0b' : '#9a948d',
        thickness: osintRel.critical ? 2 : 1,
        style: 'solid',
      },
      curveOffset: { x: 0, y: 0 },
      sourceHandle: null,
      targetHandle: null,
      createdAt: new Date(osintRel.creationDate),
      updatedAt: new Date(osintRel.creationDate),
    };

    links.push(link);
  }

  return {
    investigation,
    elements,
    links,
    assets,
    stats: {
      elementsCount: elements.length,
      linksCount: links.length,
      assetsCount: assets.length,
      skippedElements,
      skippedLinks,
    },
  };
}

/**
 * Convert a data URL to a File object
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
