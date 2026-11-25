import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
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

/** Three elements with a dated event each (an event without end runs until now) and a dated link */
function dossierJson(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, date: string, event: string) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y: 0 }, isPositionLocked: false, geo: null, events: [{ id: `ev-${id}`, date, dateEnd: date, label: event }],
    assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'circle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [
      element('a', 'Alpha', 0, '2018-04-10T10:00:00', 'Départ'),
      element('b', 'Bravo', 300, '2021-09-02T10:00:00', 'Rencontre'),
      element('c', 'Charlie', 600, '2024-01-15T10:00:00', 'Arrestation'),
    ],
    links: [{
      id: 'ab', fromId: 'a', toId: 'b', label: 'finance', notes: '', tags: [], properties: [], confidence: null,
      source: '', date: null, dateRange: { start: '2019-01-01T10:00:00', end: '2022-06-30T10:00:00' },
      direction: 'forward', directed: true, visual: { color: '#6b6560', style: 'solid', thickness: 2 },
      sourceHandle: 'source-right', targetHandle: 'target-left', createdAt: now, updatedAt: now,
    }],
  });
}

test('the timeline exports as SVG, the whole period or the visible range', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'timeline.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().setDisplayMode('timeline');
  });

  const exportAs = async (testId: string) => {
    await page.click('[data-testid="timeline-export"]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(`[data-testid="${testId}"]`)]);
    expect(download.suggestedFilename()).toMatch(/_timeline_.*\.svg$/);
    return readFileSync((await download.path())!, 'utf-8');
  };

  // Whole period: every item, whatever the view
  const all = await exportAs('timeline-export-svg-all');
  for (const label of ['Départ', 'Rencontre', 'Arrestation', 'finance']) expect(all).toContain(label);

  // Visible range: a span of 2021 only keeps its event and the link crossing it
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().setTimeline({ zoom: 3, viewStartMs: new Date(2021, 5, 1).getTime() });
  });
  const visible = await exportAs('timeline-export-svg-visible');
  expect(visible).toContain('Rencontre');
  expect(visible).toContain('finance');
  expect(visible).not.toContain('Départ');
  expect(visible).not.toContain('Arrestation');

  // Shown as an image for a look
  await page.setContent(`<body style="margin:0;background:#fff">${all}</body>`);
  await page.screenshot({ path: test.info().outputPath('timeline-all.png'), fullPage: true });
});
