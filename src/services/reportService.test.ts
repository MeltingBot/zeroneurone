// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportService } from './reportService';

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
