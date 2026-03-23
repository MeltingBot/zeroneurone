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
} from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';

// ============================================================================
// STIX 2.1 Type Definitions
// ============================================================================

interface STIXBundle {
  type: 'bundle';
  id: string;
  spec_version?: string;
  created?: string;
  objects: STIXObject[];
}

interface STIXObject {
  type: string;
  id: string;
  spec_version?: string;
  created?: string;
  modified?: string;
  name?: string;
  description?: string;
  aliases?: string[];
  labels?: string[];
  external_references?: Array<{
    source_name?: string;
    external_id?: string;
    url?: string;
    description?: string;
  }>;
  kill_chain_phases?: Array<{
    kill_chain_name: string;
    phase_name: string;
  }>;
  // Temporal fields
  first_seen?: string;
  last_seen?: string;
  first_observed?: string;
  last_observed?: string;
  valid_from?: string;
  valid_until?: string;
  published?: string;
  // Relationship fields
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
  // Sighting fields
  sighting_of_ref?: string;
  observed_data_refs?: string[];
  where_sighted_refs?: string[];
  count?: number;
  // Indicator fields
  pattern?: string;
  pattern_type?: string;
  indicator_types?: string[];
  // Threat actor fields
  threat_actor_types?: string[];
  roles?: string[];
  goals?: string[];
  sophistication?: string;
  resource_level?: string;
  primary_motivation?: string;
  secondary_motivations?: string[];
  // Malware fields
  malware_types?: string[];
  is_family?: boolean;
  capabilities?: string[];
  implementation_languages?: string[];
  architecture_execution_envs?: string[];
  operating_system_refs?: string[];
  // Campaign fields
  objective?: string;
  // Infrastructure fields
  infrastructure_types?: string[];
  // Tool fields
  tool_types?: string[];
  // Identity fields
  identity_class?: string;
  sectors?: string[];
  contact_information?: string;
  // Report fields
  report_types?: string[];
  object_refs?: string[];
  // Note fields
  abstract?: string;
  content?: string;
  authors?: string[];
  // Opinion fields
  opinion?: string;
  explanation?: string;
  // SCO fields
  value?: string;
  display_name?: string;
  hashes?: Record<string, string>;
  size?: number;
  mime_type?: string;
  dst_port?: number;
  src_port?: number;
  protocols?: string[];
  src_ref?: string;
  dst_ref?: string;
  extensions?: Record<string, unknown>;
  // Observed-data fields
  number_observed?: number;
  // Marking fields
  object_marking_refs?: string[];
  definition_type?: string;
  definition?: Record<string, string>;
  // Generic additional fields
  [key: string]: unknown;
}

// ============================================================================
// Visual Style Mappings for STIX Object Types
// ============================================================================

const STIX_TYPE_STYLES: Record<string, { color: string; shape: ElementShape; icon?: string }> = {
  // SDOs
  'threat-actor': { color: '#dc2626', shape: 'diamond', icon: 'user-x' },
  'campaign': { color: '#ea580c', shape: 'rectangle', icon: 'target' },
  'malware': { color: '#b91c1c', shape: 'diamond', icon: 'bug' },
  'attack-pattern': { color: '#7c3aed', shape: 'diamond', icon: 'zap' },
  'indicator': { color: '#ca8a04', shape: 'circle', icon: 'alert-triangle' },
  'infrastructure': { color: '#0284c7', shape: 'rectangle', icon: 'server' },
  'tool': { color: '#525252', shape: 'square', icon: 'wrench' },
  'vulnerability': { color: '#dc2626', shape: 'circle', icon: 'shield-alert' },
  'identity': { color: '#16a34a', shape: 'circle', icon: 'building' },
  'report': { color: '#2563eb', shape: 'rectangle', icon: 'file-text' },
  'course-of-action': { color: '#059669', shape: 'rectangle', icon: 'shield-check' },
  'intrusion-set': { color: '#9333ea', shape: 'diamond', icon: 'users' },
  'location': { color: '#0891b2', shape: 'circle', icon: 'map-pin' },
  'observed-data': { color: '#64748b', shape: 'circle', icon: 'eye' },
  'opinion': { color: '#78716c', shape: 'circle', icon: 'message-circle' },
  'grouping': { color: '#6366f1', shape: 'rectangle', icon: 'folder' },
  // SCOs
  'ipv4-addr': { color: '#0ea5e9', shape: 'circle', icon: 'network' },
  'ipv6-addr': { color: '#0ea5e9', shape: 'circle', icon: 'network' },
  'domain-name': { color: '#0284c7', shape: 'circle', icon: 'globe' },
  'url': { color: '#0284c7', shape: 'circle', icon: 'link' },
  'email-addr': { color: '#8b5cf6', shape: 'circle', icon: 'mail' },
  'email-message': { color: '#8b5cf6', shape: 'rectangle', icon: 'mail' },
  'file': { color: '#475569', shape: 'rectangle', icon: 'file' },
  'network-traffic': { color: '#64748b', shape: 'circle', icon: 'activity' },
  'mac-addr': { color: '#0ea5e9', shape: 'circle', icon: 'network' },
  'user-account': { color: '#16a34a', shape: 'circle', icon: 'user' },
  'process': { color: '#475569', shape: 'circle', icon: 'cpu' },
  'software': { color: '#475569', shape: 'rectangle', icon: 'package' },
  'directory': { color: '#475569', shape: 'rectangle', icon: 'folder' },
  'windows-registry-key': { color: '#475569', shape: 'rectangle', icon: 'database' },
  'autonomous-system': { color: '#0ea5e9', shape: 'circle', icon: 'cloud' },
  'x509-certificate': { color: '#059669', shape: 'rectangle', icon: 'shield' },
  'artifact': { color: '#64748b', shape: 'circle', icon: 'box' },
  'mutex': { color: '#64748b', shape: 'circle', icon: 'lock' },
};

/** Translate a STIX relationship type to the user's locale */
function translateRelationship(stixType: string): string {
  // Convert kebab-case to camelCase for i18n key lookup
  const key = stixType.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const translated = i18next.t(`importData:stix.relationships.${key}`, { defaultValue: '' });
  return translated || stixType;
}

/** Shorthand for importData namespace */
const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`importData:${key}`, options) as string;

// Types excluded from element creation (metadata only)
const EXCLUDED_TYPES = new Set(['marking-definition']);

// ============================================================================
// Format Detection
// ============================================================================

export function isSTIX2Format(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // Check for STIX Bundle structure
  if (obj.type === 'bundle' && Array.isArray(obj.objects)) {
    // Verify at least one object has a STIX-like ID
    const objects = obj.objects as Array<{ id?: string; type?: string }>;
    return objects.some(o =>
      o.id && typeof o.id === 'string' && o.id.includes('--') &&
      o.type && typeof o.type === 'string'
    );
  }

  return false;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a smart label for any STIX object (SDO or SCO) */
function buildLabel(obj: STIXObject): string {
  // SDOs: prefer name
  if (obj.name) return obj.name;

  // SCOs: use display_name or value
  if (obj.display_name) return obj.display_name;
  if (obj.value) return String(obj.value);

  // observed-data: build from dates
  if (obj.type === 'observed-data' && obj.first_observed) {
    const d = new Date(obj.first_observed);
    if (!isNaN(d.getTime())) {
      const locale = i18next.language || 'fr';
      const dateStr = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
      const countSuffix = obj.number_observed && obj.number_observed > 1
        ? ` (x${obj.number_observed})`
        : '';
      return `${t('stix.labels.observation')} ${dateStr}${countSuffix}`;
    }
  }

  // Fallback: type + short ID
  return `${obj.type} (${obj.id.split('--')[1]?.substring(0, 8) || obj.id})`;
}

/** Build a marking/TLP map from marking-definition objects */
function buildMarkingMap(objects: STIXObject[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const obj of objects) {
    if (obj.type !== 'marking-definition') continue;
    // TLP markings
    if (obj.definition_type === 'tlp' && obj.definition?.tlp) {
      map.set(obj.id, `TLP:${obj.definition.tlp.toUpperCase()}`);
    } else if (obj.name) {
      map.set(obj.id, obj.name);
    }
  }
  return map;
}

/** Create a dashed reference link (for notes, reports, opinions) */
function buildRefLink(
  dossierId: DossierId,
  fromId: ElementId,
  toId: ElementId,
  label: string,
  tag: string,
): Link {
  return {
    id: generateUUID(),
    dossierId,
    fromId,
    toId,
    sourceHandle: null,
    targetHandle: null,
    label,
    notes: '',
    tags: [tag],
    properties: [],
    confidence: null,
    source: 'STIX 2.1',
    date: null,
    dateRange: null,
    directed: true,
    direction: 'forward',
    visual: {
      ...DEFAULT_LINK_VISUAL,
      style: 'dashed',
      color: '#9ca3af',
    },
    curveOffset: { x: 0, y: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// Import Function
// ============================================================================

export async function importSTIX2(
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
    const data = JSON.parse(content) as STIXBundle;

    if (!data.objects || !Array.isArray(data.objects)) {
      result.errors.push(t('stix.errors.invalidBundle'));
      return result;
    }

    // Build marking/TLP lookup
    const markingMap = buildMarkingMap(data.objects);

    // Separate objects into SDOs (elements), SROs (relationships), notes, opinions, reports
    const sdos: STIXObject[] = [];
    const sros: STIXObject[] = [];
    const notes: STIXObject[] = [];
    const opinions: STIXObject[] = [];
    const reports: STIXObject[] = [];

    for (const obj of data.objects) {
      if (EXCLUDED_TYPES.has(obj.type)) {
        continue; // marking-definition handled via markingMap
      } else if (obj.type === 'relationship') {
        sros.push(obj);
      } else if (obj.type === 'sighting') {
        sros.push(obj);
      } else if (obj.type === 'note') {
        notes.push(obj);
      } else if (obj.type === 'opinion') {
        opinions.push(obj);
      } else if (obj.type === 'report') {
        reports.push(obj);
        sdos.push(obj); // Reports are also created as elements
      } else {
        sdos.push(obj);
      }
    }

    // Create ID mapping (STIX ID -> ZeroNeurone ID)
    const idMap = new Map<string, ElementId>();

    // Grid layout for elements
    let gridX = 0;
    let gridY = 0;
    const gridCols = 8;
    const gridSpacing = 250;

    const nextPosition = () => {
      const position = {
        x: 100 + (gridX * gridSpacing),
        y: 100 + (gridY * gridSpacing),
      };
      gridX++;
      if (gridX >= gridCols) {
        gridX = 0;
        gridY++;
      }
      return position;
    };

    // First pass: Create elements from SDOs + SCOs
    for (const sdo of sdos) {
      const newId = generateUUID();
      idMap.set(sdo.id, newId);

      // Get visual style for this STIX type
      const style = STIX_TYPE_STYLES[sdo.type] || {
        color: DEFAULT_ELEMENT_VISUAL.color,
        shape: 'circle' as ElementShape
      };

      const label = buildLabel(sdo);

      // Build notes from description
      let elementNotes = sdo.description || '';

      if (sdo.objective) {
        elementNotes += `\n\n**${t('stix.noteLabels.objective')}:** ${sdo.objective}`;
      }
      if (sdo.pattern) {
        elementNotes += `\n\n**${t('stix.noteLabels.pattern')}:** \`${sdo.pattern}\``;
      }
      if (sdo.content) {
        elementNotes += `\n\n${sdo.content}`;
      }
      if (sdo.abstract) {
        elementNotes = `**${sdo.abstract}**\n\n${elementNotes}`;
      }
      if (sdo.explanation) {
        elementNotes += `\n\n**${t('stix.noteLabels.opinion')}:** ${sdo.explanation}`;
      }

      // Build tags from various STIX fields
      const tags: string[] = [];
      tags.push(`stix:${sdo.type}`);

      if (sdo.aliases) tags.push(...sdo.aliases);
      if (sdo.labels) tags.push(...sdo.labels);
      if (sdo.threat_actor_types) tags.push(...sdo.threat_actor_types);
      if (sdo.malware_types) tags.push(...sdo.malware_types);
      if (sdo.indicator_types) tags.push(...sdo.indicator_types);
      if (sdo.tool_types) tags.push(...sdo.tool_types);
      if (sdo.infrastructure_types) tags.push(...sdo.infrastructure_types);
      if (sdo.report_types) tags.push(...sdo.report_types);
      if (sdo.sectors) tags.push(...sdo.sectors);
      if (sdo.identity_class) tags.push(sdo.identity_class);
      if (sdo.sophistication) tags.push(`sophistication:${sdo.sophistication}`);
      if (sdo.resource_level) tags.push(`resource:${sdo.resource_level}`);
      if (sdo.primary_motivation) tags.push(`motivation:${sdo.primary_motivation}`);
      if (sdo.secondary_motivations) {
        for (const m of sdo.secondary_motivations) {
          tags.push(`motivation:${m}`);
        }
      }
      if (sdo.is_family === true) tags.push('malware-family');
      if (sdo.is_family === false) tags.push('malware-instance');
      if (sdo.opinion) tags.push(`opinion:${sdo.opinion}`);

      // Apply TLP/marking tags from object_marking_refs
      if (sdo.object_marking_refs) {
        for (const markRef of sdo.object_marking_refs) {
          const markLabel = markingMap.get(markRef as string);
          if (markLabel) tags.push(markLabel);
        }
      }

      // Build properties from STIX-specific fields
      const properties: Property[] = [];

      // STIX ID
      properties.push({ key: 'stix_id', value: sdo.id, type: 'text' });

      // External references
      if (sdo.external_references) {
        for (const ref of sdo.external_references) {
          if (ref.external_id) {
            const key = ref.source_name || 'reference';
            properties.push({ key, value: ref.external_id, type: 'text' });
          }
          if (ref.url) {
            properties.push({ key: `${ref.source_name || 'ref'}_url`, value: ref.url, type: 'text' });
          }
        }
      }

      // Kill chain phases
      if (sdo.kill_chain_phases) {
        const phases = sdo.kill_chain_phases.map(p => `${p.kill_chain_name}:${p.phase_name}`);
        properties.push({ key: 'kill_chain', value: phases.join(', '), type: 'text' });
      }

      // Capabilities
      if (sdo.capabilities) {
        properties.push({ key: 'capabilities', value: sdo.capabilities.join(', '), type: 'text' });
      }

      // Goals
      if (sdo.goals) {
        properties.push({ key: 'goals', value: sdo.goals.join(', '), type: 'text' });
      }

      // Roles
      if (sdo.roles) {
        properties.push({ key: 'roles', value: sdo.roles.join(', '), type: 'text' });
      }

      // Authors
      if (sdo.authors) {
        properties.push({ key: 'authors', value: sdo.authors.join(', '), type: 'text' });
      }

      // Contact info
      if (sdo.contact_information) {
        properties.push({ key: 'contact', value: sdo.contact_information, type: 'text' });
      }

      // Pattern type
      if (sdo.pattern_type) {
        properties.push({ key: 'pattern_type', value: sdo.pattern_type, type: 'text' });
      }

      // Opinion value
      if (sdo.opinion) {
        properties.push({ key: 'opinion', value: sdo.opinion, type: 'text' });
      }

      // Malware: implementation languages
      if (sdo.implementation_languages) {
        properties.push({ key: 'languages', value: sdo.implementation_languages.join(', '), type: 'text' });
      }

      // Malware: architecture
      if (sdo.architecture_execution_envs) {
        properties.push({ key: 'architectures', value: sdo.architecture_execution_envs.join(', '), type: 'text' });
      }

      // SCO: file hashes, size, mime_type
      if (sdo.hashes) {
        for (const [algo, hash] of Object.entries(sdo.hashes)) {
          properties.push({ key: algo, value: hash, type: 'text' });
        }
      }
      if (sdo.size != null) {
        properties.push({ key: 'size', value: sdo.size, type: 'number' });
      }
      if (sdo.mime_type) {
        properties.push({ key: 'mime_type', value: sdo.mime_type, type: 'text' });
      }

      // SCO: network-traffic
      if (sdo.dst_port != null) {
        properties.push({ key: 'dst_port', value: sdo.dst_port, type: 'number' });
      }
      if (sdo.src_port != null) {
        properties.push({ key: 'src_port', value: sdo.src_port, type: 'number' });
      }
      if (sdo.protocols) {
        properties.push({ key: 'protocols', value: sdo.protocols.join(', '), type: 'text' });
      }

      // SCO: email-addr value as property (label uses display_name or value)
      if (sdo.type === 'email-addr' && sdo.value) {
        properties.push({ key: 'email', value: sdo.value, type: 'text' });
      }

      // SCO: observed-data
      if (sdo.number_observed != null) {
        properties.push({ key: 'number_observed', value: sdo.number_observed, type: 'number' });
      }

      // Parse date range from first_seen/last_seen, first_observed/last_observed, or valid_from/valid_until
      let dateRange: { start: Date | null; end: Date | null } | null = null;
      const startDate = sdo.first_seen || sdo.first_observed || sdo.valid_from;
      const endDate = sdo.last_seen || sdo.last_observed || sdo.valid_until;

      if (startDate) {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : null;
        if (!isNaN(start.getTime())) {
          dateRange = {
            start,
            end: end && !isNaN(end.getTime()) ? end : null,
          };
        }
      }

      const position = nextPosition();

      const element: Element = {
        id: newId,
        dossierId: targetDossierId,
        label,
        notes: elementNotes.trim(),
        tags,
        properties,
        confidence: null,
        source: 'STIX 2.1',
        date: sdo.created ? new Date(sdo.created) : null,
        dateRange,
        position,
        isPositionLocked: false,
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color: style.color,
          shape: style.shape,
          icon: style.icon || null,
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        events: [],
        createdAt: sdo.created ? new Date(sdo.created) : new Date(),
        updatedAt: sdo.modified ? new Date(sdo.modified) : new Date(),
      };

      await db.elements.add(element);
      result.elementsImported++;
    }

    // Second pass: Create links from SROs (relationships and sightings)
    for (const sro of sros) {
      // Main relationship link
      const sourceRef = sro.source_ref || sro.sighting_of_ref;
      const targetRef = sro.target_ref || (sro.observed_data_refs?.[0] as string);

      if (!sourceRef || !targetRef) {
        result.warnings.push(t('stix.errors.missingRef', { id: sro.id }));
        continue;
      }

      const fromId = idMap.get(sourceRef);
      const toId = idMap.get(targetRef);

      if (!fromId || !toId) {
        result.warnings.push(t('stix.errors.missingElement', { type: sro.relationship_type || 'sighting' }));
        continue;
      }

      // Get translated label for relationship type
      const relType = sro.relationship_type || 'sighting';
      const label = translateRelationship(relType);

      // Build sighting properties
      const linkProperties: Property[] = [
        { key: 'stix_id', value: sro.id, type: 'text' },
      ];
      if (sro.count != null) {
        linkProperties.push({ key: 'count', value: sro.count, type: 'number' });
      }

      // Build sighting date range
      let sroDateRange: { start: Date | null; end: Date | null } | null = null;
      const sroStart = sro.first_seen;
      const sroEnd = sro.last_seen;
      if (sroStart) {
        const start = new Date(sroStart);
        if (!isNaN(start.getTime())) {
          const end = sroEnd ? new Date(sroEnd) : null;
          sroDateRange = {
            start,
            end: end && !isNaN(end.getTime()) ? end : null,
          };
        }
      }

      const link: Link = {
        id: generateUUID(),
        dossierId: targetDossierId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label,
        notes: sro.description || '',
        tags: [`stix:${relType}`],
        properties: linkProperties,
        confidence: null,
        source: 'STIX 2.1',
        date: null,
        dateRange: sroDateRange,
        directed: true,
        direction: 'forward',
        visual: {
          ...DEFAULT_LINK_VISUAL,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: sro.created ? new Date(sro.created) : new Date(),
        updatedAt: sro.modified ? new Date(sro.modified) : new Date(),
      };

      await db.links.add(link);
      result.linksImported++;

      // Sighting: create additional "observe chez" link to where_sighted_refs
      if (sro.type === 'sighting' && sro.where_sighted_refs) {
        for (const wsRef of sro.where_sighted_refs) {
          const wsId = idMap.get(wsRef);
          if (!wsId) continue;

          const sightingLink = buildRefLink(
            targetDossierId, fromId, wsId, t('stix.labels.observedAt'), 'stix:where-sighted'
          );
          await db.links.add(sightingLink);
          result.linksImported++;
        }
      }
    }

    // Third pass: Create annotations from notes (attached to referenced objects)
    for (const note of notes) {
      if (!note.object_refs || note.object_refs.length === 0) {
        result.warnings.push(t('stix.errors.noteNoRefs', { id: note.id }));
        continue;
      }

      const refId = idMap.get(note.object_refs[0]);
      if (!refId) {
        result.warnings.push(t('stix.errors.noteRefMissing', { label: note.abstract || note.id }));
        continue;
      }

      const refElement = await db.elements.get(refId);
      const position = refElement
        ? { x: refElement.position.x + 150, y: refElement.position.y - 50 }
        : nextPosition();

      const newId = generateUUID();
      idMap.set(note.id, newId);

      const annotationContent = note.abstract
        ? `**${note.abstract}**\n\n${note.content || ''}`
        : note.content || '';

      const annotation: Element = {
        id: newId,
        dossierId: targetDossierId,
        label: note.abstract || t('stix.labels.note'),
        notes: annotationContent,
        tags: note.authors ? note.authors.map(a => `author:${a}`) : [],
        properties: [
          { key: 'stix_id', value: note.id, type: 'text' },
        ],
        confidence: null,
        source: 'STIX 2.1',
        date: note.created ? new Date(note.created) : null,
        dateRange: null,
        position,
        isPositionLocked: false,
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color: '#fef3c7',
          shape: 'rectangle',
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: true,
        childIds: [],
        events: [],
        createdAt: note.created ? new Date(note.created) : new Date(),
        updatedAt: note.modified ? new Date(note.modified) : new Date(),
      };

      await db.elements.add(annotation);
      result.elementsImported++;

      // Create links from annotation to referenced objects
      for (const objRef of note.object_refs) {
        const targetId = idMap.get(objRef);
        if (!targetId || targetId === newId) continue;

        const refLink = buildRefLink(
          targetDossierId, newId, targetId, t('stix.labels.concerns'), 'stix:note-ref'
        );
        refLink.visual.color = '#d97706';
        await db.links.add(refLink);
        result.linksImported++;
      }
    }

    // Fourth pass: Create links from opinions to referenced objects
    for (const op of opinions) {
      if (!op.object_refs || op.object_refs.length === 0) continue;

      // Opinion is already created as an element in the SDO pass
      const opId = idMap.get(op.id);
      if (!opId) continue;

      for (const objRef of op.object_refs) {
        const targetId = idMap.get(objRef);
        if (!targetId || targetId === opId) continue;

        const refLink = buildRefLink(
          targetDossierId, opId, targetId, t('stix.labels.opinionOn'), 'stix:opinion-ref'
        );
        await db.links.add(refLink);
        result.linksImported++;
      }
    }

    // Fifth pass: Create links from reports to referenced objects
    for (const report of reports) {
      if (!report.object_refs || report.object_refs.length === 0) continue;

      const reportId = idMap.get(report.id);
      if (!reportId) continue;

      for (const objRef of report.object_refs) {
        const targetId = idMap.get(objRef);
        if (!targetId || targetId === reportId) continue;

        const refLink = buildRefLink(
          targetDossierId, reportId, targetId, t('stix.labels.mentions'), 'stix:report-ref'
        );
        refLink.visual.color = '#2563eb';
        await db.links.add(refLink);
        result.linksImported++;
      }
    }

    // Update dossier with bundle info
    const bundleDate = data.created ? new Date(data.created) : new Date();
    await db.dossiers.update(targetDossierId, {
      description: t('stix.meta.importDescription', { bundleId: data.id || 'Bundle' }),
      updatedAt: bundleDate,
    });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      t('stix.errors.importError', { message: error instanceof Error ? error.message : t('stix.errors.unknownError') })
    );
  }

  return result;
}
