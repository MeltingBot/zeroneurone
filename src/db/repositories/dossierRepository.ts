import { db } from '../database';
import { generateUUID } from '../../utils';
import type { Dossier, DossierId, PropertyDefinition } from '../../types';

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
 * Rehydrate dossier with default values for new fields
 * This ensures backwards compatibility with existing data
 */
function rehydrateDossier(dossier: Dossier): Dossier {
  return {
    ...dossier,
    startDate: dossier.startDate ?? null,
    creator: dossier.creator ?? '',
    tags: dossier.tags ?? [],
    properties: dossier.properties ?? [],
    isFavorite: dossier.isFavorite ?? false,
    isArchived: dossier.isArchived ?? false,
    settings: {
      ...dossier.settings,
      suggestedProperties: migratePropertyArray(dossier.settings?.suggestedProperties),
      tagPropertyAssociations: migrateTagAssociations(dossier.settings?.tagPropertyAssociations),
    },
  };
}

export const dossierRepository = {
  async create(name: string, description: string = ''): Promise<Dossier> {
    const dossier: Dossier = {
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
        linkAnchorMode: 'auto',
      },
      isFavorite: false,
      isArchived: false,
    };

    await db.dossiers.add(dossier);
    return dossier;
  },

  /**
   * Create an dossier with a specific UUID
   * Used when joining a shared dossier to maintain the same ID across clients
   */
  async createWithId(id: DossierId, name: string, description: string = ''): Promise<Dossier> {
    // Check if dossier with this ID already exists
    const existing = await db.dossiers.get(id);
    if (existing) {
      return rehydrateDossier(existing);
    }

    const dossier: Dossier = {
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
        linkAnchorMode: 'auto',
      },
      isFavorite: false,
      isArchived: false,
    };

    await db.dossiers.add(dossier);
    return dossier;
  },

  /**
   * Toggle favorite status of an dossier
   */
  async toggleFavorite(id: DossierId): Promise<boolean> {
    const dossier = await db.dossiers.get(id);
    if (!dossier) return false;

    const newValue = !dossier.isFavorite;
    await db.dossiers.update(id, {
      isFavorite: newValue,
      updatedAt: new Date(),
    });
    return newValue;
  },

  /**
   * Toggle archive status of a dossier
   */
  async toggleArchive(id: DossierId): Promise<boolean> {
    const dossier = await db.dossiers.get(id);
    if (!dossier) return false;

    const newValue = !(dossier.isArchived ?? false);
    await db.dossiers.update(id, {
      isArchived: newValue,
    });
    return newValue;
  },

  /**
   * Update dossier tags
   */
  async setTags(id: DossierId, tags: string[]): Promise<void> {
    await db.dossiers.update(id, {
      tags,
      updatedAt: new Date(),
    });
  },

  /**
   * Get all unique tags used across all dossiers
   */
  async getAllTags(): Promise<string[]> {
    const dossiers = await db.dossiers.toArray();
    const tagSet = new Set<string>();
    for (const inv of dossiers) {
      if (inv.tags) {
        for (const tag of inv.tags) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  },

  async getById(id: DossierId): Promise<Dossier | undefined> {
    const dossier = await db.dossiers.get(id);
    return dossier ? rehydrateDossier(dossier) : undefined;
  },

  async getAll(): Promise<Dossier[]> {
    const dossiers = await db.dossiers.orderBy('updatedAt').reverse().toArray();
    return dossiers.map(rehydrateDossier);
  },

  async update(
    id: DossierId,
    changes: Partial<Omit<Dossier, 'id' | 'createdAt'>>
  ): Promise<void> {
    await db.dossiers.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  async delete(id: DossierId): Promise<void> {
    await db.transaction(
      'rw',
      [db.dossiers, db.elements, db.links, db.assets, db.views, db.reports],
      async () => {
        await db.elements.where({ dossierId: id }).delete();
        await db.links.where({ dossierId: id }).delete();
        await db.assets.where({ dossierId: id }).delete();
        await db.views.where({ dossierId: id }).delete();
        await db.reports.where({ dossierId: id }).delete();
        await db.dossiers.delete(id);
      }
    );
  },

  async updateViewport(
    id: DossierId,
    viewport: { x: number; y: number; zoom: number }
  ): Promise<void> {
    await db.dossiers.update(id, {
      viewport,
      updatedAt: new Date(),
    });
  },

  async addTag(id: DossierId, tag: string): Promise<void> {
    const dossier = await db.dossiers.get(id);
    if (!dossier) return;

    const existingTags = dossier.settings.existingTags;
    if (!existingTags.includes(tag)) {
      await db.dossiers.update(id, {
        settings: {
          ...dossier.settings,
          existingTags: [...existingTags, tag],
        },
        updatedAt: new Date(),
      });
    }
  },

  async addSuggestedProperty(id: DossierId, propertyDef: PropertyDefinition): Promise<void> {
    const dossier = await db.dossiers.get(id);
    if (!dossier) return;

    const rehydrated = rehydrateDossier(dossier);
    const suggestedProperties = rehydrated.settings.suggestedProperties;

    // Check if property with same key already exists
    const exists = suggestedProperties.some(p => p.key === propertyDef.key);
    if (!exists) {
      await db.dossiers.update(id, {
        settings: {
          ...rehydrated.settings,
          suggestedProperties: [...suggestedProperties, propertyDef],
        },
        updatedAt: new Date(),
      });
    }
  },

  async associatePropertyWithTags(
    id: DossierId,
    propertyDef: PropertyDefinition,
    tags: string[]
  ): Promise<void> {
    const dossier = await db.dossiers.get(id);
    if (!dossier || tags.length === 0) return;

    const rehydrated = rehydrateDossier(dossier);
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
      await db.dossiers.update(id, {
        settings: {
          ...rehydrated.settings,
          tagPropertyAssociations: associations,
        },
        updatedAt: new Date(),
      });
    }
  },

  async getStats(id: DossierId): Promise<{
    elementCount: number;
    linkCount: number;
    assetCount: number;
  }> {
    const [elementCount, linkCount, assetCount] = await Promise.all([
      db.elements.where({ dossierId: id }).count(),
      db.links.where({ dossierId: id }).count(),
      db.assets.where({ dossierId: id }).count(),
    ]);
    return { elementCount, linkCount, assetCount };
  },
};
