import { db } from '../database';
import { generateUUID } from '../../utils';
import type { CanvasTab, TabId, InvestigationId } from '../../types';

/**
 * Rehydrate CanvasTab dates (IndexedDB stores as strings)
 */
function rehydrateTab(tab: CanvasTab): CanvasTab {
  return {
    ...tab,
    excludedElementIds: tab.excludedElementIds ?? [],
    createdAt: new Date(tab.createdAt),
    updatedAt: new Date(tab.updatedAt),
  };
}

export const tabRepository = {
  /**
   * Get all tabs for an investigation, sorted by order
   */
  async getByInvestigation(investigationId: InvestigationId): Promise<CanvasTab[]> {
    const tabs = await db.canvasTabs.where({ investigationId }).sortBy('order');
    return tabs.map(rehydrateTab);
  },

  /**
   * Get a tab by ID
   */
  async getById(id: TabId): Promise<CanvasTab | undefined> {
    const tab = await db.canvasTabs.get(id);
    return tab ? rehydrateTab(tab) : undefined;
  },

  /**
   * Create a new tab
   */
  async create(
    investigationId: InvestigationId,
    name: string,
    order: number,
  ): Promise<CanvasTab> {
    const now = new Date();
    const tab: CanvasTab = {
      id: generateUUID(),
      investigationId,
      name,
      order,
      memberElementIds: [],
      excludedElementIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };
    await db.canvasTabs.add(tab);
    return tab;
  },

  /**
   * Update a tab
   */
  async update(
    id: TabId,
    changes: Partial<Omit<CanvasTab, 'id' | 'investigationId' | 'createdAt'>>,
  ): Promise<void> {
    await db.canvasTabs.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  /**
   * Delete a tab
   */
  async delete(id: TabId): Promise<void> {
    await db.canvasTabs.delete(id);
  },

  /**
   * Delete all tabs for an investigation
   */
  async deleteByInvestigation(investigationId: InvestigationId): Promise<void> {
    await db.canvasTabs.where({ investigationId }).delete();
  },

  /**
   * Bulk upsert tabs (for Y.js sync — insert or update)
   */
  async bulkUpsert(tabs: CanvasTab[]): Promise<void> {
    await db.canvasTabs.bulkPut(tabs);
  },

  /**
   * Remove an element from all tabs of an investigation
   * (called when an element is deleted)
   */
  async removeElementFromAllTabs(
    investigationId: InvestigationId,
    elementId: string,
  ): Promise<void> {
    const tabs = await db.canvasTabs.where({ investigationId }).toArray();
    const updates = tabs
      .filter(tab => tab.memberElementIds.includes(elementId) || (tab.excludedElementIds ?? []).includes(elementId))
      .map(tab => ({
        key: tab.id,
        changes: {
          memberElementIds: tab.memberElementIds.filter(id => id !== elementId),
          excludedElementIds: (tab.excludedElementIds ?? []).filter(id => id !== elementId),
          updatedAt: new Date(),
        },
      }));

    if (updates.length > 0) {
      await Promise.all(
        updates.map(u => db.canvasTabs.update(u.key, u.changes)),
      );
    }
  },
};
