/**
 * Search of the companion: the desktop's MiniSearch index (searchService),
 * fed from the Y.Doc, plus what a phone needs to read a result at a glance —
 * where the match is, as a short excerpt around the matched word.
 */

import { useEffect, useMemo } from 'react';
import type { Asset, Comment, Element, Link } from '../types';
import { searchService } from '../services/searchService';
import type { AssetEntry, CompanionData } from './useCompanionSession';

export interface CompanionHit {
  /** Element to open (for a link: its source element) */
  elementId: string;
  /** Element label, or "A — B" for a link */
  title: string;
  isLink: boolean;
  excerpt: Excerpt | null;
  /** Found through one of the element's events: that event */
  eventId?: string;
}

export interface Excerpt {
  before: string;
  match: string;
  after: string;
}

const EXCERPT_CONTEXT = 32;
/** Fields shown as an excerpt, in order of preference (the label is the title already) */
const EXCERPT_FIELDS = ['notes', 'properties', 'tags', 'events', 'comments', 'extractedText'] as const;

function toAssets(entries: Map<string, AssetEntry>): Asset[] {
  return [...entries.values()].map((a) => ({ ...a, opfsPath: '' }));
}

/** Keeps the index in step with the dossier; cleared when the dossier closes */
export function useSearchIndex(data: CompanionData): void {
  useEffect(() => {
    searchService.syncIncremental(data.elements, data.links, toAssets(data.assets), data.comments);
  }, [data]);
  useEffect(() => () => searchService.clear(), []);
}

function fieldText(field: string, target: Element | Link, comments: Comment[], assets: Map<string, AssetEntry>): string {
  switch (field) {
    case 'notes': return stripMarkdown(target.notes ?? '');
    case 'tags': return (target.tags ?? []).join(' · ');
    case 'properties': return target.properties.map((p) => `${p.key} : ${String(p.value ?? '')}`).join(' · ');
    case 'comments': return comments.filter((c) => c.targetId === target.id).map((c) => c.content).join(' · ');
    case 'events':
      return 'events' in target
        ? (target.events ?? []).map((e) => [e.label, e.description, e.source].filter(Boolean).join(' — ')).join(' · ')
        : '';
    case 'extractedText':
      return 'assetIds' in target
        ? target.assetIds.map((id) => assets.get(id)?.extractedText ?? '').filter(Boolean).join(' · ')
        : '';
    default: return '';
  }
}

/** Notes as read, without Markdown markers: links keep their text */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '');
}

/** A few words around the first occurrence of `term` (case-insensitive) */
export function excerptAround(text: string, term: string): Excerpt | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - EXCERPT_CONTEXT);
  const end = Math.min(flat.length, at + term.length + EXCERPT_CONTEXT);
  return {
    before: `${start > 0 ? '…' : ''}${flat.slice(start, at)}`,
    match: flat.slice(at, at + term.length),
    after: `${flat.slice(at + term.length, end)}${end < flat.length ? '…' : ''}`,
  };
}

export function useCompanionSearch(data: CompanionData, query: string, untitled: string): CompanionHit[] | null {
  const elements = useMemo(() => new Map(data.elements.map((e) => [e.id, e])), [data.elements]);
  const links = useMemo(() => new Map(data.links.map((l) => [l.id, l])), [data.links]);

  return useMemo(() => {
    if (!query.trim()) return null;
    const hits: CompanionHit[] = [];
    for (const result of searchService.search(query, 60)) {
      const element = result.type === 'element' ? elements.get(result.id) : undefined;
      const link = result.type === 'link' ? links.get(result.id) : undefined;
      const target = element ?? link;
      if (!target || (element?.isAnnotation)) continue;

      let excerpt: Excerpt | null = null;
      let eventId: string | undefined;
      const labelMatched = Object.values(result.matches).some((fields) => fields.includes('label'));
      if (!labelMatched) {
        for (const field of EXCERPT_FIELDS) {
          const term = Object.entries(result.matches).find(([, fields]) => fields.includes(field))?.[0];
          if (!term) continue;
          excerpt = excerptAround(fieldText(field, target, data.comments, data.assets), term);
          if (excerpt && field === 'events' && element) {
            const lower = term.toLowerCase();
            eventId = element.events?.find((e) =>
              [e.label, e.description, e.source].some((f) => f?.toLowerCase().includes(lower)))?.id;
          }
          if (excerpt) break;
        }
      }

      if (element) {
        hits.push({ elementId: element.id, title: element.label || untitled, isLink: false, excerpt, eventId });
      } else if (link) {
        const from = elements.get(link.fromId);
        const to = elements.get(link.toId);
        if (!from) continue;
        const ends = `${from.label || untitled} — ${to?.label || untitled}`;
        hits.push({
          elementId: from.id,
          title: link.label ? `${link.label} (${ends})` : ends,
          isLink: true,
          excerpt,
        });
      }
    }
    return hits;
    // data identity changes on every Y.Doc update: the index is synced then
  }, [query, data, elements, links, untitled]);
}
