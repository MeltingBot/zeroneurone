import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';

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

type Pt = { x: number; y: number };

/** The import gives new ids: the link and Bravo as stored. */
let linkId = '';
let bravoId = '';

/** Corners of the link as drawn: the points of its path. */
const pathPoints = (page: Page) =>
  page.locator(`path[id="${linkId}"]`).getAttribute('d').then((d) =>
    [...(d ?? '').matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) })));

const rightAngled = (points: Pt[]) =>
  points.every((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) < 0.01 || Math.abs(p.y - points[i - 1].y) < 0.01);

/** The link as stored */
const storedLink = (page: Page) => page.evaluate(async (id) => {
  const { useDossierStore } = await import('/src/stores/dossierStore.ts');
  const link = useDossierStore.getState().links.find((l) => l.id === id)!;
  return { route: link.orthogonalRoute ?? null, anchorMode: link.anchorMode ?? null };
}, linkId);

/** Clicks the link on the middle of its segment `index` (screen position from the viewport). */
async function clickLink(page: Page, index = 1, button: 'left' | 'right' = 'left') {
  const points = await pathPoints(page);
  const { x: vx, y: vy, zoom } = await page.evaluate(async () => {
    const { useViewStore } = await import('/src/stores/viewStore.ts');
    return useViewStore.getState().viewport;
  });
  const canvas = (await page.locator('.react-flow').boundingBox())!;
  const mid = { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 };
  await page.mouse.click(canvas.x + mid.x * zoom + vx, canvas.y + mid.y * zoom + vy, { button });
}

/** Drags the handle of segment `index` by (dx, dy) screen pixels. */
async function dragSegment(page: Page, index: number, dx: number, dy: number) {
  const box = (await page.locator(`[data-segment="${index}"] rect`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('right-angle links get a handle per segment: move, bend, split, undo, reset', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'bends.json');
  writeFileSync(file, twoNodeDossier());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');

  // Right angles, auto anchors, the link selected
  ({ linkId, bravoId } = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setLinkCurveMode('orthogonal');
    await useDossierStore.getState().setLinkAnchorMode('auto');
    const s = useDossierStore.getState();
    return { linkId: s.links[0].id, bravoId: s.elements.find((e) => e.label === 'Bravo')!.id };
  }));
  await page.waitForTimeout(300);
  await clickLink(page);
  const handles = page.locator('[data-segment-handles] [data-segment]');
  await expect(handles).toHaveCount(3);
  const before = await pathPoints(page);
  expect(rightAngled(before)).toBe(true);

  // The middle (vertical) segment dragged right: one route stored, anchors pinned
  await dragSegment(page, 1, 60, 0);
  await expect.poll(async () => (await storedLink(page)).route).not.toBeNull();
  const moved = await pathPoints(page);
  expect(rightAngled(moved)).toBe(true);
  const middleX = (points: Pt[]) => points.find((p, i) => i > 0 && p.x === points[i - 1].x && p.y !== points[i - 1].y)!.x;
  expect(middleX(moved)).toBeGreaterThan(middleX(before) + 20);
  expect((await storedLink(page)).anchorMode).toBe('manual');

  // The first segment (attached to Alpha) dragged down: a new step, two more corners
  await dragSegment(page, 0, 0, 50);
  await expect.poll(async () => (await pathPoints(page)).length).toBe(moved.length + 2);
  expect(rightAngled(await pathPoints(page))).toBe(true);
  const bent = (await storedLink(page)).route!;
  expect(bent.positions).toHaveLength(3);

  // Undo: back to the first drag
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await storedLink(page)).route?.positions.length).toBe(1);
  // Undo of the first drag: automatic route and anchors again, then redone
  await page.keyboard.press('Control+z');
  await expect.poll(() => storedLink(page)).toEqual({ route: null, anchorMode: null });
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await storedLink(page)).route?.positions.length).toBe(1);
  expect((await storedLink(page)).anchorMode).toBe('manual');
  // Drawn again before clicking it
  await expect.poll(async () => (await pathPoints(page)).length).toBe(moved.length);

  // Double-click on a handle cuts its segment: two more inner positions
  await clickLink(page);
  await expect(handles).toHaveCount(3);
  await page.locator('[data-segment="1"] rect').dblclick();
  await expect.poll(async () => (await storedLink(page)).route?.positions.length).toBe(3);
  await expect(page.locator('.react-flow__edges foreignObject input')).toHaveCount(0); // no label editing

  // Bravo moved: still a right-angle line, still ending on Bravo
  await page.evaluate(async (id) => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useDossierStore.getState().updateElement(id, { position: { x: 420, y: 320 } });
  }, bravoId);
  await expect.poll(async () => rightAngled(await pathPoints(page))).toBe(true);

  // Kept after a reload
  const kept = (await storedLink(page)).route;
  await page.reload();
  await page.waitForSelector(`path[id="${linkId}"]`);
  await expect.poll(async () => (await storedLink(page)).route).toEqual(kept);

  // Reset from the context menu: automatic route again
  await clickLink(page, 2, 'right');
  await page.getByRole('menuitem', { name: 'Reset route' }).click();
  await expect.poll(async () => (await storedLink(page)).route).toBeNull();
});
