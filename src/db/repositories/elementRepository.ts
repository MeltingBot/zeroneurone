import { db } from '../database';
import { generateUUID } from '../../utils';
import type {
  Element,
  ElementId,
  InvestigationId,
  Position,
} from '../../types';
import { DEFAULT_ELEMENT_VISUAL as defaultVisual } from '../../types';

// Helper to rehydrate dates from IndexedDB (they come back as strings)
function rehydrateElement(element: Element): Element {
  return {
    ...element,
    date: element.date ? new Date(element.date) : null,
    dateRange: element.dateRange ? {
      start: element.dateRange.start ? new Date(element.dateRange.start) : null,
      end: element.dateRange.end ? new Date(element.dateRange.end) : null,
    } : null,
    events: (element.events || []).map(event => ({
      ...event,
      date: new Date(event.date),
      dateEnd: event.dateEnd ? new Date(event.dateEnd) : undefined,
    })),
    createdAt: new Date(element.createdAt),
    updatedAt: new Date(element.updatedAt),
  };
}

function createDefaultElement(
  investigationId: InvestigationId,
  label: string,
  position: Position
): Element {
  return {
    id: generateUUID(),
    investigationId,
    label,
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position,
    geo: null,
    events: [],
    visual: { ...defaultVisual },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const elementRepository = {
  async create(
    investigationId: InvestigationId,
    label: string,
    position: Position,
    options: Partial<Element> = {}
  ): Promise<Element> {
    const element = createDefaultElement(investigationId, label, position);
    Object.assign(element, options);

    await db.elements.add(element);
    await db.investigations.update(investigationId, { updatedAt: new Date() });

    return element;
  },

  async getById(id: ElementId): Promise<Element | undefined> {
    const element = await db.elements.get(id);
    return element ? rehydrateElement(element) : undefined;
  },

  async getByInvestigation(investigationId: InvestigationId): Promise<Element[]> {
    const elements = await db.elements.where({ investigationId }).toArray();
    return elements.map(rehydrateElement);
  },

  async getByParentGroup(parentGroupId: ElementId): Promise<Element[]> {
    const elements = await db.elements.where({ parentGroupId }).toArray();
    return elements.map(rehydrateElement);
  },

  async update(
    id: ElementId,
    changes: Partial<Omit<Element, 'id' | 'investigationId' | 'createdAt'>>
  ): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    await db.elements.update(id, {
      ...changes,
      updatedAt: new Date(),
    });

    await db.investigations.update(element.investigationId, {
      updatedAt: new Date(),
    });
  },

  async delete(id: ElementId): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    await db.transaction('rw', [db.elements, db.links, db.investigations], async () => {
      // Delete associated links
      await db.links
        .where('fromId')
        .equals(id)
        .or('toId')
        .equals(id)
        .delete();

      // If it's a group, delete children
      if (element.isGroup) {
        await db.elements.where({ parentGroupId: id }).delete();
      }

      // Delete the element
      await db.elements.delete(id);

      // Update investigation timestamp
      await db.investigations.update(element.investigationId, {
        updatedAt: new Date(),
      });
    });
  },

  async deleteMany(ids: ElementId[]): Promise<void> {
    if (ids.length === 0) return;

    const elements = await db.elements.where('id').anyOf(ids).toArray();
    if (elements.length === 0) return;

    const investigationId = elements[0].investigationId;

    await db.transaction('rw', [db.elements, db.links, db.investigations], async () => {
      // Delete associated links
      for (const id of ids) {
        await db.links
          .where('fromId')
          .equals(id)
          .or('toId')
          .equals(id)
          .delete();
      }

      // Delete elements
      await db.elements.where('id').anyOf(ids).delete();

      // Update investigation timestamp
      await db.investigations.update(investigationId, {
        updatedAt: new Date(),
      });
    });
  },

  async addToGroup(elementId: ElementId, groupId: ElementId): Promise<void> {
    const group = await db.elements.get(groupId);
    if (!group || !group.isGroup) {
      throw new Error('Target is not a group');
    }

    await db.elements.update(elementId, { parentGroupId: groupId });
    await db.elements.update(groupId, {
      childIds: [...group.childIds, elementId],
      updatedAt: new Date(),
    });
  },

  async removeFromGroup(elementId: ElementId): Promise<void> {
    const element = await db.elements.get(elementId);
    if (!element || !element.parentGroupId) return;

    const group = await db.elements.get(element.parentGroupId);
    if (group) {
      await db.elements.update(group.id, {
        childIds: group.childIds.filter((id) => id !== elementId),
        updatedAt: new Date(),
      });
    }

    await db.elements.update(elementId, { parentGroupId: null });
  },

  async createGroup(
    investigationId: InvestigationId,
    name: string,
    elementIds: ElementId[],
    position: Position
  ): Promise<Element> {
    const group = await this.create(investigationId, name, position, {
      isGroup: true,
      childIds: elementIds,
    });

    // Update children
    await db.elements.where('id').anyOf(elementIds).modify({ parentGroupId: group.id });

    return group;
  },

  async updatePosition(id: ElementId, position: Position): Promise<void> {
    await db.elements.update(id, {
      position,
      updatedAt: new Date(),
    });
  },

  async updatePositions(updates: { id: ElementId; position: Position }[]): Promise<void> {
    await db.transaction('rw', db.elements, async () => {
      for (const { id, position } of updates) {
        await db.elements.update(id, {
          position,
          updatedAt: new Date(),
        });
      }
    });
  },

  async addTag(id: ElementId, tag: string): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    if (!element.tags.includes(tag)) {
      await db.elements.update(id, {
        tags: [...element.tags, tag],
        updatedAt: new Date(),
      });
    }
  },

  async removeTag(id: ElementId, tag: string): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    await db.elements.update(id, {
      tags: element.tags.filter((t) => t !== tag),
      updatedAt: new Date(),
    });
  },

  async addAsset(id: ElementId, assetId: string): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    if (!element.assetIds.includes(assetId)) {
      await db.elements.update(id, {
        assetIds: [...element.assetIds, assetId],
        updatedAt: new Date(),
      });
    }
  },

  async removeAsset(id: ElementId, assetId: string): Promise<void> {
    const element = await db.elements.get(id);
    if (!element) return;

    await db.elements.update(id, {
      assetIds: element.assetIds.filter((a) => a !== assetId),
      updatedAt: new Date(),
    });
  },

  /**
   * Bulk upsert elements (insert or update)
   * Used for syncing from Y.Doc to IndexedDB
   */
  async bulkUpsert(elements: Element[]): Promise<void> {
    if (elements.length === 0) return;
    await db.elements.bulkPut(elements);
  },

  /**
   * Delete elements not in the given list of IDs
   * Used for syncing deletions from Y.Doc to IndexedDB
   */
  async deleteNotIn(investigationId: InvestigationId, keepIds: ElementId[]): Promise<void> {
    const keepSet = new Set(keepIds);
    const allElements = await db.elements.where({ investigationId }).toArray();
    const toDelete = allElements.filter(el => !keepSet.has(el.id)).map(el => el.id);

    if (toDelete.length > 0) {
      await db.elements.where('id').anyOf(toDelete).delete();
    }
  },
};
