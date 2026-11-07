import { test, expect, type Page } from '@playwright/test';

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


/**
 * A click on a link whose other end lies outside the view shows both ends
 * and the link label where it was clicked; its context menu header shows the
 * same and opens its detail, as an element's header does. Dev server only.
 */
test('a link leading off screen shows its ends on click and in its menu', async ({ page }) => {
  test.setTimeout(90_000);
  await exposeImporter(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const dossierId = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return (await useDossierStore.getState().createDossier('Tooltip', '')).id;
  });
  await page.goto(`/dossier/${dossierId}`);
  await page.waitForSelector('.react-flow__pane', { timeout: 30_000 });

  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    const d = useDossierStore.getState();
    const a = await d.createElement('Source visible', { x: 0, y: 0 });
    const b = await d.createElement('Cible lointaine', { x: 6000, y: 0 });
    await d.createLink(a.id, b.id, { label: 'appelle' });
    useViewStore.getState().requestViewportChange({ x: 200, y: 300, zoom: 1 });
  });
  await page.waitForSelector('.react-flow__edge', { timeout: 15_000 });
  await page.waitForTimeout(800);

  const edge = page.locator('.react-flow__edge').first();
  const box = (await edge.boundingBox())!;
  await page.mouse.click(box.x + 250, box.y + box.height / 2);

  const tip = page.getByTestId('link-ends-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Source visible');
  await expect(tip).toContainText('appelle');
  await expect(tip).toContainText('Cible lointaine');

  // A click on the empty canvas closes it
  await page.mouse.click(box.x + 250, box.y + box.height / 2 + 200);
  await expect(tip).toBeHidden();

  // Right click: the menu header shows the same, and opens the link detail
  await page.mouse.click(box.x + 250, box.y + box.height / 2, { button: 'right' });
  const header = page.getByTestId('context-menu-header');
  await expect(header).toContainText('Source visible');
  await expect(header).toContainText('appelle');
  await expect(header).toContainText('Cible lointaine');
  await header.click();
  await expect(page.getByTestId('link-label-input')).toHaveValue('appelle');

  // Same for an element: its menu header opens its detail
  await page.locator('.react-flow__node', { hasText: 'Source visible' }).click({ button: 'right' });
  await page.getByTestId('context-menu-header').click();
  await expect(page.getByTestId('element-label-input')).toHaveValue('Source visible');

  // A link with both ends off screen is only drawn by the canvas links layer:
  // the click and the right click reach it there too
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().requestViewportChange({ x: -2500, y: 300, zoom: 1 });
  });
  await page.waitForTimeout(800);
  const lineY = box.y + box.height / 2;
  await page.mouse.click(box.x + 250, lineY);
  await expect(tip).toBeVisible();
  await page.mouse.click(box.x + 250, lineY, { button: 'right' });
  await expect(page.getByTestId('context-menu-header')).toContainText('Cible lointaine');
  await page.keyboard.press('Escape');

  // Both ends on screen: no tooltip
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().requestViewportChange({ x: 60, y: 300, zoom: 0.08 });
  });
  await page.waitForTimeout(800);
  const near = (await page.locator('.react-flow__edge').first().boundingBox())!;
  await page.mouse.click(near.x + near.width / 2, near.y + near.height / 2);
  await page.waitForTimeout(300);
  await expect(tip).toBeHidden();
});
