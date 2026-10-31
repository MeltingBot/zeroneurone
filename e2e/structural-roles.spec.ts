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

/*
 * Two tight groups, A (Alice…) and B (Bruno…), and Xavier alone between them.
 */
function dossierJson(): string {
  const now = new Date().toISOString();
  const groupA = ['Alice', 'Anne', 'Arthur', 'Aude'];
  const groupB = ['Bruno', 'Béa', 'Basile', 'Blaise'];
  const names = [...groupA, 'Xavier', ...groupB];
  const elements = names.map((label, i) => ({
    id: `e${i}`, label, notes: '', tags: [], properties: [], confidence: null, source: '',
    date: null, dateRange: null, position: { x: (i % 5) * 220, y: Math.floor(i / 5) * 200 }, isPositionLocked: false,
    geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  }));
  const id = (label: string) => `e${names.indexOf(label)}`;
  const pairs: [string, string][] = [];
  for (const g of [groupA, groupB]) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push([g[i], g[j]]);
  }
  pairs.push(['Alice', 'Xavier'], ['Xavier', 'Bruno']);
  const links = pairs.map(([a, b], i) => ({
    id: `l${i}`, fromId: id(a), toId: id(b), label: '', notes: '', tags: [], properties: [], confidence: null,
    source: '', date: null, dateRange: null, direction: 'none', directed: false,
    visual: { color: '#9ca3af', style: 'solid', width: 1 }, createdAt: now, updatedAt: now,
  }));
  return JSON.stringify({ version: '1.0.0', elements, links });
}

test('structural roles read as sentences, go to the report, hidden elements come back from the canvas menu', async ({ page }) => {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const file = join(mkdtempSync(join(tmpdir(), 'zn-roles-')), 'roles.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });

  await page.evaluate(async () => {
    const { useUIStore } = await window.__znImport('/src/stores/uiStore.ts');
    useUIStore.getState().setSidePanelTab('insights');
  });

  // Xavier alone links the two groups
  const sentences = page.locator('[data-testid="role-sentence"]');
  await expect(sentences.first()).toBeVisible({ timeout: 30_000 });
  await expect(sentences.first()).toContainText('Xavier');
  await expect(sentences.first()).toContainText('Alice');
  await expect(sentences.first()).toContainText('Bruno');

  // A click lights Xavier and both groups
  await sentences.first().click();
  const lit = await page.evaluate(async () => {
    const { useInsightsStore } = await window.__znImport('/src/stores/insightsStore.ts');
    const s = useInsightsStore.getState();
    return { type: s.highlightType, count: s.highlightedElementIds.size };
  });
  expect(lit).toEqual({ type: 'role', count: 9 });
  if (process.env.ZN_SHOT) await page.screenshot({ path: process.env.ZN_SHOT });

  // Into the report: a new dated section, the names as references
  await page.locator('[data-testid="roles-add-all"]').click();
  await expect.poll(() => page.evaluate(async () => {
    const { useReportStore } = await window.__znImport('/src/stores/reportStore.ts');
    return useReportStore.getState().currentReport?.sections.length ?? 0;
  })).toBe(1);
  const section = await page.evaluate(async () => {
    const { useReportStore } = await window.__znImport('/src/stores/reportStore.ts');
    return useReportStore.getState().currentReport!.sections[0];
  });
  expect(section.content).toMatch(/\[\[Xavier\|[\w-]+\]\]/);
  expect(section.content.split('\n')[0]).toMatch(/^\*.+\*$/);

  // A second sentence goes to the same section
  await sentences.first().locator('button[aria-label]').last().click();
  await expect.poll(() => page.evaluate(async () => {
    const { useReportStore } = await window.__znImport('/src/stores/reportStore.ts');
    const r = useReportStore.getState().currentReport!;
    return { sections: r.sections.length, refs: (r.sections[0].content.match(/\[\[Xavier\|/g) ?? []).length };
  })).toEqual({ sections: 1, refs: 2 });

  // Hidden elements come back from the canvas menu
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const ids = useDossierStore.getState().elements.slice(0, 2).map((e: { id: string }) => e.id);
    useViewStore.getState().hideElements(ids);
  });
  await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 40, y: 400 } });
  await page.getByRole('menuitem', { name: /\(2\)/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    return useViewStore.getState().hiddenElementIds.size;
  })).toBe(0);
});
