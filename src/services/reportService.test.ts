// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportService, DEFAULT_REPORT_OPTIONS, normalizeSectionOrder, REPORT_SECTIONS } from './reportService';

vi.mock('i18next', () => ({
  default: { t: (key: string) => key, language: 'en', changeLanguage: () => {} },
}));

describe('reportService.openForPrint', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  function makePrintWindow() {
    const listeners: Record<string, (() => void)[]> = {};
    return {
      print: vi.fn(),
      addEventListener: vi.fn((event: string, cb: () => void) => {
        (listeners[event] ??= []).push(cb);
      }),
      fire(event: string) {
        for (const cb of listeners[event] ?? []) cb();
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom does not implement the Blob URL store.
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.useRealTimers();
    openSpy?.mockRestore();
  });

  it('prints once the document has loaded, then releases the Blob URL', () => {
    const printWindow = makePrintWindow();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    reportService.openForPrint('<html><body>report</body></html>');

    expect(openSpy).toHaveBeenCalledWith('blob:mock-url', '_blank');
    // Nothing happens until the document is actually rendered.
    expect(printWindow.print).not.toHaveBeenCalled();

    printWindow.fire('load');
    expect(printWindow.print).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('does not print twice when the fallback timer also fires', () => {
    const printWindow = makePrintWindow();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    reportService.openForPrint('<html><body>report</body></html>');
    printWindow.fire('load');
    vi.advanceTimersByTime(5000);

    expect(printWindow.print).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('still prints when the load event fired before we subscribed', () => {
    const printWindow = makePrintWindow();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    reportService.openForPrint('<html><body>report</body></html>');
    // No 'load' ever delivered.
    vi.advanceTimersByTime(5000);

    expect(printWindow.print).toHaveBeenCalledTimes(1);
  });

  it('releases the Blob URL when the popup is blocked', () => {
    openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    reportService.openForPrint('<html><body>report</body></html>');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('reportService HTML output hardening', () => {
  const HOSTILE = 'x" onerror="alert(1)';

  const dossier = { id: 'd1', name: 'Enquête', createdAt: new Date(), updatedAt: new Date() } as never;

  const element = {
    id: 'e1',
    dossierId: 'd1',
    label: 'Cible',
    tags: [],
    properties: [],
    assetIds: ['a1'],
    events: [],
    position: { x: 0, y: 0 },
    visual: { color: '#888', shape: 'rectangle' },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;

  const asset = {
    id: 'a1',
    dossierId: 'd1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    hash: 'abc',
    opfsPath: 'dossiers/d1/assets/abc.jpg',
    // Reaches us verbatim from a collaboration peer: the SHA-256 check covers
    // the binary, never this string.
    thumbnailDataUrl: HOSTILE,
    extractedText: null,
    createdAt: new Date(),
  } as never;

  const options = {
    title: 'Rapport',
    includeDescription: false,
    includeSummary: false,
    includeElements: true,
    includeLinks: false,
    includeInsights: false,
    includeTimeline: false,
    includeProperties: false,
    includeFiles: true,
    includeFiches: true,
    groupElementsByTag: false,
    sortElementsBy: 'label',
    tableFormat: false,
  } as never;

  function render(): string {
    return reportService.generate('html', dossier, [element], [], [asset], options, 'fr');
  }

  it('does not emit a peer-controlled thumbnail into an img src', () => {
    const html = render();
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain(HOSTILE);
  });

  it('carries a Content-Security-Policy', () => {
    // openForPrint opens this document through a same-origin blob: URL, so it
    // inherits the app origin. The document has no script of its own.
    const html = render();
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
  });

  it('still renders a legitimate thumbnail', () => {
    const good = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=';
    const html = reportService.generate(
      'html', dossier, [element], [], [{ ...(asset as object), thumbnailDataUrl: good } as never], options, 'fr'
    );
    expect(html).toContain(good);
  });
});

describe('reportService — files attached to links', () => {
  const dossier = { id: 'd1', name: 'Enquête', createdAt: new Date(), updatedAt: new Date() } as never;
  const el = (id: string, label: string) => ({
    id, dossierId: 'd1', label, tags: [], properties: [], assetIds: [], events: [], notes: '',
    position: { x: 0, y: 0 }, visual: { color: '#888', shape: 'rectangle' }, createdAt: new Date(), updatedAt: new Date(),
  }) as never;
  const link = {
    id: 'l1', dossierId: 'd1', fromId: 'a', toId: 'b', label: 'Vente', notes: '', directed: true, tags: [],
    properties: [], assetIds: ['deed'], createdAt: new Date(), updatedAt: new Date(),
  } as never;
  const deed = {
    id: 'deed', dossierId: 'd1', filename: 'acte.pdf', mimeType: 'application/pdf', size: 4096, hash: 'h',
    opfsPath: 'x', thumbnailDataUrl: null, extractedText: null, createdAt: new Date(),
  } as never;
  const options = {
    title: 'Rapport', includeDescription: false, includeSummary: false, includeElements: false, includeLinks: true,
    includeInsights: false, includeTimeline: false, includeProperties: false, includeFiles: true, includeFiches: false,
    groupElementsByTag: false, sortElementsBy: 'label', tableFormat: false,
  } as never;
  const render = (format: 'html' | 'markdown') =>
    reportService.generate(format, dossier, [el('a', 'Vendeur'), el('b', 'Acheteur')], [link], [deed], options, 'fr');

  it('lists them with the link they belong to, in HTML', () => {
    const html = render('html');
    expect(html).toContain('acte.pdf');
    expect(html).toContain('Vendeur → Acheteur (Vente) - 4.0 Ko');
  });

  it('lists them with the link they belong to, in Markdown', () => {
    const md = render('markdown');
    expect(md).toContain('| Vendeur | Acheteur | → | Vente | - | acte.pdf |');
    expect(md).toContain('| Vendeur → Acheteur (Vente) | acte.pdf | application/pdf | 4.0 Ko |');
  });
});

describe('reportService — order of the parts, scope first, origin', () => {
  const dossier = { id: 'd1', name: 'Enquête', description: 'Contexte', createdAt: new Date(), updatedAt: new Date() } as never;
  const el = (id: string, label: string) => ({
    id, dossierId: 'd1', label, tags: [], properties: [{ key: 'k', value: 'v', type: 'text' }], assetIds: [], events: [], notes: '',
    position: { x: 0, y: 0 }, visual: { color: '#888', shape: 'rectangle' }, createdAt: new Date(), updatedAt: new Date(),
  }) as never;
  const elements = [el('a', 'Alpha'), el('b', 'Bravo'), el('c', 'Charlie')];
  const links = [{ id: 'l1', fromId: 'c', toId: 'a', label: '', notes: '', directed: false, assetIds: [] }] as never[];
  const base = {
    ...DEFAULT_REPORT_OPTIONS, title: 'Rapport', includeSummary: false, includeInsights: false, includeTimeline: false,
    includeLinks: false, includeFiches: true,
  };
  const at = (text: string, part: string) => text.indexOf(part);

  it('makes a stored order valid', () => {
    expect(normalizeSectionOrder(['fiches', 'bogus', 'fiches', 3])).toEqual(['fiches', ...REPORT_SECTIONS.filter((s) => s !== 'fiches')]);
    expect(normalizeSectionOrder(null)).toEqual([...REPORT_SECTIONS]);
  });

  it('writes the parts in the chosen order, in HTML and Markdown', () => {
    const options = { ...base, sectionOrder: normalizeSectionOrder(['fiches', 'elements', 'description']) };
    const html = reportService.generate('html', dossier, elements, links, [], options, 'fr');
    expect(at(html, 'content.detailedSheets')).toBeLessThan(at(html, '<h2>modals:synthesis.content.elements'));
    expect(at(html, '<h2>modals:synthesis.content.elements')).toBeLessThan(at(html, 'class="description'));
    const md = reportService.generate('markdown', dossier, elements, links, [], options, 'fr');
    expect(at(md, '## modals:synthesis.content.detailedSheets')).toBeLessThan(at(md, '## modals:synthesis.content.elements'));
    expect(at(md, '## modals:synthesis.content.elements')).toBeLessThan(at(md, '> Contexte'));
  });

  it('puts the elements of the scope first, the linked ones after with their heading', () => {
    const options = { ...base, primaryElementIds: ['c'] };
    const html = reportService.generate('html', dossier, elements, links, [], options, 'fr');
    const list = html.slice(at(html, '<h2>modals:synthesis.content.elements'), at(html, 'content.detailedSheets'));
    expect(at(list, 'Charlie')).toBeLessThan(at(list, 'content.linkedElements'));
    expect(at(list, 'content.linkedElements')).toBeLessThan(at(list, 'Alpha'));
    expect(at(list, 'Alpha')).toBeLessThan(at(list, 'Bravo'));
    const sheets = html.slice(at(html, 'content.detailedSheets'));
    expect(sheets).toContain('content.detailedSheets (1)');
    expect(at(sheets, '>Charlie</h3>')).toBeLessThan(at(sheets, 'content.linkedSheets (2)'));
    expect(at(sheets, 'content.linkedSheets (2)')).toBeLessThan(at(sheets, '>Alpha</h3>'));
    const md = reportService.generate('markdown', dossier, elements, links, [], options, 'fr');
    expect(at(md, '### Charlie')).toBeLessThan(at(md, '## modals:synthesis.content.linkedSheets (2)'));
  });

  it('leaves the order alone without linked elements', () => {
    const html = reportService.generate('html', dossier, elements, links, [], base, 'fr');
    expect(html).not.toContain('linkedElements');
    expect(html).not.toContain('linkedSheets');
    expect(at(html, '>Alpha<')).toBeLessThan(at(html, '>Charlie<'));
  });

  it('names its origin at the end, and on printed pages', () => {
    const html = reportService.generate('html', dossier, elements, links, [], base, 'fr');
    expect(html).toContain('<footer class="generated-by">modals:synthesis.content.generatedBy - <a href="https://zeroneurone.com"');
    expect(html).toContain('@bottom-center { content: "modals:synthesis.content.generatedBy - zeroneurone.com"');
    const md = reportService.generate('markdown', dossier, elements, links, [], base, 'fr');
    expect(md.trimEnd().endsWith('*modals:synthesis.content.generatedBy - [zeroneurone.com](https://zeroneurone.com)*')).toBe(true);
  });

  it('shows the map and timeline captures as images', () => {
    const options = { ...base, sectionOrder: normalizeSectionOrder(['timelineView', 'map']), mapSvg: '<svg id="m"/>', timelineSvg: '<svg id="t"/>' };
    const html = reportService.generate('html', dossier, elements, links, [], options, 'fr');
    const mapAt = at(html, `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg id="m"/>')}`);
    const tlAt = at(html, `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg id="t"/>')}`);
    expect(tlAt).toBeGreaterThan(0);
    expect(mapAt).toBeGreaterThan(tlAt);
    expect(html).not.toContain('<svg id=');
  });
});

describe('reportService — sheets of linked elements only', () => {
  it('writes no empty heading for the scope', () => {
    const dossier = { id: 'd1', name: 'E', createdAt: new Date(), updatedAt: new Date() } as never;
    const el = (id: string, notes: string) => ({
      id, dossierId: 'd1', label: id.toUpperCase(), tags: [], properties: [], assetIds: [], events: [], notes,
      position: { x: 0, y: 0 }, visual: { color: '#888', shape: 'rectangle' }, createdAt: new Date(), updatedAt: new Date(),
    }) as never;
    const options = { ...DEFAULT_REPORT_OPTIONS, includeFiches: true, primaryElementIds: ['a'] };
    const elements = [el('a', ''), el('b', 'note')];
    for (const format of ['html', 'markdown'] as const) {
      const out = reportService.generate(format, dossier, elements, [], [], options, 'fr');
      expect(out).not.toContain('content.detailedSheets');
      expect(out).toContain('content.linkedSheets (1)');
    }
  });
});

describe('reportService — sheets reached from the names, page breaks, files first', () => {
  const dossier = { id: 'd1', name: 'E', createdAt: new Date(), updatedAt: new Date() } as never;
  const el = (id: string, notes: string, assetIds: string[] = []) => ({
    id, dossierId: 'd1', label: id.toUpperCase(), tags: [], properties: [], assetIds, events: [], notes,
    position: { x: 0, y: 0 }, visual: { color: '#888', shape: 'rectangle' }, createdAt: new Date(), updatedAt: new Date(),
  }) as never;
  const photo = { id: 'p', filename: 'photo.jpg', mimeType: 'image/jpeg', size: 1024, thumbnailDataUrl: null } as never;
  const elements = [el('a1', 'note', ['p']), el('b2', '')];
  const links = [{ id: 'l', fromId: 'b2', toId: 'a1', label: '', notes: '', directed: true, assetIds: [] }] as never[];
  const base = { ...DEFAULT_REPORT_OPTIONS, includeFiches: true, includeInsights: false, includeFiles: false };

  it('links the names of elements that have a sheet to it', () => {
    const html = reportService.generate('html', dossier, elements, links, [photo], base, 'fr');
    expect(html).toContain('<div class="fiche" id="fiche_a1">');
    expect(html).toContain('<a class="fiche-link" href="#fiche_a1">A1</a>');
    // B2 has nothing to show: no sheet, no link
    expect(html).not.toContain('#fiche_b2');
  });

  it('writes plain names without the option', () => {
    const html = reportService.generate('html', dossier, elements, links, [photo], { ...base, ficheLinks: false }, 'fr');
    expect(html).not.toContain('fiche-link"');
  });

  it('breaks the page between parts only when asked', () => {
    const on = reportService.generate('html', dossier, elements, links, [photo], base, 'fr');
    const off = reportService.generate('html', dossier, elements, links, [photo], { ...base, pageBreaks: false }, 'fr');
    expect(on.split('<div class="page-break"></div>').length - 1).toBeGreaterThan(0);
    expect(off).not.toContain('<div class="page-break"></div>');
  });

  it('starts each sheet on a new page only when asked, not the first after a heading', () => {
    const many = [el('a1', 'note'), el('b2', 'note'), el('c3', 'note')];
    const on = reportService.generate('html', dossier, many, [], [], { ...base, fichePerPage: true, primaryElementIds: ['a1', 'b2'] }, 'fr');
    expect(on).toContain('<div class="fiche" id="fiche_a1">');
    expect(on).toContain('<div class="fiche new-page" id="fiche_b2">');
    expect(on).toContain('<section class="new-page">');
    expect(on).toContain('<div class="fiche" id="fiche_c3">');
    const off = reportService.generate('html', dossier, many, [], [], base, 'fr');
    expect(off).not.toMatch(/class="[^"]*new-page/);
  });

  it('shows the files at the top of the sheet', () => {
    const html = reportService.generate('html', dossier, elements, links, [photo], base, 'fr');
    const sheet = html.slice(html.indexOf('id="fiche_a1"'));
    expect(sheet.indexOf('photo.jpg')).toBeLessThan(sheet.indexOf('content.identity'));
    const md = reportService.generate('markdown', dossier, elements, links, [photo], base, 'fr');
    const mdSheet = md.slice(md.indexOf('### A1'));
    expect(mdSheet.indexOf('photo.jpg')).toBeLessThan(mdSheet.indexOf('content.identity'));
  });
});
