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


/** A point of the element that no link covers, or null */
const uncoveredPoint = (page: Page, id: string) =>
  page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y += 2) {
      for (let x = Math.ceil(r.left) + 1; x < r.right - 1; x += 3) {
        if (node.contains(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  }, id);

/** The group, and where the element `id` stands */
const readState = (page: Page, groupId: string, id: string) =>
  page.evaluate(async ([groupId, id]) => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const els = useDossierStore.getState().elements;
    const group = els.find((e: { id: string }) => e.id === groupId);
    const el = els.find((e: { id: string }) => e.id === id);
    return {
      parent: el.parentGroupId as string | null,
      position: el.position as { x: number; y: number },
      childIds: [...group.childIds].sort() as string[],
      groupPosition: group.position as { x: number; y: number },
      size: { w: group.visual.customWidth as number, h: group.visual.customHeight as number },
    };
  }, [groupId, id] as const);

/**
 * Selection holding one group and free elements → Organize → "Add to group":
 * the elements move into the frame, which grows to hold them; one undo step.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('free elements of the selection can be added to its group', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  // Group the first two on-screen nodes; keep outside another one that links
  // do not cover entirely (its menu is opened by a right-click on it)
  const { groupId, rest } = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id')!);
    const { groupElements } = await window.__znImport('/src/utils/groupElements.ts');
    const groupId = await groupElements(ids.slice(0, 2), 'Groupe', 'Unnamed');
    return { groupId: groupId as string, rest: ids.slice(2) };
  });
  await page.waitForTimeout(500);
  let outsider = '';
  let point: { x: number; y: number } | null = null;
  for (const id of rest) {
    point = await uncoveredPoint(page, id);
    if (point) { outsider = id; break; }
  }
  expect(point).not.toBeNull();
  const before = await readState(page, groupId, outsider);
  expect(before.parent).toBeNull();
  expect(before.childIds).toHaveLength(2);

  await page.evaluate(async (ids) => {
    (await window.__znImport('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
  }, [groupId, outsider]);
  await page.waitForTimeout(300);
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Organize' }).hover();
  await page.getByRole('menuitem', { name: 'Add to group' }).click();
  await page.waitForTimeout(500);

  const added = await readState(page, groupId, outsider);
  expect(added.parent).toBe(groupId);
  expect(added.childIds).toEqual([...before.childIds, outsider].sort());
  // Inside the frame, which did not move and did not shrink
  expect(added.groupPosition).toEqual(before.groupPosition);
  expect(added.position.x).toBeGreaterThanOrEqual(0);
  expect(added.position.y).toBeGreaterThanOrEqual(0);
  expect(added.position.x).toBeLessThan(added.size.w);
  expect(added.position.y).toBeLessThan(added.size.h);
  expect(added.size.w).toBeGreaterThanOrEqual(before.size.w);
  expect(added.size.h).toBeGreaterThan(before.size.h);
  // The child node is drawn inside the group node
  const groupBox = (await page.locator(`.react-flow__node[data-id="${groupId}"]`).boundingBox())!;
  const childBox = (await page.locator(`.react-flow__node[data-id="${outsider}"]`).boundingBox())!;
  expect(childBox.x).toBeGreaterThanOrEqual(groupBox.x);
  expect(childBox.y).toBeGreaterThanOrEqual(groupBox.y);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 1);
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(groupBox.y + groupBox.height + 1);

  // One undo step puts everything back
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => readState(page, groupId, outsider)).toEqual(before);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => readState(page, groupId, outsider)).toEqual(added);
});

/**
 * An element left with the id of a group that no longer exists counts as free: two such
 * elements can be grouped, and end up in the new group.
 */
test('an element left over from a deleted group can be grouped again', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'leftover.json');
  writeFileSync(file, buildLargeDossierJson(4));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  // Two free elements, the first one still pointing at a group that is gone
  const [a, b] = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    const els = useDossierStore.getState().elements;
    await useDossierStore.getState().updateElement(els[0].id, { parentGroupId: 'deleted-group' });
    useSelectionStore.getState().selectElements([els[0].id, els[1].id]);
    return [els[0].id, els[1].id];
  });
  await page.waitForTimeout(300);
  const point = await uncoveredPoint(page, b);
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Organize' }).hover();
  await page.getByRole('menuitem', { name: 'Group', exact: true }).click();

  // Both in the new group
  await expect.poll(() => page.evaluate(async ([a, b]) => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const els = useDossierStore.getState().elements;
    const parentOf = (id: string) => els.find((e: { id: string }) => e.id === id).parentGroupId;
    const group = els.find((e: { id: string; isGroup: boolean }) => e.isGroup && e.id === parentOf(b));
    return !!group && parentOf(a) === group.id;
  }, [a, b] as const)).toBe(true);
});
