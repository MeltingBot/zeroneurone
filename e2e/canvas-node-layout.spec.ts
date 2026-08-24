import { test, expect } from '@playwright/test';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas } from './fixtures/test-utils';

/**
 * A node draws three boxes that must coincide: the wrapper React Flow lays out
 * (edges and the resizer follow it), the component root, and the shape itself.
 * When they drifted apart on Firefox the label landed inside the shape and the
 * resize handles sat above the node — invisible to a Chromium-only suite.
 */
test.describe('canvas node layout', () => {
  test('wrapper, root and shape share the same box', async ({ page }) => {
    await setupCleanEnvironment(page);
    await createTestDossier(page, 'Dossier mise en page');
    await createElementOnCanvas(page, 400, 300);

    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: 20_000 });

    const boxes = await node.evaluate((wrap) => {
      const root = wrap.firstElementChild as HTMLElement;
      const shape = wrap.querySelector('[class*="sketchy"]') as HTMLElement;
      const r = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) };
      };
      return {
        wrapper: r(wrap),
        root: r(root),
        shape: shape ? r(shape) : null,
        rootPosition: getComputedStyle(root).position,
      };
    });

    expect(boxes.shape).not.toBeNull();
    expect(boxes.rootPosition).toBe('relative');

    // The root must not be pushed inside the wrapper: any in-flow sibling
    // slipping above the shape shifts the drawing away from the hit box.
    expect(Math.abs(boxes.root.top - boxes.wrapper.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.root.left - boxes.wrapper.left)).toBeLessThanOrEqual(1);

    // The shape fills the root; `h-full` resolving to zero is the failure mode.
    expect(Math.abs(boxes.shape!.top - boxes.root.top)).toBeLessThanOrEqual(1);
    expect(boxes.shape!.h).toBeGreaterThan(0);
    expect(Math.abs(boxes.shape!.h - boxes.root.h)).toBeLessThanOrEqual(2);
  });

  test('resize controls frame the selected shape', async ({ page }) => {
    await setupCleanEnvironment(page);
    await createTestDossier(page, 'Dossier resizer');
    await createElementOnCanvas(page, 400, 300);

    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();

    const controls = node.locator('.react-flow__resize-control');
    await expect(controls.first()).toBeVisible({ timeout: 10_000 });

    const geom = await node.evaluate((wrap) => {
      const shape = wrap.querySelector('[class*="sketchy"]') as HTMLElement;
      const s = shape.getBoundingClientRect();
      const handles = [...wrap.querySelectorAll('.react-flow__resize-control')].map((el) => {
        const b = el.getBoundingClientRect();
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
      });
      return {
        shape: { top: s.top, bottom: s.bottom, left: s.left, right: s.right },
        handles,
      };
    });

    // Every control belongs on the shape's outline, not floating above it.
    const slack = 12;
    for (const h of geom.handles) {
      expect(h.cy).toBeGreaterThanOrEqual(geom.shape.top - slack);
      expect(h.cy).toBeLessThanOrEqual(geom.shape.bottom + slack);
      expect(h.cx).toBeGreaterThanOrEqual(geom.shape.left - slack);
      expect(h.cx).toBeLessThanOrEqual(geom.shape.right + slack);
    }
  });
});
