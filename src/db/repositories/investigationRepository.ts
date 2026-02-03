import { db } from '../database';
import { generateUUID } from '../../utils';
import type { Investigation, InvestigationId, PropertyDefinition } from '../../types';

/**
 * Migrate old string-based property to PropertyDefinition
 */
function migrateProperty(prop: string | PropertyDefinition): PropertyDefinition {
  if (typeof prop === 'string') {
    return { key: prop, type: 'text' };
  }
  return prop;
}

/**
 * Migrate old string[] to PropertyDefinition[]
 */
function migratePropertyArray(arr: (string | PropertyDefinition)[] | undefined): PropertyDefinition[] {
  if (!arr) return [];
  return arr.map(migrateProperty);
}

/**
 * Migrate old Record<string, string[]> to Record<string, PropertyDefinition[]>
 */
function migrateTagAssociations(
  associations: Record<string, (string | PropertyDefinition)[]> | undefined
): Record<string, PropertyDefinition[]> {
  if (!associations) return {};
  const result: Record<string, PropertyDefinition[]> = {};
  for (const [tag, props] of Object.entries(associations)) {
    result[tag] = migratePropertyArray(props);
  }
  return result;
}

/**
 * Rehydrate investigation with default values for new fields
 * This ensures backwards compatibility with existing data
 */
function rehydrateInvestigation(investigation: Investigation): Investigation {
  return {
    ...investigation,
    startDate: investigation.startDate ?? null,
    creator: investigation.creator ?? '',
    tags: investigation.tags ?? [],
    properties: investigation.properties ?? [],
    isFavorite: investigation.isFavorite ?? false,
    settings: {
      ...investigation.settings,
      suggestedProperties: migratePropertyArray(investigation.settings?.suggestedProperties),
      tagPropertyAssociations: migrateTagAssociations(investigation.settings?.tagPropertyAssociations),
    },
  };
}

export const investigationRepository = {
  async create(name: string, description: string = ''): Promise<Investigation> {
    const investigation: Investigation = {
      id: generateUUID(),
      name,
      description,
      startDate: null,
      creator: '',
      tags: [],
      properties: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: {
        defaultElementVisual: {},
        defaultLinkVisual: {},
        suggestedProperties: [],
        existingTags: [],
        tagPropertyAssociations: {},
        showConfidenceIndicator: false,
        displayedProperties: [],
        tagDisplayMode: 'icons',
        tagDisplaySize: 'small',
      },
      isFavorite: false,
    };

    await db.investigations.add(investigation);
    return investigation;
  },

  /**
   * Create an investigation with a specific UUID
   * Used when joining a shared investigation to maintain the same ID across clients
   */
  async createWithId(id: InvestigationId, name: string, description: string = ''): Promise<Investigation> {
    // Check if investigation with this ID already exists
    const existing = await db.investigations.get(id);
    if (existing) {
      return rehydrateInvestigation(existing);
    }

    const investigation: Investigation = {
      id,
      name,
      description,
      startDate: null,
      creator: '',
      tags: [],
      properties: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: {
        defaultElementVisual: {},
        defaultLinkVisual: {},
        suggestedProperties: [],
        existingTags: [],
        tagPropertyAssociations: {},
        showConfidenceIndicator: false,
        displayedProperties: [],
        tagDisplayMode: 'icons',
        tagDisplaySize: 'small',
      },
      isFavorite: false,
    };

    await db.investigations.add(investigation);
    return investigation;
  },

  /**
   * Toggle favorite status of an investigation
   */
  async toggleFavorite(id: InvestigationId): Promise<boolean> {
    const investigation = await db.investigations.get(id);
    if (!investigation) return false;

    const newValue = !investigation.isFavorite;
    await db.investigations.update(id, {
      isFavorite: newValue,
      updatedAt: new Date(),
    });
    return newValue;
  },

  /**
   * Update investigation tags
   */
  async setTags(id: InvestigationId, tags: string[]): Promise<void> {
    await db.investigations.update(id, {
      tags,
      updatedAt: new Date(),
    });
  },

  /**
   * Get all unique tags used across all investigations
   */
  async getAllTags(): Promise<string[]> {
    const investigations = await db.investigations.toArray();
    const tagSet = new Set<string>();
    for (const inv of investigations) {
      if (inv.tags) {
        for (const tag of inv.tags) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  },

  async getById(id: InvestigationId): Promise<Investigation | undefined> {
    const investigation = await db.investigations.get(id);
    return investigation ? rehydrateInvestigation(investigation) : undefined;
  },

  async getAll(): Promise<Investigation[]> {
    const investigations = await db.investigations.orderBy('updatedAt').reverse().toArray();
    return investigations.map(rehydrateInvestigation);
  },

  async update(
    id: InvestigationId,
    changes: Partial<Omit<Investigation, 'id' | 'createdAt'>>
  ): Promise<void> {
    await db.investigations.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  async delete(id: InvestigationId): Promise<void> {
    await db.transaction(
      'rw',
      [db.investigations, db.elements, db.links, db.assets, db.views, db.reports],
      async () => {
        await db.elements.where({ investigationId: id }).delete();
        await db.links.where({ investigationId: id }).delete();
        await db.assets.where({ investigationId: id }).delete();
        await db.views.where({ investigationId: id }).delete();
        await db.reports.where({ investigationId: id }).delete();
        await db.investigations.delete(id);
      }
    );
  },

  async updateViewport(
    id: InvestigationId,
    viewport: { x: number; y: number; zoom: number }
  ): Promise<void> {
    await db.investigations.update(id, {
      viewport,
      updatedAt: new Date(),
    });
  },

  async addTag(id: InvestigationId, tag: string): Promise<void> {
    const investigation = await db.investigations.get(id);
    if (!investigation) return;

    const existingTags = investigation.settings.existingTags;
    if (!existingTags.includes(tag)) {
      await db.investigations.update(id, {
        settings: {
          ...investigation.settings,
          existingTags: [...existingTags, tag],
        },
        updatedAt: new Date(),
      });
    }
  },

  async addSuggestedProperty(id: InvestigationId, propertyDef: PropertyDefinition): Promise<void> {
    const investigation = await db.investigations.get(id);
    if (!investigation) return;

    const rehydrated = rehydrateInvestigation(investigation);
    const suggestedProperties = rehydrated.settings.suggestedProperties;

    // Check if property with same key already exists
    const exists = suggestedProperties.some(p => p.key === propertyDef.key);
    if (!exists) {
      await db.investigations.update(id, {
        settings: {
          ...rehydrated.settings,
          suggestedProperties: [...suggestedProperties, propertyDef],
        },
        updatedAt: new Date(),
      });
    }
  },

  async associatePropertyWithTags(
    id: InvestigationId,
    propertyDef: PropertyDefinition,
    tags: string[]
  ): Promise<void> {
    const investigation = await db.investigations.get(id);
    if (!investigation || tags.length === 0) return;

    const rehydrated = rehydrateInvestigation(investigation);
    const associations = { ...rehydrated.settings.tagPropertyAssociations };
    let updated = false;

    for (const tag of tags) {
      if (!associations[tag]) {
        associations[tag] = [];
      }
      // Check if property with same key already exists for this tag
      const existingIndex = associations[tag].findIndex(p => p.key === propertyDef.key);
      if (existingIndex === -1) {
        // Add new property
        associations[tag] = [...associations[tag], propertyDef];
        updated = true;
      } else if (associations[tag][existingIndex].type !== propertyDef.type) {
        // Update type if different
        associations[tag] = associations[tag].map((p, i) =>
          i === existingIndex ? propertyDef : p
        );
        updated = true;
      }
    }

    if (updated) {
      await db.investigations.update(id, {
        settings: {
          ...rehydrated.settings,
          tagPropertyAssociations: associations,
        },
        updatedAt: new Date(),
      });
    }
  },

  async getStats(id: InvestigationId): Promise<{
    elementCount: number;
    linkCount: number;
    assetCount: number;
  }> {
    const [elementCount, linkCount, assetCount] = await Promise.all([
      db.elements.where({ investigationId: id }).count(),
      db.links.where({ investigationId: id }).count(),
      db.assets.where({ investigationId: id }).count(),
    ]);
    return { elementCount, linkCount, assetCount };
  },
};
