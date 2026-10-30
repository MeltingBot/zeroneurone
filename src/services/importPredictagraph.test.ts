// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db/database';
import type { DossierId } from '../types';
import { importPredicaGraph } from './importPredictagraph';

const D = 'dossier-predicagraph' as DossierId;

describe('importPredicaGraph', () => {
  beforeEach(async () => {
    await db.elements.clear();
    await db.links.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps remote profile images as links without fetching them', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const content = JSON.stringify({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { type: 'person', label: 'Alice', pfp_image: 'https://tracker.example/a.png' } },
        { id: '2', position: { x: 10, y: 0 }, data: { type: 'person', label: 'Bob', pfp_image: [{ url: 'https://tracker.example/b.png' }] } },
      ],
      edges: [],
    });

    const result = await importPredicaGraph(content, D);
    vi.unstubAllGlobals();

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const elements = await db.elements.where('dossierId').equals(D).toArray();
    const urls = elements.map((el) => el.properties.find((p) => p.key === 'image_url')?.value).sort();
    expect(urls).toEqual(['https://tracker.example/a.png', 'https://tracker.example/b.png']);
    expect(elements.every((el) => el.assetIds.length === 0)).toBe(true);
  });
});
