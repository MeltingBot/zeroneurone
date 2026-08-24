// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFocusableElements } from './useDialogA11y';

/**
 * The hook itself needs a React renderer to exercise; these cover the part
 * that decides what the focus trap will cycle through, which is where a
 * mistake silently lets Tab escape the dialog.
 */

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

describe('getFocusableElements', () => {
  it('finds the usual interactive elements, in document order', () => {
    container.innerHTML = `
      <button id="b">ok</button>
      <input id="i" />
      <select id="s"></select>
      <textarea id="t"></textarea>
      <a id="a" href="#x">link</a>
    `;

    expect(getFocusableElements(container).map((el) => el.id)).toEqual(['b', 'i', 's', 't', 'a']);
  });

  it('skips disabled controls, which cannot receive focus', () => {
    container.innerHTML = `
      <button id="ok">ok</button>
      <button id="no" disabled>nope</button>
      <input id="no2" disabled />
    `;

    expect(getFocusableElements(container).map((el) => el.id)).toEqual(['ok']);
  });

  it('skips anchors without an href and tabindex="-1"', () => {
    container.innerHTML = `
      <a id="no">not a link</a>
      <div id="no2" tabindex="-1">skipped</div>
      <div id="yes" tabindex="0">reachable</div>
    `;

    expect(getFocusableElements(container).map((el) => el.id)).toEqual(['yes']);
  });

  it('returns an empty list when the dialog holds nothing focusable', () => {
    container.innerHTML = '<p>read-only notice</p>';

    expect(getFocusableElements(container)).toEqual([]);
  });
});
