// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../../types';
import { cloneClipboardForPaste } from './canvasClipboard';

const el = (id: string, x: number) =>
  ({ id, dossierId: 'd1', position: { x, y: 0 }, assetIds: ['f1'], parentGroupId: null }) as unknown as Element;
const link = { id: 'l1', dossierId: 'd1', fromId: 'a', toId: 'b', assetIds: ['f2'], curveOffset: { x: 0, y: 0 } } as unknown as Link;

describe('cloneClipboardForPaste — files of the links', () => {
  const clip = { elements: [el('a', 0), el('b', 100)], links: [link], sourceDossierId: 'd1' };

  it('keeps them in the same dossier', () => {
    const { newLinks } = cloneClipboardForPaste(clip, 'd1', 0, 0);
    expect(newLinks[0].assetIds).toEqual(['f2']);
  });

  it('drops them in another dossier, where the files are not stored', () => {
    const { newElements, newLinks } = cloneClipboardForPaste(clip, 'd2', 0, 0);
    expect(newElements[0].assetIds).toEqual([]);
    expect(newLinks[0].assetIds).toEqual([]);
  });
});
