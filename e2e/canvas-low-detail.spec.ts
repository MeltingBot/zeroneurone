import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Zoomed far out, element nodes render a single handle and edges drop their
 * handle ids (src/components/canvas/lowDetailHandles.ts). Coming back close
 * up, every edge must be drawn again exactly where it was, including edges
 * towards nodes that were measured in the overview and are now off screen.
 * Dev server only: reaches the view store through Vite's module URLs.
 */
test('edges survive a round trip through the low-detail overview', async ({ page }) => {
  test.setTimeout(300_000);
  const logs: string[] = [];
  page.on('console', (m) => { if (/008/.test(m.text())) logs.push(m.text().slice(0, 160)); });
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'h.json');
  writeFileSync(file, buildLargeDossierJson(1000));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 120_000 });
  await page.waitForTimeout(4000);
  const snap = async () => page.evaluate(() => ({
    nodes: document.querySelectorAll('.react-flow__node').length,
    lod: document.querySelectorAll('.react-flow__handle[data-handleid="low-detail"]').length,
    handles: document.querySelectorAll('.react-flow__handle').length,
    paths: Object.fromEntries([...document.querySelectorAll('.react-flow__edge')].map((e) => [
      e.getAttribute('data-id') ?? e.id, e.querySelector('path')?.getAttribute('d') ?? '',
    ])),
  }));
  const view = async (v: object) => {
    await page.evaluate(async (vv) => (await import('/src/stores/viewStore.ts')).useViewStore.getState().requestViewportChange(vv as never), v);
    await page.waitForTimeout(2500);
  };
  const near = { x: 0, y: 0, zoom: 1 };
  const far = { x: -9000, y: -700, zoom: 1 }; // a region never seen close up
  await view(near); const a = await snap();
  await page.click('[data-testid="fit-view"]'); await page.waitForTimeout(3000); const o = await snap();
  await view(near); const b = await snap();
  await view(far); const c = await snap();
  // Reference for the far region: a fresh visit without overview in between
  await view(near); await view(far); const d = await snap();
  const maxGap = (x: Record<string, string>, y: Record<string, string>) => {
    let m = 0;
    for (const id of Object.keys(x)) {
      if (!(id in y)) return Infinity;
      const p = x[id].match(/-?[\d.]+/g) ?? [], q = y[id].match(/-?[\d.]+/g) ?? [];
      if (p.length !== q.length) return Infinity;
      p.forEach((v, i) => { m = Math.max(m, Math.abs(Number(v) - Number(q[i]))); });
    }
    return m;
  };
  // The overview really is in low detail: one handle per linked node.
  expect(o.lod).toBe(o.nodes);
  expect(o.handles).toBe(o.nodes);
  // Same edges, drawn within a pixel (measurement rounding), in the region
  // seen before the overview and in one first seen after it.
  expect(Object.keys(b.paths).length).toBe(Object.keys(a.paths).length);
  expect(maxGap(a.paths, b.paths)).toBeLessThan(1);
  expect(Object.keys(c.paths).length).toBe(Object.keys(d.paths).length);
  expect(maxGap(c.paths, d.paths)).toBeLessThan(1);
  // React Flow error 008: an edge whose handle cannot be found.
  expect(logs, logs.slice(0, 3).join(' | ')).toHaveLength(0);
});
