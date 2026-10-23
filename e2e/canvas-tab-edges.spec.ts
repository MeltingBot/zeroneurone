import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * A canvas tab renders its members and their direct neighbours (ghosts) only.
 * Every link between two displayed nodes must be drawn: links between nodes
 * outside the tab must not take places under the rendered-edge cap.
 * Dev server only: reaches the stores through Vite's module URLs.
 */

const ELEMENT_COUNT = Number(process.env.TAB_BENCH_ELEMENTS ?? 10000);
const TAB_SIZE = 100;

test('a tab draws every link between its displayed nodes', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'tab.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENT_COUNT));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 5 * 60 * 1000 });
  await page.waitForTimeout(5000);

  // A tab holding the first TAB_SIZE elements, made active.
  const expected = await page.evaluate(async (size) => {
    const dossier = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const members = dossier.elements.slice(0, size).map((e) => e.id);
    const tab = await tabs.getState().createTab(dossier.currentDossier!.id, 'Bench');
    await tabs.getState().addMembers(tab.id, members);
    tabs.getState().setActiveTab(tab.id);

    // Displayed = members + ghosts (non-members linked to a member).
    const memberSet = new Set(members);
    const displayed = new Set(members);
    for (const l of dossier.links) {
      if (memberSet.has(l.fromId)) displayed.add(l.toId);
      if (memberSet.has(l.toId)) displayed.add(l.fromId);
    }
    const drawable = dossier.links.filter((l) => displayed.has(l.fromId) && displayed.has(l.toId)).length;
    return { displayed: displayed.size, drawable };
  }, TAB_SIZE);

  // Whole tab on screen, then let progressive edge rendering finish.
  await page.click('[data-testid="fit-view"]');
  await page.waitForTimeout(5000);

  const drawn = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.react-flow__node').length,
    edges: document.querySelectorAll('.react-flow__edge').length,
  }));
  console.log(JSON.stringify({ expected, drawn }));

  expect(expected.drawable).toBeLessThan(800); // under the cap: all must show
  expect(drawn.nodes).toBe(expected.displayed);
  expect(drawn.edges).toBe(expected.drawable);
});
