// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { reportService, DEFAULT_REPORT_OPTIONS, normalizeSectionOrder } from './reportService';
import { wordText } from './reportDocx';

vi.mock('i18next', () => ({
  default: { t: (key: string) => key.replace('modals:synthesis.content.', ''), language: 'fr', changeLanguage: () => {} },
}));

const dossier = { id: 'd1', name: 'Enquête', description: 'Le **contexte**', createdAt: new Date(), updatedAt: new Date() } as never;
const el = (id: string, label: string, notes = '') => ({
  id, dossierId: 'd1', label, tags: ['t'], properties: [], assetIds: [], events: [], notes, source: 'https://exemple.org/a',
  confidence: 60, position: { x: 0, y: 0 }, visual: { color: '#888', shape: 'rectangle' }, createdAt: new Date(), updatedAt: new Date(),
}) as never;
const elements = [el('a', 'Alpha', 'note *a*'), el('b', 'Bravo\u0001 sale', 'note b'), el('c', 'Charlie', 'note c')];
const links = [{ id: 'l1', fromId: 'c', toId: 'a', label: 'connaît', notes: '', directed: true, assetIds: [] }] as never[];

async function docxParts(options: object) {
  const blob = await reportService.generateDocx(dossier, elements, links, [], { ...DEFAULT_REPORT_OPTIONS, includeInsights: false, includeFiches: true, ...options }, 'fr');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const files = Object.keys(zip.files);
  const read = (name: string) => zip.file(name)!.async('string');
  const footer = files.find((f) => /^word\/footer\d*\.xml$/.test(f))!;
  return { document: await read('word/document.xml'), footer: await read(footer), rels: await read('word/_rels/document.xml.rels'), footerRels: await read(footer.replace('word/', 'word/_rels/') + '.rels') };
}

/** Text of the headings, in document order */
const headings = (xml: string) =>
  [...xml.matchAll(/<w:p>(?:(?!<\/w:p>).)*?<w:pStyle w:val="(Heading\d|Title)"\/>(?:(?!<\/w:p>).)*?<\/w:p>/gs)]
    .map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''));

describe('reportDocx', () => {
  it('drops the characters Word cannot hold', () => {
    expect(wordText('a\u0001b\u000Bc\td\ne')).toBe('abc\td\ne');
  });

  it('writes the parts in the chosen order, scope first, with its origin on every page', async () => {
    const { document, footer, footerRels } = await docxParts({
      sectionOrder: normalizeSectionOrder(['fiches', 'elements']),
      primaryElementIds: ['c'],
    });
    const hs = headings(document);
    expect(hs[0]).toBe('Enquête');
    const sheets = hs.indexOf('detailedSheets (1)');
    const linked = hs.indexOf('linkedSheets (2)');
    const list = hs.indexOf('elements (3)');
    expect(sheets).toBeGreaterThan(0);
    expect(hs.indexOf('Charlie')).toBeGreaterThan(sheets);
    expect(linked).toBeGreaterThan(hs.indexOf('Charlie'));
    expect(hs.indexOf('Alpha')).toBeGreaterThan(linked);
    expect(list).toBeGreaterThan(hs.indexOf('Alpha'));
    expect(hs.indexOf('linkedElements (2)')).toBeGreaterThan(list);
    // Control characters are gone, the text is kept
    expect(document).toContain('Bravo sale');
    expect(document).not.toMatch(/[\u0001]/);
    // Markdown is read, not copied
    expect(document).toContain('contexte');
    expect(document).not.toContain('**contexte**');
    // Web sources are followable
    expect(document).toContain('<w:hyperlink');
    expect(footer).toContain('generatedBy - ');
    expect(footer).toContain('zeroneurone.com');
    expect(footerRels).toContain('Target="https://zeroneurone.com"');
  });

  it('leads the names to the sheets and starts each part on a new page', async () => {
    const { document } = await docxParts({ sectionOrder: normalizeSectionOrder(['elements', 'fiches']) });
    expect(document).toMatch(/<w:bookmarkStart[^>]*w:name="fiche_c"/);
    expect(document).toMatch(/<w:hyperlink[^>]*w:anchor="fiche_c"/);
    expect(document.match(/<w:type w:val="nextPage"\/>/g)?.length ?? 0).toBeGreaterThan(0);
    // Sheets follow each other unless asked; with the option, each but the first starts a page
    expect(document).not.toContain('<w:pageBreakBefore/>');
    const perPage = await docxParts({ sectionOrder: normalizeSectionOrder(['fiches']), fichePerPage: true });
    expect(perPage.document.match(/<w:pageBreakBefore\/>/g)?.length).toBe(2);
    const flat = await docxParts({ pageBreaks: false, ficheLinks: false });
    expect(flat.document).not.toMatch(/w:val="nextPage"/);
    expect(flat.document).not.toMatch(/<w:hyperlink[^>]*w:anchor=/);
  });
});
