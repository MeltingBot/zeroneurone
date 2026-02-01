/**
 * Genealogy Converter Service
 * Converts GenealogyData to ZeroNeurone Elements and Links
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Element,
  Link,
  ElementEvent,
  Property,
  InvestigationId,
  ElementId,
  LinkId,
} from '../../types';
import type {
  GenealogyData,
  GenealogyPerson,
  GenealogyFamily,
  GenealogyDate,
  GenealogyImportOptions,
} from './types';

interface ConversionResult {
  elements: Partial<Element>[];
  links: Partial<Link>[];
  /** Mapping from GEDCOM ID to Element ID */
  idMapping: Map<string, ElementId>;
  warnings: string[];
}

/**
 * Convert GenealogyData to ZeroNeurone Elements and Links
 */
export function convertToZeroNeurone(
  data: GenealogyData,
  investigationId: InvestigationId,
  options: GenealogyImportOptions
): ConversionResult {
  const idMapping = new Map<string, ElementId>();
  const warnings: string[] = [];

  // Convert persons to elements
  const elements: Partial<Element>[] = [];
  for (const person of data.persons) {
    const element = personToElement(person, investigationId, data.fileName, options);
    if (element && element.id) {
      elements.push(element);
      idMapping.set(person.id, element.id as ElementId);
    }
  }

  // Convert families to links
  const links: Partial<Link>[] = [];
  for (const family of data.families) {
    const familyLinks = familyToLinks(family, idMapping, investigationId, data.fileName, options, data.persons);
    links.push(...familyLinks);
  }

  return { elements, links, idMapping, warnings };
}

/**
 * Convert a GenealogyPerson to a ZeroNeurone Element
 */
function personToElement(
  person: GenealogyPerson,
  investigationId: InvestigationId,
  sourceFile: string,
  options: GenealogyImportOptions
): Partial<Element> {
  const id = uuidv4() as ElementId;

  // Build life events
  const events: ElementEvent[] = [];

  if (person.birthDate) {
    const birthDate = toDate(person.birthDate);
    events.push({
      id: uuidv4(),
      date: birthDate,
      dateEnd: birthDate, // Point-in-time event: same start and end
      label: 'Naissance',
      geo: person.birthPlace?.lat != null && person.birthPlace?.lng != null
        ? { lat: person.birthPlace.lat, lng: person.birthPlace.lng }
        : undefined,
      properties: person.birthPlace
        ? [{ key: 'Lieu', value: person.birthPlace.name, type: 'text' as const }]
        : [],
    });
  }

  if (person.deathDate) {
    const deathDate = toDate(person.deathDate);
    events.push({
      id: uuidv4(),
      date: deathDate,
      dateEnd: deathDate, // Point-in-time event: same start and end
      label: 'Décès',
      geo: person.deathPlace?.lat != null && person.deathPlace?.lng != null
        ? { lat: person.deathPlace.lat, lng: person.deathPlace.lng }
        : undefined,
      properties: person.deathPlace
        ? [{ key: 'Lieu', value: person.deathPlace.name, type: 'text' as const }]
        : [],
    });
  }

  // Add residences as events
  for (const residence of person.residences || []) {
    if (residence.startDate || residence.place) {
      events.push({
        id: uuidv4(),
        date: residence.startDate ? toDate(residence.startDate) : new Date(),
        dateEnd: residence.endDate ? toDate(residence.endDate) : undefined,
        label: 'Résidence',
        geo: residence.place?.lat != null && residence.place?.lng != null
          ? { lat: residence.place.lat, lng: residence.place.lng }
          : undefined,
        properties: residence.place
          ? [{ key: 'Lieu', value: residence.place.name, type: 'text' as const }]
          : [],
      });
    }
  }

  // Build properties
  const properties: Property[] = [
    { key: 'Prénom', value: person.firstName, type: 'text' },
    { key: 'Nom', value: person.lastName, type: 'text' },
    { key: 'Sexe', value: person.sex === 'M' ? 'Masculin' : person.sex === 'F' ? 'Féminin' : 'Inconnu', type: 'choice' },
  ];

  if (options.importOccupation && person.occupation) {
    properties.push({ key: 'Profession', value: person.occupation, type: 'text' });
  }

  if (person.nickname) {
    properties.push({ key: 'Surnom', value: person.nickname, type: 'text' });
  }

  if (person.title) {
    properties.push({ key: 'Titre', value: person.title, type: 'text' });
  }

  // Note: Lieu de naissance/décès are stored in events, not as element properties

  // Add source ID for reference
  properties.push({ key: 'ID source', value: person.id, type: 'text' });

  // Build tags
  const tags: string[] = [];
  if (options.addGenealogyTag) {
    tags.push('Généalogie');
  }
  if (person.sex === 'M') {
    tags.push('Homme');
  } else if (person.sex === 'F') {
    tags.push('Femme');
  }

  // Determine visual appearance
  const visual = getPersonVisual(person, options);

  return {
    id,
    investigationId,
    label: `${person.firstName} ${person.lastName}`,
    notes: options.importNotes && person.notes ? person.notes : '',
    tags,
    properties,
    confidence: 80,
    source: sourceFile,
    date: person.birthDate ? toDate(person.birthDate) : null,
    dateRange: (person.birthDate || person.deathDate)
      ? {
          start: person.birthDate ? toDate(person.birthDate) : null,
          end: person.deathDate ? toDate(person.deathDate) : null,
        }
      : null,
    // Don't set fixed geo on person - each event (birth, death, residence) has its own location
    // The map view will use events' geo coordinates instead
    geo: null,
    events,
    visual,
    position: { x: 0, y: 0 }, // Will be set by layout
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get visual appearance for a person based on options
 */
function getPersonVisual(person: GenealogyPerson, options: GenealogyImportOptions) {
  if (options.colorByGender) {
    if (person.sex === 'M') {
      return {
        color: '#93c5fd', // blue-300
        borderColor: '#3b82f6', // blue-500
        borderWidth: 2,
        borderStyle: 'solid' as const,
        shape: 'rectangle' as const,
        size: 'medium' as const,
        icon: 'user',
        image: null,
      };
    } else if (person.sex === 'F') {
      return {
        color: '#f9a8d4', // pink-300
        borderColor: '#ec4899', // pink-500
        borderWidth: 2,
        borderStyle: 'solid' as const,
        shape: 'rectangle' as const,
        size: 'medium' as const,
        icon: 'user',
        image: null,
      };
    }
  }

  // Default/Unknown
  return {
    color: '#d4d4d4', // neutral-300
    borderColor: '#737373', // neutral-500
    borderWidth: 2,
    borderStyle: 'solid' as const,
    shape: 'rectangle' as const,
    size: 'medium' as const,
    icon: 'user',
    image: null,
  };
}

/**
 * Convert a GenealogyFamily to ZeroNeurone Links
 */
function familyToLinks(
  family: GenealogyFamily,
  idMapping: Map<string, ElementId>,
  investigationId: InvestigationId,
  sourceFile: string,
  options: GenealogyImportOptions,
  persons: GenealogyPerson[]
): Partial<Link>[] {
  const links: Partial<Link>[] = [];

  // Marriage link (husband ↔ wife)
  if (family.husbandId && family.wifeId) {
    const husbandElementId = idMapping.get(family.husbandId);
    const wifeElementId = idMapping.get(family.wifeId);

    if (husbandElementId && wifeElementId) {
      const marriageProperties: Property[] = [];

      if (family.marriageDate) {
        marriageProperties.push({
          key: 'Date mariage',
          value: formatDate(family.marriageDate),
          type: 'date',
        });
      }

      if (family.marriagePlace) {
        marriageProperties.push({
          key: 'Lieu mariage',
          value: family.marriagePlace.name,
          type: 'text',
        });
      }

      if (family.divorceDate) {
        marriageProperties.push({
          key: 'Date divorce',
          value: formatDate(family.divorceDate),
          type: 'date',
        });
      }

      marriageProperties.push({ key: 'ID famille', value: family.id, type: 'text' });

      const tags: string[] = ['Mariage'];
      if (options.addGenealogyTag) tags.push('Généalogie');

      // Calculate marriage end date:
      // Priority: divorce date > earliest death date of either spouse
      let marriageEndDate: Date | null = null;
      if (family.divorceDate) {
        marriageEndDate = toDate(family.divorceDate);
      } else {
        // Find death dates of both spouses
        const husband = persons.find(p => p.id === family.husbandId);
        const wife = persons.find(p => p.id === family.wifeId);
        const husbandDeathDate = husband?.deathDate ? toDate(husband.deathDate) : null;
        const wifeDeathDate = wife?.deathDate ? toDate(wife.deathDate) : null;

        // Marriage ends at the first spouse's death
        if (husbandDeathDate && wifeDeathDate) {
          marriageEndDate = husbandDeathDate < wifeDeathDate ? husbandDeathDate : wifeDeathDate;
        } else if (husbandDeathDate) {
          marriageEndDate = husbandDeathDate;
        } else if (wifeDeathDate) {
          marriageEndDate = wifeDeathDate;
        }
      }

      links.push({
        id: uuidv4() as LinkId,
        investigationId,
        fromId: husbandElementId,
        toId: wifeElementId,
        sourceHandle: null,
        targetHandle: null,
        label: 'marié(e) à',
        notes: family.notes || '',
        tags,
        properties: marriageProperties,
        directed: false,
        direction: 'both',
        confidence: 80,
        source: sourceFile,
        date: family.marriageDate ? toDate(family.marriageDate) : null,
        dateRange: (family.marriageDate || marriageEndDate)
          ? {
              start: family.marriageDate ? toDate(family.marriageDate) : null,
              end: marriageEndDate,
            }
          : null,
        visual: {
          color: '#f59e0b', // amber-500
          style: 'solid',
          thickness: 3,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Parent → Child links
  const parentIds = [family.husbandId, family.wifeId].filter(Boolean) as string[];

  for (const parentId of parentIds) {
    const parentElementId = idMapping.get(parentId);
    if (!parentElementId) continue;

    for (const childId of family.childIds) {
      const childElementId = idMapping.get(childId);
      if (!childElementId) continue;

      const tags: string[] = ['Filiation'];
      if (options.addGenealogyTag) tags.push('Généalogie');

      links.push({
        id: uuidv4() as LinkId,
        investigationId,
        fromId: parentElementId,
        toId: childElementId,
        sourceHandle: null,
        targetHandle: null,
        label: 'parent de',
        notes: '',
        tags,
        properties: [
          { key: 'Type', value: 'Filiation', type: 'text' },
          { key: 'ID famille', value: family.id, type: 'text' },
        ],
        directed: true,
        direction: 'forward',
        confidence: 90,
        source: sourceFile,
        date: null,
        dateRange: null,
        visual: {
          color: '#10b981', // emerald-500
          style: 'solid',
          thickness: 2,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Sibling links (optional)
  if (options.createSiblingLinks && family.childIds.length > 1) {
    for (let i = 0; i < family.childIds.length; i++) {
      for (let j = i + 1; j < family.childIds.length; j++) {
        const sibling1Id = idMapping.get(family.childIds[i]);
        const sibling2Id = idMapping.get(family.childIds[j]);

        if (sibling1Id && sibling2Id) {
          const tags: string[] = ['Fratrie'];
          if (options.addGenealogyTag) tags.push('Généalogie');

          links.push({
            id: uuidv4() as LinkId,
            investigationId,
            fromId: sibling1Id,
            toId: sibling2Id,
            sourceHandle: null,
            targetHandle: null,
            label: 'frère/sœur de',
            notes: '',
            tags,
            properties: [
              { key: 'Type', value: 'Fratrie', type: 'text' },
              { key: 'ID famille', value: family.id, type: 'text' },
            ],
            directed: false,
            direction: 'none',
            confidence: 90,
            source: sourceFile,
            date: null,
            dateRange: null,
            visual: {
              color: '#3b82f6', // blue-500
              style: 'dashed',
              thickness: 1,
            },
            curveOffset: { x: 0, y: 0 },
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }
  }

  return links;
}

/**
 * Convert GenealogyDate to JavaScript Date
 */
function toDate(gdate: GenealogyDate): Date {
  const year = gdate.year || 1900;
  const month = (gdate.month || 1) - 1; // JavaScript months are 0-indexed
  const day = gdate.day || 1;

  return new Date(year, month, day);
}

/**
 * Format GenealogyDate as string
 */
function formatDate(gdate: GenealogyDate): string {
  const parts: string[] = [];

  if (gdate.day) parts.push(gdate.day.toString().padStart(2, '0'));
  if (gdate.month) parts.push(gdate.month.toString().padStart(2, '0'));
  if (gdate.year) parts.push(gdate.year.toString());

  if (parts.length === 0) return gdate.raw;

  let formatted = parts.join('/');

  // Add modifier prefix
  switch (gdate.modifier) {
    case 'about':
      formatted = `~${formatted}`;
      break;
    case 'before':
      formatted = `<${formatted}`;
      break;
    case 'after':
      formatted = `>${formatted}`;
      break;
    case 'between':
      if (gdate.endYear) {
        formatted = `${formatted}..${gdate.endYear}`;
      }
      break;
  }

  return formatted;
}
