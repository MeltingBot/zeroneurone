import { db } from '../db/database';
import { generateUUID } from '../utils';
import type {
  InvestigationId,
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
  // Vulnerability fields (CVE, etc.)
  // Attack pattern fields
  // Generic additional fields
  [key: string]: unknown;
}

// ============================================================================
// Visual Style Mappings for STIX Object Types
// ============================================================================

const STIX_TYPE_STYLES: Record<string, { color: string; shape: ElementShape; icon?: string }> = {
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
};

const STIX_RELATIONSHIP_LABELS: Record<string, string> = {
  'attributed-to': 'attribue a',
  'uses': 'utilise',
  'targets': 'cible',
  'indicates': 'indique',
  'mitigates': 'atenue',
  'derived-from': 'derive de',
  'duplicate-of': 'doublon de',
  'related-to': 'lie a',
  'drops': 'deploie',
  'delivers': 'livre',
  'exploits': 'exploite',
  'variant-of': 'variante de',
  'authored-by': 'auteur',
  'based-on': 'base sur',
  'owns': 'possede',
  'hosts': 'heberge',
  'located-at': 'situe a',
  'communicates-with': 'communique avec',
  'controls': 'controle',
  'has': 'a',
  'compromises': 'compromet',
  'originates-from': 'provient de',
  'investigates': 'enquete sur',
  'remediates': 'remedie a',
  'analysis-of': 'analyse de',
  'consists-of': 'compose de',
  'impersonates': 'usurpe',
  'beacons-to': 'balise vers',
  'exfiltrates-to': 'exfiltre vers',
};

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
// Import Function
// ============================================================================

export async function importSTIX2(
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
    const data = JSON.parse(content) as STIXBundle;

    if (!data.objects || !Array.isArray(data.objects)) {
      result.errors.push('Bundle STIX invalide: pas d\'objets');
      return result;
    }

    // Separate objects into SDOs (elements), SROs (relationships), and notes
    const sdos: STIXObject[] = [];
    const sros: STIXObject[] = [];
    const notes: STIXObject[] = [];

    for (const obj of data.objects) {
      if (obj.type === 'relationship') {
        sros.push(obj);
      } else if (obj.type === 'note') {
        notes.push(obj);
      } else if (obj.type === 'sighting') {
        // Sightings are special - we'll handle them as relationships
        sros.push(obj);
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

    // First pass: Create elements from SDOs
    for (const sdo of sdos) {
      const newId = generateUUID();
      idMap.set(sdo.id, newId);

      // Get visual style for this STIX type
      const style = STIX_TYPE_STYLES[sdo.type] || {
        color: DEFAULT_ELEMENT_VISUAL.color,
        shape: 'circle' as ElementShape
      };

      // Build label (prefer name, fall back to type + short ID)
      const label = sdo.name || `${sdo.type} (${sdo.id.split('--')[1]?.substring(0, 8) || sdo.id})`;

      // Build notes from description
      let notes = sdo.description || '';

      // Add additional info to notes
      if (sdo.objective) {
        notes += `\n\n**Objectif:** ${sdo.objective}`;
      }
      if (sdo.pattern) {
        notes += `\n\n**Pattern:** \`${sdo.pattern}\``;
      }
      if (sdo.content) {
        notes += `\n\n${sdo.content}`;
      }
      if (sdo.abstract) {
        notes = `**${sdo.abstract}**\n\n${notes}`;
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

      // Build properties from STIX-specific fields
      const properties: Property[] = [];

      // Add STIX ID as property
      properties.push({ key: 'stix_id', value: sdo.id, type: 'text' });

      // Add external references
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

      // Add kill chain phases
      if (sdo.kill_chain_phases) {
        const phases = sdo.kill_chain_phases.map(p => `${p.kill_chain_name}:${p.phase_name}`);
        properties.push({ key: 'kill_chain', value: phases.join(', '), type: 'text' });
      }

      // Add capabilities
      if (sdo.capabilities) {
        properties.push({ key: 'capabilities', value: sdo.capabilities.join(', '), type: 'text' });
      }

      // Add goals
      if (sdo.goals) {
        properties.push({ key: 'goals', value: sdo.goals.join(', '), type: 'text' });
      }

      // Add roles
      if (sdo.roles) {
        properties.push({ key: 'roles', value: sdo.roles.join(', '), type: 'text' });
      }

      // Add authors
      if (sdo.authors) {
        properties.push({ key: 'authors', value: sdo.authors.join(', '), type: 'text' });
      }

      // Add contact info
      if (sdo.contact_information) {
        properties.push({ key: 'contact', value: sdo.contact_information, type: 'text' });
      }

      // Add pattern type
      if (sdo.pattern_type) {
        properties.push({ key: 'pattern_type', value: sdo.pattern_type, type: 'text' });
      }

      // Parse date range from first_seen/last_seen or valid_from/valid_until
      let dateRange: { start: Date | null; end: Date | null } | null = null;
      const startDate = sdo.first_seen || sdo.valid_from;
      const endDate = sdo.last_seen || sdo.valid_until;

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

      // Calculate position on grid
      const position = {
        x: 100 + (gridX * gridSpacing),
        y: 100 + (gridY * gridSpacing),
      };

      gridX++;
      if (gridX >= gridCols) {
        gridX = 0;
        gridY++;
      }

      const element: Element = {
        id: newId,
        investigationId: targetInvestigationId,
        label,
        notes: notes.trim(),
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
      const sourceRef = sro.source_ref || sro.sighting_of_ref;
      const targetRef = sro.target_ref || (sro.observed_data_refs?.[0] as string);

      if (!sourceRef || !targetRef) {
        result.warnings.push(`Relation ignoree: source_ref ou target_ref manquant (${sro.id})`);
        continue;
      }

      const fromId = idMap.get(sourceRef);
      const toId = idMap.get(targetRef);

      if (!fromId || !toId) {
        result.warnings.push(`Relation ignoree: element source/cible non importe (${sro.relationship_type || 'sighting'})`);
        continue;
      }

      // Get French label for relationship type
      const relType = sro.relationship_type || 'sighting';
      const label = STIX_RELATIONSHIP_LABELS[relType] || relType;

      const link: Link = {
        id: generateUUID(),
        investigationId: targetInvestigationId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label,
        notes: sro.description || '',
        tags: [`stix:${relType}`],
        properties: [
          { key: 'stix_id', value: sro.id, type: 'text' },
        ],
        confidence: null,
        source: 'STIX 2.1',
        date: null,
        dateRange: null,
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
    }

    // Third pass: Create annotations from notes (attached to referenced objects)
    for (const note of notes) {
      if (!note.object_refs || note.object_refs.length === 0) {
        result.warnings.push(`Note ignoree: pas d'object_refs (${note.id})`);
        continue;
      }

      // Find position near the first referenced object
      const refId = idMap.get(note.object_refs[0]);
      if (!refId) {
        result.warnings.push(`Note ignoree: objet reference non importe (${note.abstract || note.id})`);
        continue;
      }

      // Get referenced element to position annotation near it
      const refElement = await db.elements.get(refId);
      const position = refElement
        ? { x: refElement.position.x + 150, y: refElement.position.y - 50 }
        : { x: 100 + (gridX * gridSpacing), y: 100 + (gridY * gridSpacing) };

      const newId = generateUUID();
      idMap.set(note.id, newId);

      const annotationContent = note.abstract
        ? `**${note.abstract}**\n\n${note.content || ''}`
        : note.content || '';

      const annotation: Element = {
        id: newId,
        investigationId: targetInvestigationId,
        label: note.abstract || 'Note',
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
          color: '#fef3c7', // Light yellow for annotations
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

        const link: Link = {
          id: generateUUID(),
          investigationId: targetInvestigationId,
          fromId: newId,
          toId: targetId,
          sourceHandle: null,
          targetHandle: null,
          label: 'concerne',
          notes: '',
          tags: ['stix:note-ref'],
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
            color: '#d97706',
          },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        result.linksImported++;
      }
    }

    // Update investigation with bundle info
    const bundleDate = data.created ? new Date(data.created) : new Date();
    await db.investigations.update(targetInvestigationId, {
      description: `Import STIX 2.1 - ${data.id || 'Bundle'}`,
      updatedAt: bundleDate,
    });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      `Erreur d'import STIX2: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}
