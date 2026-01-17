import MiniSearch from 'minisearch';
import type { Element, Link, SearchDocument, SearchResult } from '../types';

class SearchService {
  private index: MiniSearch<SearchDocument>;
  private currentInvestigationId: string | null = null;

  constructor() {
    this.index = this.createIndex();
  }

  private createIndex(): MiniSearch<SearchDocument> {
    return new MiniSearch<SearchDocument>({
      fields: ['label', 'notes', 'tags', 'properties', 'extractedText'],
      storeFields: ['id', 'type', 'label', 'investigationId'],
      searchOptions: {
        boost: { label: 3, tags: 2, notes: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  /**
   * Load and index all elements and links for an investigation
   */
  loadInvestigation(
    investigationId: string,
    elements: Element[],
    links: Link[]
  ): void {
    // Reset if different investigation
    if (this.currentInvestigationId !== investigationId) {
      this.index = this.createIndex();
      this.currentInvestigationId = investigationId;
    }

    // Index elements
    for (const element of elements) {
      this.indexElement(element);
    }

    // Index links
    for (const link of links) {
      this.indexLink(link);
    }
  }

  /**
   * Index or re-index a single element
   */
  indexElement(element: Element): void {
    const doc = this.elementToDocument(element);

    // Remove existing if present
    try {
      this.index.discard(doc.id);
    } catch {
      // Document didn't exist, that's fine
    }

    this.index.add(doc);
  }

  /**
   * Index or re-index a single link
   */
  indexLink(link: Link): void {
    const doc = this.linkToDocument(link);

    // Remove existing if present
    try {
      this.index.discard(doc.id);
    } catch {
      // Document didn't exist, that's fine
    }

    this.index.add(doc);
  }

  /**
   * Remove an element from the index
   */
  removeElement(elementId: string): void {
    try {
      this.index.discard(elementId);
    } catch {
      // Document didn't exist
    }
  }

  /**
   * Remove a link from the index
   */
  removeLink(linkId: string): void {
    try {
      this.index.discard(linkId);
    } catch {
      // Document didn't exist
    }
  }

  /**
   * Search the index
   */
  search(query: string, limit = 20): SearchResult[] {
    if (!query.trim()) {
      return [];
    }

    const results = this.index.search(query);

    return results.slice(0, limit).map((result) => ({
      id: result.id,
      type: result.type as 'element' | 'link',
      score: result.score,
      matches: result.match,
    }));
  }

  /**
   * Get suggestions based on partial query
   */
  suggest(query: string, limit = 5): string[] {
    if (!query.trim()) {
      return [];
    }

    return this.index.autoSuggest(query).slice(0, limit).map((s) => s.suggestion);
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.index = this.createIndex();
    this.currentInvestigationId = null;
  }

  private elementToDocument(element: Element): SearchDocument {
    return {
      id: element.id,
      type: 'element',
      investigationId: element.investigationId,
      label: element.label,
      notes: element.notes,
      tags: element.tags.join(' '),
      properties: element.properties
        .map((p) => `${p.key} ${String(p.value ?? '')}`)
        .join(' '),
      extractedText: '', // Will be filled from assets later
    };
  }

  private linkToDocument(link: Link): SearchDocument {
    return {
      id: link.id,
      type: 'link',
      investigationId: link.investigationId,
      label: link.label,
      notes: link.notes,
      tags: '', // Links don't have tags
      properties: link.properties
        .map((p) => `${p.key} ${String(p.value ?? '')}`)
        .join(' '),
      extractedText: '',
    };
  }
}

export const searchService = new SearchService();
