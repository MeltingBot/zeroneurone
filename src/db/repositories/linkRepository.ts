import { db } from '../database';
import { generateUUID } from '../../utils';
import type { Link, LinkId, ElementId, InvestigationId } from '../../types';
import { DEFAULT_LINK_VISUAL } from '../../types';

// Helper to rehydrate dates from IndexedDB (they come back as strings)
// Also migrates old curveOffset format (number) to new format ({ x, y })
function rehydrateLink(link: Link): Link {
  // Migrate old curveOffset format (number) to new 2D format ({ x, y })
  let curveOffset = link.curveOffset;
  if (typeof curveOffset === 'number') {
    // Old format was perpendicular offset - reset to zero for simplicity
    curveOffset = { x: 0, y: 0 };
  } else if (!curveOffset || typeof curveOffset !== 'object') {
    curveOffset = { x: 0, y: 0 };
  }

  return {
    ...link,
    tags: link.tags || [], // Ensure tags array exists for old links
    date: link.date ? new Date(link.date) : null,
    dateRange: link.dateRange ? {
      start: link.dateRange.start ? new Date(link.dateRange.start) : null,
      end: link.dateRange.end ? new Date(link.dateRange.end) : null,
    } : null,
    curveOffset,
    createdAt: new Date(link.createdAt),
    updatedAt: new Date(link.updatedAt),
  };
}

function createDefaultLink(
  investigationId: InvestigationId,
  fromId: ElementId,
  toId: ElementId
): Link {
  return {
    id: generateUUID(),
    investigationId,
    fromId,
    toId,
    sourceHandle: null,
    targetHandle: null,
    label: '',
    notes: '',
    tags: [],
    properties: [],
    directed: false,
    direction: 'none',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: { ...DEFAULT_LINK_VISUAL },
    curveOffset: { x: 0, y: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const linkRepository = {
  async create(
    investigationId: InvestigationId,
    fromId: ElementId,
    toId: ElementId,
    options: Partial<Link> = {}
  ): Promise<Link> {
    // Prevent self-loops
    if (fromId === toId) {
      throw new Error('Self-loops are not allowed');
    }

    const link = createDefaultLink(investigationId, fromId, toId);
    Object.assign(link, options);

    await db.links.add(link);
    await db.investigations.update(investigationId, { updatedAt: new Date() });

    return link;
  },

  async getById(id: LinkId): Promise<Link | undefined> {
    const link = await db.links.get(id);
    return link ? rehydrateLink(link) : undefined;
  },

  async getByInvestigation(investigationId: InvestigationId): Promise<Link[]> {
    const links = await db.links.where({ investigationId }).toArray();
    return links.map(rehydrateLink);
  },

  async getByElement(elementId: ElementId): Promise<Link[]> {
    const links = await db.links
      .where('fromId')
      .equals(elementId)
      .or('toId')
      .equals(elementId)
      .toArray();
    return links.map(rehydrateLink);
  },

  async getLinksBetween(fromId: ElementId, toId: ElementId): Promise<Link[]> {
    const links = await db.links
      .where('fromId')
      .equals(fromId)
      .and((link) => link.toId === toId)
      .toArray();

    const reverseLinks = await db.links
      .where('fromId')
      .equals(toId)
      .and((link) => link.toId === fromId)
      .toArray();

    return [...links, ...reverseLinks].map(rehydrateLink);
  },

  async update(
    id: LinkId,
    changes: Partial<Omit<Link, 'id' | 'investigationId' | 'createdAt'>>
  ): Promise<void> {
    const link = await db.links.get(id);
    if (!link) return;

    await db.links.update(id, {
      ...changes,
      updatedAt: new Date(),
    });

    await db.investigations.update(link.investigationId, {
      updatedAt: new Date(),
    });
  },

  async delete(id: LinkId): Promise<void> {
    const link = await db.links.get(id);
    if (!link) return;

    await db.links.delete(id);
    await db.investigations.update(link.investigationId, {
      updatedAt: new Date(),
    });
  },

  async deleteMany(ids: LinkId[]): Promise<void> {
    if (ids.length === 0) return;

    const links = await db.links.where('id').anyOf(ids).toArray();
    if (links.length === 0) return;

    const investigationId = links[0].investigationId;

    await db.transaction('rw', [db.links, db.investigations], async () => {
      await db.links.where('id').anyOf(ids).delete();
      await db.investigations.update(investigationId, {
        updatedAt: new Date(),
      });
    });
  },

  async deleteByElement(elementId: ElementId): Promise<void> {
    await db.links
      .where('fromId')
      .equals(elementId)
      .or('toId')
      .equals(elementId)
      .delete();
  },

  /**
   * Bulk upsert links (insert or update)
   * Used for syncing from Y.Doc to IndexedDB
   */
  async bulkUpsert(links: Link[]): Promise<void> {
    if (links.length === 0) return;
    await db.links.bulkPut(links);
  },

  /**
   * Delete links not in the given list of IDs
   * Used for syncing deletions from Y.Doc to IndexedDB
   */
  async deleteNotIn(investigationId: InvestigationId, keepIds: LinkId[]): Promise<void> {
    const keepSet = new Set(keepIds);
    const allLinks = await db.links.where({ investigationId }).toArray();
    const toDelete = allLinks.filter(lk => !keepSet.has(lk.id)).map(lk => lk.id);

    if (toDelete.length > 0) {
      await db.links.where('id').anyOf(toDelete).delete();
    }
  },
};
