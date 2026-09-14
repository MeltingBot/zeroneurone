import { db } from '../database';
import { generateUUID } from '../../utils';
import type { CustomIcon, CustomIconId } from '../../types';

/**
 * Rehydrate CustomIcon dates (IndexedDB stores as strings)
 */
function rehydrateCustomIcon(icon: CustomIcon): CustomIcon {
  return {
    ...icon,
    createdAt: new Date(icon.createdAt),
  };
}

export const customIconRepository = {
  /**
   * Get all custom icons
   */
  async getAll(): Promise<CustomIcon[]> {
    const icons = await db.customIcons.toArray();
    return icons.map(rehydrateCustomIcon);
  },

  /**
   * Get a custom icon by ID
   */
  async getById(id: CustomIconId): Promise<CustomIcon | undefined> {
    const icon = await db.customIcons.get(id);
    return icon ? rehydrateCustomIcon(icon) : undefined;
  },

  /**
   * Find an icon with identical SVG content (dedup on import)
   */
  async findBySvg(svg: string): Promise<CustomIcon | undefined> {
    const icons = await db.customIcons.toArray();
    const found = icons.find(i => i.svg === svg);
    return found ? rehydrateCustomIcon(found) : undefined;
  },

  /**
   * Create a new custom icon. The SVG must already be sanitized.
   * Returns the existing icon if identical SVG content is already stored.
   */
  async create(name: string, svg: string): Promise<CustomIcon> {
    const existing = await this.findBySvg(svg);
    if (existing) return existing;

    const icon: CustomIcon = {
      id: generateUUID(),
      name,
      svg,
      createdAt: new Date(),
    };
    await db.customIcons.add(icon);
    return icon;
  },

  /**
   * Delete a custom icon
   */
  async delete(id: CustomIconId): Promise<void> {
    await db.customIcons.delete(id);
  },
};
