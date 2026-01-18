import { db } from '../database';
import { generateUUID } from '../../utils';
import { DEFAULT_TAG_SETS } from '../../data/defaultTagSets';
import type { TagSet, TagSetId } from '../../types';

/**
 * Rehydrate TagSet dates (IndexedDB stores as strings)
 */
function rehydrateTagSet(tagSet: TagSet): TagSet {
  return {
    ...tagSet,
    createdAt: new Date(tagSet.createdAt),
    updatedAt: new Date(tagSet.updatedAt),
  };
}

export const tagSetRepository = {
  /**
   * Get all TagSets
   */
  async getAll(): Promise<TagSet[]> {
    const tagSets = await db.tagSets.toArray();
    return tagSets.map(rehydrateTagSet);
  },

  /**
   * Get a TagSet by ID
   */
  async getById(id: TagSetId): Promise<TagSet | undefined> {
    const tagSet = await db.tagSets.get(id);
    return tagSet ? rehydrateTagSet(tagSet) : undefined;
  },

  /**
   * Get a TagSet by name (case-insensitive)
   */
  async getByName(name: string): Promise<TagSet | undefined> {
    const normalized = name.toLowerCase().trim();
    const tagSets = await db.tagSets.toArray();
    const found = tagSets.find(t => t.name.toLowerCase() === normalized);
    return found ? rehydrateTagSet(found) : undefined;
  },

  /**
   * Create a new TagSet
   */
  async create(
    data: Omit<TagSet, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TagSet> {
    const now = new Date();
    const tagSet: TagSet = {
      ...data,
      id: generateUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await db.tagSets.add(tagSet);
    return tagSet;
  },

  /**
   * Update an existing TagSet
   */
  async update(
    id: TagSetId,
    changes: Partial<Omit<TagSet, 'id' | 'createdAt'>>
  ): Promise<void> {
    await db.tagSets.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  /**
   * Delete a TagSet
   */
  async delete(id: TagSetId): Promise<void> {
    await db.tagSets.delete(id);
  },

  /**
   * Reset to default TagSets
   * This clears all existing TagSets and restores the built-in ones
   */
  async resetToDefaults(): Promise<void> {
    await db.tagSets.clear();
    // Generate fresh IDs and timestamps for each default TagSet
    const now = new Date();
    const tagSets = DEFAULT_TAG_SETS.map(tagSet => ({
      ...tagSet,
      id: generateUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    await db.tagSets.bulkAdd(tagSets);
  },

  /**
   * Initialize TagSets if empty
   * Called on app startup to populate defaults on first launch
   */
  async initializeIfEmpty(): Promise<boolean> {
    const count = await db.tagSets.count();
    if (count === 0) {
      await this.resetToDefaults();
      return true;
    }
    return false;
  },

  /**
   * Check if a tag name already exists
   */
  async nameExists(name: string, excludeId?: TagSetId): Promise<boolean> {
    const normalized = name.toLowerCase().trim();
    const tagSets = await db.tagSets.toArray();
    return tagSets.some(
      t => t.name.toLowerCase() === normalized && t.id !== excludeId
    );
  },
};
