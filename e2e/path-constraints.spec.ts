import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __znImport(path: string): Promise<any>;
  }
}

/**
 * Import an app module in the page as the app loaded it. A reused dev server
 * serves edited modules with a `?t=` suffix: importing the bare path would give
 * a second, empty store instead of the app's own.
 */
const exposeImporter = (page: Page) =>
  page.addInitScript(() => {
    window.__znImport = (path: string) => {
      const loaded = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => new URL(name).pathname === path);
      return import(/* @vite-ignore */ loaded.length > 0 ? loaded[loaded.length - 1] : path);
    };
  });

/*
 *   Alice — Bruno — David        appel: a-b, b-d (30 %), b-e (30 %), d-f
 *     |       |       |          virement: a-c, c-e, e-f
 *   Carla — Emma  —  Fred        confidence 90 % unless noted
 */
function dossierJson(): string {
  const now = new Date().toISOString();
  const names: Record<string, string> = { a: 'Alice', b: 'Bruno', c: 'Carla', d: 'David', e: 'Emma', f: 'Fred' };
  const pos: Record<string, [number, number]> = { a: [0, 0], b: [300, 0], d: [600, 0], c: [0, 250], e: [300, 250], f: [600, 250] };
  const elements = Object.keys(names).map((id) => ({
    id, label: names[id], notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: pos[id][0], y: pos[id][1] }, isPositionLocked: false,
    geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  }));
  const spec: [string, string, string, string, number][] = [
    ['ab', 'a', 'b', 'appel', 90], ['bd', 'b', 'd', 'appel', 30], ['be', 'b', 'e', 'appel', 30], ['df', 'd', 'f', 'appel', 90],
    ['ac', 'a', 'c', 'virement', 90], ['ce', 'c', 'e', 'virement', 90], ['ef', 'e', 'f', 'virement', 90],
  ];
  const links = spec.map(([id, fromId, toId, label, confidence]) => ({
    id, fromId, toId, label, notes: '', tags: [], properties: [], confidence, source: '', date: null, dateRange: null,
    direction: 'none', directed: false, visual: { color: '#9ca3af', style: 'solid', width: 1 }, createdAt: now, updatedAt: now,
  }));
  return JSON.stringify({ version: '1.0.0', elements, links });
}

// Import gives new ids: elements read by the initial of their label, links by their two ends
const pathState = (page: Page) =>
  page.evaluate(async () => {
    const { useInsightsStore } = await window.__znImport('/src/stores/insightsStore.ts');
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { elements, links } = useDossierStore.getState();
    const letter = (id: string) => (elements.find((e) => e.id === id)?.label ?? '?')[0].toLowerCase();
    const linkName = (id: string) => {
      const l = links.find((x) => x.id === id)!;
      return [letter(l.fromId), letter(l.toId)].sort().join('');
    };
    const s = useInsightsStore.getState();
    return {
      paths: s.pathResults.map((p) => p.path.map(letter).join('')),
      constrained: s.pathConstrained,
      blocked: s.pathBlockedByConstraints,
      flow: [...s.pathLinkFlow.keys()].map(linkName).sort(),
    };
  });

/** Search from Alice to Fred the way the canvas context menu does: no constraints */
const contextMenuSearch = (page: Page, all: boolean) =>
  page.evaluate(async (all) => {
    const { insightsService } = await window.__znImport('/src/services/insightsService.ts');
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { useInsightsStore } = await window.__znImport('/src/stores/insightsStore.ts');
    const { elements, links } = useDossierStore.getState();
    const id = (label: string) => elements.find((e) => e.label === label)!.id;
    insightsService.buildGraph(elements, links);
    const store = useInsightsStore.getState();
    if (all) store.findAllPaths(id('Alice'), id('Fred'));
    else store.findPaths(id('Alice'), id('Fred'));
  }, all);

test('path search narrowed by constraints, context menu search left unconstrained', async ({ page }) => {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const file = join(mkdtempSync(join(tmpdir(), 'zn-paths-')), 'paths.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return useDossierStore.getState().elements.length;
  })).toBe(6);

  // Open the Insights panel, then search as the context menu does (no constraints)
  await page.evaluate(async () => {
    const { useUIStore } = await window.__znImport('/src/stores/uiStore.ts');
    useUIStore.getState().setSidePanelTab('insights');
  });
  const constraints = page.locator('[data-testid="path-constraints"]');
  await contextMenuSearch(page, true);
  await expect(constraints).toBeVisible();
  let state = await pathState(page);
  // Shortest first; ties follow link order
  expect(state.paths.slice(0, 3).sort()).toEqual(['abdf', 'abef', 'acef']);
  expect(state.paths[3]).toBe('acebdf');
  expect(state.constrained).toBe(false);
  await expect(page.locator('[data-testid="path-constrained"]')).toHaveCount(0);

  // Minimum confidence 60 %: only the transfer route stays, its links alone glow
  await constraints.locator('button[aria-expanded]').click();
  await constraints.locator('input[type="range"]').fill('60');
  await expect.poll(async () => (await pathState(page)).paths).toEqual(['acef']);
  state = await pathState(page);
  expect(state.constrained).toBe(true);
  expect(state.flow).toEqual(['ac', 'ce', 'ef']);
  await expect(page.locator('[data-testid="path-constrained"]')).toBeVisible();
  // Undirected path: its links glow without moving dashes
  await expect(page.locator('.cycle-flow-line')).toHaveCount(0);
  if (process.env.ZN_SHOT) await page.screenshot({ path: process.env.ZN_SHOT });

  // Calls only, on top: no route left, and the panel says the constraints exclude it
  await constraints.getByRole('button', { name: 'appel', exact: true }).click();
  await expect.poll(async () => (await pathState(page)).blocked).toBe(true);
  expect((await pathState(page)).paths).toEqual([]);
  // The previous path does not stay lit
  expect(await page.evaluate(async () => {
    const { useInsightsStore } = await window.__znImport('/src/stores/insightsStore.ts');
    const s = useInsightsStore.getState();
    return { lit: s.highlightedElementIds.size, type: s.highlightType };
  })).toEqual({ lit: 0, type: null });

  // Kept for the dossier
  const kept = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const id = useDossierStore.getState().currentDossier!.id;
    return JSON.parse(localStorage.getItem(`zn-path-constraints:${id}`) ?? 'null');
  });
  expect(kept).toMatchObject({ minConfidence: 60, labels: { mode: 'include', values: ['appel'] } });

  // A context-menu search still ignores them
  await contextMenuSearch(page, false);
  state = await pathState(page);
  expect(state.paths).toHaveLength(1);
  expect(state.constrained).toBe(false);
});
