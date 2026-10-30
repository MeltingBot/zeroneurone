import MiniSearch from 'minisearch';
import type { Asset, Comment, Element, Link, SearchDocument, SearchResult, Property } from '../types';
import { getCountryByCode, getCountryName } from '../data/countries';

class SearchService {
  private index: MiniSearch<SearchDocument>;
  private currentDossierId: string | null = null;

  constructor() {
    this.index = this.createIndex();
  }

  private createIndex(): MiniSearch<SearchDocument> {
    return new MiniSearch<SearchDocument>({
      fields: ['label', 'notes', 'tags', 'properties', 'extractedText', 'comments'],
      storeFields: ['id', 'type', 'label', 'dossierId'],
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
  // Map element/link id → concatenated content of its comments
  private commentTextMap = new Map<string, string>();
  // What each indexed document was built from: an unchanged one is not
  // re-indexed (a move or a layout re-syncs every element, but changes none
  // of the indexed text). Same object and asset text → skipped outright;
  // otherwise the document content is compared.
  private indexedFrom = new Map<string, { source: Element | Link; assetText: string; commentText: string; content: string }>();

  /**
   * Load and index all elements and links for a dossier (full rebuild).
   * Use syncIncremental() for subsequent updates.
   */
  loadDossier(
    dossierId: string,
    elements: Element[],
    links: Link[],
    assets: Asset[] = [],
    comments: Comment[] = [],
  ): void {
    // Reset if different dossier
    if (this.currentDossierId !== dossierId) {
      this.index = this.createIndex();
      this.indexedIds.clear();
      this.indexedFrom.clear();
      this.currentDossierId = dossierId;
    }

    this.buildAssetTextMap(elements, assets);
    this.buildCommentTextMap(comments);

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
  syncIncremental(elements: Element[], links: Link[], assets: Asset[] = [], comments: Comment[] = []): void {
    this.buildAssetTextMap(elements, assets);
    this.buildCommentTextMap(comments);
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
        this.indexedFrom.delete(id);
      }
    }

    this.indexedIds = currentIds;
  }

  /**
   * Index or re-index a single element
   */
  indexElement(element: Element): void {
    const assetText = this.assetTextMap.get(element.id) || '';
    const commentText = this.commentTextMap.get(element.id) || '';
    const previous = this.indexedFrom.get(element.id);
    if (previous && previous.source === element && previous.assetText === assetText && previous.commentText === commentText) return;
    this.indexDocument(this.elementToDocument(element), element, assetText, commentText);
  }

  /**
   * Index or re-index a single link
   */
  indexLink(link: Link): void {
    const commentText = this.commentTextMap.get(link.id) || '';
    const previous = this.indexedFrom.get(link.id);
    if (previous && previous.source === link && previous.commentText === commentText) return;
    this.indexDocument(this.linkToDocument(link), link, '', commentText);
  }

  /** (Re-)index a document, unless its content is what is already indexed. */
  private indexDocument(doc: SearchDocument, source: Element | Link, assetText: string, commentText: string): void {
    const content = JSON.stringify(doc);
    const previous = this.indexedFrom.get(doc.id);
    if (previous?.content === content) {
      this.indexedFrom.set(doc.id, { source, assetText, commentText, content });
      return;
    }
    if (previous || this.index.has(doc.id)) {
      try {
        this.index.discard(doc.id);
      } catch {
        // Document didn't exist, that's fine
      }
    }
    this.index.add(doc);
    this.indexedFrom.set(doc.id, { source, assetText, commentText, content });
  }

  /**
   * Search the index
   */
  search(query: string, limit = 20, mode: 'fuzzy' | 'exact' = 'fuzzy'): SearchResult[] {
    if (!query.trim()) {
      return [];
    }

    // Exact: no typo, every word required; only the word being typed (the
    // last one) may be a prefix, so results show up while typing
    const results = mode === 'exact'
      ? this.index.search(query, {
          fuzzy: false,
          prefix: (_term: string, i: number, terms: string[]) => i === terms.length - 1,
          combineWith: 'AND',
        })
      : this.index.search(query);

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
    this.indexedIds.clear();
    this.indexedFrom.clear();
    this.currentDossierId = null;
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

  private buildCommentTextMap(comments: Comment[]): void {
    this.commentTextMap.clear();
    for (const comment of comments) {
      if (!comment.content) continue;
      const previous = this.commentTextMap.get(comment.targetId);
      this.commentTextMap.set(comment.targetId, previous ? `${previous} ${comment.content}` : comment.content);
    }
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
      dossierId: element.dossierId,
      label: element.label,
      notes: element.notes,
      tags: element.tags.join(' '),
      properties: element.properties
        .map((p) => this.formatPropertyForIndex(p))
        .join(' '),
      extractedText: this.assetTextMap.get(element.id) || '',
      comments: this.commentTextMap.get(element.id) || '',
    };
  }

  private linkToDocument(link: Link): SearchDocument {
    return {
      id: link.id,
      type: 'link',
      dossierId: link.dossierId,
      label: link.label,
      notes: link.notes,
      tags: link.tags?.join(' ') ?? '',
      properties: link.properties
        .map((p) => this.formatPropertyForIndex(p))
        .join(' '),
      extractedText: '',
      comments: this.commentTextMap.get(link.id) || '',
    };
  }
}

export const searchService = new SearchService();
