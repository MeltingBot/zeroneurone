import { db } from '../database';
import { generateUUID } from '../../utils';
import type { SavedQuery, SavedQueryId, DossierId } from '../../types';

function rehydrate(q: SavedQuery): SavedQuery {
  return {
    ...q,
    createdAt: new Date(q.createdAt),
    updatedAt: new Date(q.updatedAt),
  };
}

export const queryRepository = {
  async getByDossierId(dossierId: DossierId): Promise<SavedQuery[]> {
    const rows = await db.savedQueries.where('dossierId').equals(dossierId).toArray();
    return rows.map(rehydrate);
  },

  async getById(id: SavedQueryId): Promise<SavedQuery | undefined> {
    const row = await db.savedQueries.get(id);
    return row ? rehydrate(row) : undefined;
  },

  async create(
    dossierId: DossierId,
    data: Pick<SavedQuery, 'name' | 'description' | 'ast' | 'queryText' | 'defaultOutput' | 'tableColumns'>,
  ): Promise<SavedQuery> {
    const now = new Date();
    const query: SavedQuery = {
      id: generateUUID(),
      dossierId,
      name: data.name,
      description: data.description,
      ast: data.ast,
      queryText: data.queryText,
      defaultOutput: data.defaultOutput,
      tableColumns: data.tableColumns,
      createdAt: now,
      updatedAt: now,
    };
    await db.savedQueries.add(query);
    return query;
  },

  async update(id: SavedQueryId, changes: Partial<SavedQuery>): Promise<void> {
    await db.savedQueries.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  async delete(id: SavedQueryId): Promise<void> {
    await db.savedQueries.delete(id);
  },

  async deleteByDossierId(dossierId: DossierId): Promise<void> {
    await db.savedQueries.where('dossierId').equals(dossierId).delete();
  },
};
