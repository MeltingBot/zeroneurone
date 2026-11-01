import { test, expect } from '@playwright/test';

/**
 * A click on a link whose other end lies outside the view shows both ends
 * and the link label where it was clicked. Dev server only.
 */
test('clicking a link leading off screen shows its ends', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const dossierId = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    return (await useDossierStore.getState().createDossier('Tooltip', '')).id;
  });
  await page.goto(`/dossier/${dossierId}`);
  await page.waitForSelector('.react-flow__pane', { timeout: 30_000 });

  await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const { useViewStore } = await import('/src/stores/viewStore.ts');
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

  // Both ends on screen: no tooltip
  await page.evaluate(async () => {
    const { useViewStore } = await import('/src/stores/viewStore.ts');
    useViewStore.getState().requestViewportChange({ x: 60, y: 300, zoom: 0.08 });
  });
  await page.waitForTimeout(800);
  const near = (await page.locator('.react-flow__edge').first().boundingBox())!;
  await page.mouse.click(near.x + near.width / 2, near.y + near.height / 2);
  await page.waitForTimeout(300);
  await expect(tip).toBeHidden();
});
