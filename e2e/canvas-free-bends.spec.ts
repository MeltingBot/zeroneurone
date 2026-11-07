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
 * Imports a module as the app loaded it: a dev server that reloaded edited modules serves them
 * under ?t=, and a plain import would give a second, empty store.
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

/** Two nodes, the second lower right, one link from the right side of A to the left side of B. */
function twoNodeDossier(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, y: number) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y }, isPositionLocked: false, geo: null, events: [], assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [element('a', 'Alpha', 0, 0), element('b', 'Bravo', 500, 200)],
    links: [{
      id: 'lk', fromId: 'a', toId: 'b', sourceHandle: 'source-right', targetHandle: 'target-left',
      label: '', notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
      direction: 'forward', directed: true, visual: { color: '#9ca3af', style: 'solid', width: 1 },
      createdAt: now, updatedAt: now,
    }],
  });
}


/** The import gives new ids: the link as stored. */
let linkId = '';

/** Corners of the link as drawn: the points of its path. */
const pathPoints = (page: Page) =>
  page.locator(`path[id="${linkId}"]`).getAttribute('d').then((d) =>
    [...(d ?? '').matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) })));

/** The link as stored */
const storedLink = (page: Page) => page.evaluate(async (id) => {
  const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
  const link = useDossierStore.getState().links.find((l) => l.id === id)!;
  return { bends: link.bendPoints ?? null, anchorMode: link.anchorMode ?? null };
}, linkId);

/** Clicks the link on the middle of its segment `index` (screen position from the viewport). */
async function clickLink(page: Page, index = 1, button: 'left' | 'right' = 'left') {
  const points = await pathPoints(page);
  const { x: vx, y: vy, zoom } = await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    return useViewStore.getState().viewport;
  });
  const canvas = (await page.locator('.react-flow').boundingBox())!;
  const mid = { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 };
  await page.mouse.click(canvas.x + mid.x * zoom + vx, canvas.y + mid.y * zoom + vy, { button });
}

/** Drags a handle by (dx, dy) screen pixels. */
async function dragHandle(page: Page, selector: string, dx: number, dy: number) {
  const box = (await page.locator(selector).last().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('straight links take bend points at free angles: add, move, snap, remove, undo, reset', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'free.json');
  writeFileSync(file, twoNodeDossier());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');

  linkId = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setLinkCurveMode('straight');
    await useDossierStore.getState().setLinkAnchorMode('auto');
    return useDossierStore.getState().links[0].id;
  });
  await page.waitForTimeout(300);
  await clickLink(page, 0);
  // One segment: one handle to add a point, no bend point yet
  await expect(page.locator('[data-bend-add]')).toHaveCount(1);
  await expect(page.locator('[data-bend]')).toHaveCount(0);

  // Dragging the middle handle adds a bend point there: a free angle, ends pinned
  await dragHandle(page, '[data-bend-add="0"] circle', 0, 120);
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(1);
  expect((await storedLink(page)).anchorMode).toBe('manual');
  await expect.poll(async () => (await pathPoints(page)).length).toBe(3);
  const bent = await pathPoints(page);
  expect(bent[1].x !== bent[0].x && bent[1].y !== bent[0].y).toBe(true);

  // Moved close to plumb with the source: snapped exactly under it
  const zoom = await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    return useViewStore.getState().viewport.zoom;
  });
  await dragHandle(page, '[data-bend="0"] rect', (bent[0].x - bent[1].x) * zoom + 3, 0);
  await expect.poll(async () => { const p = await pathPoints(page); return p[1].x === p[0].x; }).toBe(true);

  // A second point on the second segment
  await dragHandle(page, '[data-bend-add="1"] circle', 40, -40);
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(2);

  // Double-click removes a point; undo brings it back
  await page.locator('[data-bend="0"] rect').dblclick();
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(1);
  await expect(page.locator('.react-flow__edges foreignObject input')).toHaveCount(0);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(2);

  // A node moved alone: the bend points stay; both moved together: they follow
  const placed = (await storedLink(page)).bends!;
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    const bravo = s.elements.find((e) => e.label === 'Bravo')!;
    await s.updateElementPositions([{ id: bravo.id, position: { x: bravo.position.x + 60, y: bravo.position.y } }]);
  });
  await expect.poll(async () => (await pathPoints(page)).at(-1)!.x).toBeGreaterThan(bent.at(-1)!.x + 30);
  expect((await storedLink(page)).bends).toEqual(placed);
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    await s.updateElementPositions(s.elements.map((e) => ({ id: e.id, position: { x: e.position.x - 20, y: e.position.y + 10 } })));
  });
  await expect.poll(async () => (await storedLink(page)).bends)
    .toEqual(placed.map((p) => ({ x: p.x - 20, y: p.y + 10 })));

  // Kept after a reload
  const kept = (await storedLink(page)).bends;
  await page.reload();
  await page.waitForSelector(`path[id="${linkId}"]`);
  await expect.poll(async () => (await storedLink(page)).bends).toEqual(kept);
  await expect.poll(async () => (await pathPoints(page)).length).toBe(4);

  // The last point removed: a straight line, ends still pinned; undone
  await clickLink(page, 1);
  await page.locator('[data-bend="1"] rect').dblclick();
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(1);
  await page.locator('[data-bend="0"] rect').dblclick();
  await expect.poll(() => storedLink(page)).toEqual({ bends: null, anchorMode: 'manual' });
  await expect(page.locator('[data-bend]')).toHaveCount(0);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(2);
  await expect.poll(async () => (await pathPoints(page)).length).toBe(4);

  // Reset from the context menu: a straight line again
  await clickLink(page, 1, 'right');
  await page.getByRole('menuitem', { name: 'Reset route' }).click();
  await expect.poll(async () => (await storedLink(page)).bends).toBeNull();
  await expect.poll(async () => (await pathPoints(page)).length).toBe(2);
});

test('parallel straight links show no bend points until one is added, then keep their lane shape', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  // Two links between the same nodes: drawn apart in lanes
  const data = JSON.parse(twoNodeDossier());
  data.links.push({ ...data.links[0], id: 'lk2' });
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'parallel.json');
  writeFileSync(file, JSON.stringify(data));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  linkId = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setLinkCurveMode('straight');
    return useDossierStore.getState().links[0].id;
  });
  await page.waitForTimeout(300);
  const lane = await pathPoints(page);
  expect(lane).toHaveLength(4);
  await clickLink(page, 1);
  // Round handles on the three lane segments, no square bend point
  await expect(page.locator('[data-bend-add]')).toHaveCount(3);
  await expect(page.locator('[data-bend]')).toHaveCount(0);

  // A point added on the middle segment: the lane corners become bend points, nothing jumps
  await dragHandle(page, '[data-bend-add="1"] circle', 0, 80);
  await expect.poll(async () => (await storedLink(page)).bends?.length).toBe(3);
  const after = await pathPoints(page);
  for (const [a, b] of [[after[1], lane[1]], [after[3], lane[2]]]) {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  }
});

test('Arrange clears the routes it breaks, undone with it; the selection menu resets routes', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'arrange.json');
  writeFileSync(file, twoNodeDossier());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  // A bend point drawn on the link (straight mode)
  linkId = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    await s.setLinkCurveMode('straight');
    await s.updateLink(s.links[0].id, { bendPoints: [{ x: 250, y: 300 }] });
    return s.links[0].id;
  });
  await expect.poll(async () => (await pathPoints(page)).length).toBe(3);

  // Arrange moves the two ends apart: the bend point goes, the link is straight again
  await page.getByTitle('Automatic graph rearrangement').click();
  await page.getByText('Grid', { exact: true }).click();
  await expect.poll(async () => (await storedLink(page)).bends).toBeNull();
  await expect.poll(async () => (await pathPoints(page)).length).toBe(2);
  // One undo: elements back in place and the bend point back
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).bends).toEqual([{ x: 250, y: 300 }]);
  await expect.poll(async () => (await pathPoints(page)).length).toBe(3);

  // Everything selected, right-click: Reset routes, then undone
  await page.keyboard.press('Control+a');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 }, button: 'right' });
  await page.getByRole('menuitem', { name: 'Reset routes' }).click();
  await expect.poll(async () => (await storedLink(page)).bends).toBeNull();
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).bends).toEqual([{ x: 250, y: 300 }]);
});

test('copied links take their bend points along with the copied elements', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'copy.json');
  writeFileSync(file, twoNodeDossier());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    await s.setLinkCurveMode('straight');
    await s.updateLink(s.links[0].id, { bendPoints: [{ x: 250, y: 300 }] });
  });

  /** For each link: its bend point seen from its source element (the same for every copy) */
  const bendFromSource = () => page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { elements, links } = useDossierStore.getState();
    return links.map((l: { fromId: string; bendPoints?: { x: number; y: number }[] | null }) => {
      const from = elements.find((e: { id: string }) => e.id === l.fromId);
      const p = l.bendPoints?.[0];
      return p ? { x: p.x - from.position.x, y: p.y - from.position.y } : null;
    });
  });
  const original = (await bendFromSource())[0];

  // Copy, paste elsewhere
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.mouse.move(600, 500);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await bendFromSource()).length).toBe(2);
  expect(await bendFromSource()).toEqual([original, original]);

  // Duplicate the original pair
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    const { elements } = useDossierStore.getState();
    useSelectionStore.getState().selectElements(elements.slice(0, 2).map((e: { id: string }) => e.id));
  });
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await bendFromSource()).length).toBe(3);
  expect(await bendFromSource()).toEqual([original, original, original]);
});
