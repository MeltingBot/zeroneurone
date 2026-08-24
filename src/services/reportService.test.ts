// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportService } from './reportService';

vi.mock('i18next', () => ({
  default: { t: (key: string) => key, language: 'en' },
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
