/**
 * Benchmark of the graph compute paths, on synthetic dossiers.
 *
 * Not part of the default suite: at 10 000 elements the naive main-thread
 * implementations take minutes. Run it explicitly:
 *
 *   npm run bench
 *
 * The point is to make "ZeroNeurone handles heavy graphs" a measured claim
 * rather than an impression. Numbers are printed as a table; record them in
 * docs/performance-graphes-lourds.md when they move.
 */
import { it, vi } from 'vitest';
import Graph from 'graphology';
import type { Element, Link } from '../../types';

vi.mock('../fileService', () => ({
  fileService: { getAssetsByDossier: vi.fn(), getFileBlob: vi.fn() },
}));
vi.mock('i18next', () => ({ default: { t: (k: string) => k, language: 'fr' } }));

const SIZES = [1000, 5000, 10000];
/** Links per element — an investigation graph is sparse, not dense. */
const LINK_RATIO = 1.5;

const FIRST = ['Jean', 'Marie', 'Pierre', 'Sophie', 'Luc', 'Anne', 'Marc', 'Julie'];
const LAST = ['Dupont', 'Martin', 'Bernard', 'Petit', 'Durand', 'Moreau'];

export function makeDossier(n: number): { elements: Element[]; links: Link[] } {
  const elements: Element[] = [];
  for (let i = 0; i < n; i++) {
    elements.push({
      id: `el-${i}`,
      dossierId: 'bench',
      // Deliberately near-duplicate labels: similar-label detection is one of
      // the paths being measured.
      label: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${i}`,
      notes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3),
      tags: [`tag-${i % 20}`],
      properties: [
        { key: 'ville', value: `Ville ${i % 50}`, type: 'text' },
        { key: 'age', value: 20 + (i % 60), type: 'number' },
      ],
      confidence: null, source: `source-${i % 30}`, date: null, dateRange: null,
      position: { x: (i % 100) * 150, y: Math.floor(i / 100) * 120 },
      isPositionLocked: false, geo: null, events: [], assetIds: [],
      parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
      visual: { color: '#fff', borderColor: '#eee', shape: 'rectangle', size: 'medium', icon: null, image: null },
      createdAt: new Date(), updatedAt: new Date(),
    } as unknown as Element);
  }

  const links: Link[] = [];
  for (let i = 0; i < Math.floor(n * LINK_RATIO); i++) {
    links.push({
      id: `lk-${i}`, dossierId: 'bench',
      fromId: `el-${i % n}`, toId: `el-${(i * 7 + 3) % n}`,
      label: '', notes: '', tags: [], properties: [], confidence: null, source: '',
      date: null, dateRange: null, direction: 'forward', directed: true,
      visual: { color: '#999', style: 'solid', width: 1 },
      createdAt: new Date(), updatedAt: new Date(),
    } as unknown as Link);
  }
  return { elements, links };
}

/** Build the same undirected graph the worker builds, without the worker. */
export function makeGraph(n: number): Graph {
  const g = new Graph({ type: 'undirected', multi: false });
  for (let i = 0; i < n; i++) g.addNode(`el-${i}`);
  for (let i = 0; i < Math.floor(n * LINK_RATIO); i++) {
    const a = `el-${i % n}`;
    const b = `el-${(i * 7 + 3) % n}`;
    if (a !== b && !g.hasEdge(a, b)) g.addEdge(a, b);
  }
  return g;
}

function ms(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return Math.round(performance.now() - t0);
}

it('graph compute paths', async () => {
  const { insightsService } = await import('../insightsService');
  const { searchService } = await import('../searchService');
  const { getDimmedElementIds } = await import('../../utils/filterUtils');
  const { DEFAULT_FILTERS } = await import('../../types');

  const table: Record<string, number>[] = [];

  for (const n of SIZES) {
    const { elements, links } = makeDossier(n);
    const row: Record<string, number> = { elements: n };

    row.buildGraph = ms(() => insightsService.buildGraph(elements, links));
    row.clusters = ms(() => insightsService.getClusters());
    row.centrality = ms(() => insightsService.getCentrality());
    row.bridges = ms(() => insightsService.getBridges());
    row.similarLabels = ms(() => insightsService.detectSimilarLabels());
    row.searchIndex = ms(() => searchService.loadDossier('bench', elements, links, []));
    row.searchReindex = ms(() => searchService.syncIncremental(elements, links, []));
    row.filters = ms(() =>
      getDimmedElementIds(elements, { ...DEFAULT_FILTERS, textSearch: 'Martin' }, new Set())
    );

    table.push(row);
  }

  console.table(table);
  // Also written to disk: console output is easily swallowed by wrappers, and
  // these numbers are the point of the exercise.
  const fs = await import('node:fs');
  fs.writeFileSync('bench-results.json', JSON.stringify(table, null, 2));
}, 30 * 60 * 1000);
