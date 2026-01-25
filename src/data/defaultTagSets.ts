import { generateUUID } from '../utils';
import type { TagSet, SuggestedProperty, ElementShape } from '../types';
import defaultTagSetsJson from './defaultTagSets.json';

/**
 * Raw TagSet data from JSON (without runtime fields)
 */
interface RawTagSet {
  name: string;
  description: string;
  defaultVisual: {
    color: string | null;
    shape: ElementShape | null;
    icon: string | null;
  };
  suggestedProperties: SuggestedProperty[];
}

/**
 * Convert raw JSON data to full TagSet objects with generated IDs and timestamps
 */
function createTagSetsFromJson(rawData: RawTagSet[]): TagSet[] {
  return rawData.map((data) => ({
    ...data,
    id: generateUUID(),
    isBuiltIn: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/**
 * Default built-in TagSets
 * Loaded from defaultTagSets.json, with runtime fields added
 */
export const DEFAULT_TAG_SETS: TagSet[] = createTagSetsFromJson(defaultTagSetsJson as RawTagSet[]);
