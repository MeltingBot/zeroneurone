import MiniSearch from 'minisearch';
import type { Asset, Element, Link, SearchDocument, SearchResult, Property } from '../types';
import { getCountryByCode, getCountryName } from '../data/countries';

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

  // Track indexed document IDs for incremental updates
  private indexedIds = new Set<string>();
  // Map elementId → concatenated extractedText from its assets
  private assetTextMap = new Map<string, string>();

  /**
   * Load and index all elements and links for an investigation (full rebuild).
   * Use syncIncremental() for subsequent updates.
   */
  loadInvestigation(
    investigationId: string,
    elements: Element[],
    links: Link[],
    assets: Asset[] = []
  ): void {
    // Reset if different investigation
    if (this.currentInvestigationId !== investigationId) {
      this.index = this.createIndex();
      this.indexedIds.clear();
      this.currentInvestigationId = investigationId;
    }

    this.buildAssetTextMap(elements, assets);

    // Index elements
    for (const element of elements) {
      this.indexElement(element);
      this.indexedIds.add(element.id);
    }

    // Index links
    for (const link of links) {
      this.indexLink(link);
      this.indexedIds.add(link.id);
    }
  }

  /**
   * Incrementally sync the search index with the current elements/links.
   * Detects adds, removes, and updates.
   */
  syncIncremental(elements: Element[], links: Link[], assets: Asset[] = []): void {
    this.buildAssetTextMap(elements, assets);
    const currentIds = new Set<string>();

    // Process elements: add/update
    for (const element of elements) {
      currentIds.add(element.id);
      // Always re-index (MiniSearch handles discard internally)
      this.indexElement(element);
    }

    // Process links: add/update
    for (const link of links) {
      currentIds.add(link.id);
      this.indexLink(link);
    }

    // Remove documents no longer present
    for (const id of this.indexedIds) {
      if (!currentIds.has(id)) {
        try { this.index.discard(id); } catch { /* already gone */ }
      }
    }

    this.indexedIds = currentIds;
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

  /**
   * Format a property for indexing, including country names for country-type properties
   */
  private formatPropertyForIndex(p: Property): string {
    const value = String(p.value ?? '');
    // If it's a country property, also add the country name
    if (p.type === 'country' && value) {
      const country = getCountryByCode(value);
      if (country) {
        // Index with country name in French (fallback) for search
        return `${p.key} ${value} ${getCountryName(country.code, 'fr')}`;
      }
    }
    return `${p.key} ${value}`;
  }

  private buildAssetTextMap(elements: Element[], assets: Asset[]): void {
    this.assetTextMap.clear();
    if (assets.length === 0) return;
    const assetById = new Map(assets.map((a) => [a.id, a]));
    for (const element of elements) {
      if (!element.assetIds?.length) continue;
      const texts: string[] = [];
      for (const assetId of element.assetIds) {
        const asset = assetById.get(assetId);
        if (asset?.extractedText) texts.push(asset.extractedText);
      }
      if (texts.length > 0) this.assetTextMap.set(element.id, texts.join(' '));
    }
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
        .map((p) => this.formatPropertyForIndex(p))
        .join(' '),
      extractedText: this.assetTextMap.get(element.id) || ''
    };
  }

  private linkToDocument(link: Link): SearchDocument {
    return {
      id: link.id,
      type: 'link',
      investigationId: link.investigationId,
      label: link.label,
      notes: link.notes,
      tags: link.tags?.join(' ') ?? '',
      properties: link.properties
        .map((p) => this.formatPropertyForIndex(p))
        .join(' '),
      extractedText: '',
    };
  }
}

export const searchService = new SearchService();
