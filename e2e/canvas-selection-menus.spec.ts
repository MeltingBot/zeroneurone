import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __znImport(path: string): Promise<any>;
  }
}

/** Import an app module as the app loaded it (a reused dev server adds `?t=`) */
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

async function openDossier(page: Page) {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);
}

const select = (page: Page, ids: string[]) =>
  page.evaluate(async (ids) => {
    (await window.__znImport('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
  }, ids);

const selection = (page: Page) =>
  page.evaluate(async () => {
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    return [...useSelectionStore.getState().selectedElementIds].sort() as string[];
  });

const linksOf = (page: Page) =>
  page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return useDossierStore.getState().links.map((l: { id: string; fromId: string; toId: string; direction: string }) => ({
      id: l.id, fromId: l.fromId, toId: l.toId, direction: l.direction,
    }));
  });


/** A point of the canvas that no element or link covers */
async function blankPoint(page: Page) {
  const point = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')!;
    const r = pane.getBoundingClientRect();
    for (let y = r.top + 20; y < r.bottom; y += 23) for (let x = r.left + 20; x < r.right; x += 37) {
      if (document.elementFromPoint(x, y) === pane) return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  return point!;
}

async function openCanvasMenu(page: Page) {
  const p = await blankPoint(page);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menu').first().waitFor();
}

/** Right-click the middle of a link drawn by React Flow, when nothing covers it */
async function openLinkMenu(page: Page, linkIds: string[]): Promise<string | null> {
  const hit = await page.evaluate((linkIds) => {
    for (const id of linkIds) {
      const g = document.querySelector(`.react-flow__edge[data-id="${id}"]`);
      const path = g?.querySelector('path') as SVGPathElement | null;
      if (!g || !path) continue;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const m = path.getScreenCTM()!;
      const x = p.x * m.a + p.y * m.c + m.e, y = p.x * m.b + p.y * m.d + m.f;
      if (g.contains(document.elementFromPoint(x, y))) return { id, x, y };
    }
    return null;
  }, linkIds);
  if (!hit) return null;
  await page.mouse.click(hit.x, hit.y, { button: 'right' });
  await page.getByRole('menu').first().waitFor();
  return hit.id;
}

/** Right-click a point of the element that no link covers */
async function openElementMenu(page: Page, id: string) {
  const point = await page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)!;
    const r = node.getBoundingClientRect();
    for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y += 2) {
      for (let x = Math.ceil(r.left) + 1; x < r.right - 1; x += 3) {
        if (node.contains(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  }, id);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menu').first().waitFor();
}
/** Labels of the open menu's top level, and of its Organize submenu */
async function readMenu(page: Page) {
  const root = page.getByRole('menu').first();
  const top = await root.locator(':scope > button[role="menuitem"], :scope button[role="menuitem"]').allInnerTexts();
  await page.getByRole('menuitem', { name: 'Organize' }).hover();
  const organize = await page.getByRole('menu').nth(1).getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return { top: top.map((s) => s.split('\n')[0].trim()), organize: organize.map((s) => s.split('\n')[0].trim()) };
}

const nodeIds = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id')!));

/**
 * The same selection gets the same menu, whether an element or the canvas is
 * right-clicked; "Connect" links a pair, "Select neighbours" extends the
 * selection, and a link's arrow can be turned round. Dev server only.
 */
test('element and canvas menus offer the same selection actions', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  const [a, b] = await nodeIds(page);
  await select(page, [a, b]);
  await page.waitForTimeout(300);

  await openElementMenu(page, a);
  const onElement = await readMenu(page);
  await openCanvasMenu(page);
  const onCanvas = await readMenu(page);

  expect(onElement.organize).toEqual(onCanvas.organize);
  expect(onElement.organize).toEqual(['Group', 'Group and gather', 'Merge', 'Lock position']);
  for (const label of ['Connect', 'Focus mode', 'Analyze', 'Organize', 'Hide', 'Show only', 'Select neighbors', 'Select their links']) {
    expect(onElement.top).toContain(label);
    expect(onCanvas.top).toContain(label);
  }
});

test('connect, select neighbours and reverse a link from the menus', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  const ids = await nodeIds(page);
  const before = await linksOf(page);
  // A pair with no link between them yet
  const [a, b] = ids.flatMap((x) => ids.map((y) => [x, y])).find(([x, y]) => x !== y
    && !before.some((l) => (l.fromId === x && l.toId === y) || (l.fromId === y && l.toId === x)))!;

  // Connect: one link from the element under the menu to the other, one undo step
  await select(page, [a, b]);
  await openElementMenu(page, b);
  await page.getByRole('menuitem', { name: 'Connect' }).click();
  await expect.poll(async () => (await linksOf(page)).length).toBe(before.length + 1);
  const created = (await linksOf(page)).find((l) => !before.some((o) => o.id === l.id))!;
  expect([created.fromId, created.toId]).toEqual([b, a]);
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect.poll(async () => (await linksOf(page)).length).toBe(before.length);

  // Select neighbours: the element and those it is linked to
  const neighbours = [...new Set([a, ...before.flatMap((l) => l.fromId === a ? [l.toId] : l.toId === a ? [l.fromId] : [])])].sort();
  await select(page, [a]);
  await openElementMenu(page, a);
  await page.getByRole('menuitem', { name: 'Select neighbors' }).click();
  await expect.poll(() => selection(page)).toEqual(neighbours);

  // Reverse: one link's arrow turns round, its ends stay; one undo step.
  // Links may overlap: the one whose menu opened is the one that changed.
  const now = await linksOf(page);
  expect(await openLinkMenu(page, now.filter((l) => l.direction === 'forward').map((l) => l.id))).not.toBeNull();
  await page.getByRole('menuitem', { name: 'Reverse direction' }).click();
  const changed = async () => (await linksOf(page)).filter((l) => {
    const old = now.find((o) => o.id === l.id)!;
    return JSON.stringify(old) !== JSON.stringify(l);
  });
  await expect.poll(async () => (await changed()).length).toBe(1);
  const [reversed] = await changed();
  const original = now.find((l) => l.id === reversed.id)!;
  expect(reversed).toEqual({ ...original, direction: 'backward' });
  await page.getByTitle('Undo (Ctrl+Z)').click();
  await expect.poll(async () => (await changed()).length).toBe(0);
});
