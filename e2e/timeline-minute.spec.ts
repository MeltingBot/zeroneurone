import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * The timeline zooms to the minute: events 30 s apart stand apart, the axis
 * ticks by minute, and a period of two years crossing the view stays drawn.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('the timeline separates events 30 seconds apart', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'minute.json');
  writeFileSync(file, buildLargeDossierJson(4));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(500);

  const base = new Date(2026, 10, 5, 14, 32, 0).getTime();
  await page.evaluate(async (base) => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const [a, b, c, d] = store.elements;
    const event = (id: string, label: string, date: Date, dateEnd?: Date) => ({ events: [{ id, label, date, dateEnd }] } as never);
    // Punctual entries (an event without end lasts until now)
    const at = (ms: number) => [new Date(ms), new Date(ms)] as const;
    await store.updateElement(a.id, event('ev-a', 'Entrée A', ...at(base)));
    await store.updateElement(b.id, event('ev-b', 'Entrée B', ...at(base + 30_000)));
    await store.updateElement(c.id, event('ev-c', 'Entrée C', ...at(base + 120_000)));
    await store.updateElement(d.id, event('ev-d', 'Période longue', new Date(2025, 0, 1), new Date(2027, 11, 31)));
    const view = (await import('/src/stores/viewStore.ts')).useViewStore.getState();
    view.setDisplayMode('timeline' as never);
  }, base);
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: '1 min', exact: true }).click();
  // The view brought on the entries, two minutes before the first
  await page.evaluate(async (start) => {
    (await import('/src/stores/viewStore.ts')).useViewStore.getState().setTimeline({ viewStartMs: start } as never);
  }, base - 120_000);
  await page.waitForTimeout(500);

  // Shown as "<element>: <event>"
  const box = async (text: string) => (await page.getByText(new RegExp(`${text}$`)).first().boundingBox())!;
  const [a, b, c] = [await box('Entrée A'), await box('Entrée B'), await box('Entrée C')];
  // "1 min" preset: ~42 px per minute, 30 s ≈ 21 px
  expect(b.x - a.x).toBeGreaterThanOrEqual(18);
  expect(c.x - b.x).toBeGreaterThanOrEqual(55);

  // Ticks by minute: 14:31, 14:33…
  await expect(page.getByText('14:33', { exact: true }).first()).toBeVisible();

  // The period of three years crossing the view is still drawn on screen
  const period = await page.getByText(/Période longue$/).first().boundingBox();
  expect(period).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(period!.x).toBeGreaterThanOrEqual(0);
  expect(period!.x).toBeLessThan(viewport.width);
});
