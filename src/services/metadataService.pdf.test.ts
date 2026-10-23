import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PDF metadata: author, title, subject and keywords come from the Info
 * dictionary, or from XMP (Dublin Core) when the Info dictionary has none.
 * They were not read at all: a PDF written by Word showed no author.
 */

const doc = vi.hoisted(() => ({
  info: {} as Record<string, unknown>,
  xmp: null as Record<string, unknown> | null,
}));

vi.mock('./pdfjsLoader', () => ({
  loadPdfjs: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 36,
        getMetadata: async () => ({
          info: doc.info,
          metadata: doc.xmp ? { get: (name: string) => doc.xmp![name] ?? null } : null,
        }),
      }),
    }),
  }),
}));

import { metadataService } from './metadataService';

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'doc.pdf', { type: 'application/pdf' });
const value = (props: { key: string; value: unknown }[] | undefined, key: string) =>
  props?.find((p) => p.key === key)?.value;

beforeEach(() => {
  doc.info = {};
  doc.xmp = null;
});

describe('PDF metadata', () => {
  it('reads author, title, subject and keywords from the Info dictionary', async () => {
    doc.info = { Author: 'Adrien Delétang', Title: 'Guide', Subject: 'Survie', Keywords: 'urbain, préparation', Producer: 'Microsoft® Word 2016' };
    const meta = await metadataService.extractMetadata(pdf(), new ArrayBuffer(4));
    expect(value(meta?.properties, 'Auteur')).toBe('Adrien Delétang');
    expect(value(meta?.properties, 'Titre')).toBe('Guide');
    expect(value(meta?.properties, 'Sujet')).toBe('Survie');
    expect(value(meta?.properties, 'Mots-clés')).toBe('urbain, préparation');
    expect(value(meta?.properties, 'Nombre de pages')).toBe(36);
  });

  it('falls back on XMP when the Info dictionary has none', async () => {
    doc.info = { Author: '  ', Producer: 'x' };
    doc.xmp = { 'dc:creator': ['Ada Lovelace', 'Charles Babbage'], 'dc:title': 'Notes' };
    const meta = await metadataService.extractMetadata(pdf(), new ArrayBuffer(4));
    expect(value(meta?.properties, 'Auteur')).toBe('Ada Lovelace, Charles Babbage');
    expect(value(meta?.properties, 'Titre')).toBe('Notes');
    expect(value(meta?.properties, 'Sujet')).toBeUndefined();
  });
});
