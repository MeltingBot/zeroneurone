import { db } from '../db/database';
import type { Element, ElementId, Link } from '../types';

/**
 * Elements and links built by an import, kept in memory and written in one
 * transaction at the end: an import that fails halfway leaves nothing behind.
 */
export class ImportedRows {
  private elements = new Map<ElementId, Element>();
  private links: Link[] = [];

  addElement(element: Element): void {
    this.elements.set(element.id, element);
  }

  addLink(link: Link): void {
    this.links.push(link);
  }

  /** An element added earlier in this import */
  element(id: ElementId): Element | undefined {
    return this.elements.get(id);
  }

  async write(): Promise<void> {
    await db.transaction('rw', db.elements, db.links, async () => {
      await db.elements.bulkAdd([...this.elements.values()]);
      await db.links.bulkAdd(this.links);
    });
  }
}
