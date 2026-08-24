import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onPersistFailure, isQuotaExceeded, resetPersistFailureThrottle } from './persistError';
import { useToastStore } from '../stores/toastStore';

vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}));

describe('isQuotaExceeded', () => {
  it('recognises a plain DOMException name', () => {
    expect(isQuotaExceeded({ name: 'QuotaExceededError' })).toBe(true);
  });

  it('recognises the error Dexie wraps in `inner`', () => {
    expect(
      isQuotaExceeded({ name: 'OpenFailedError', inner: { name: 'QuotaExceededError' } })
    ).toBe(true);
  });

  it('recognises Dexie own error name', () => {
    expect(isQuotaExceeded({ name: 'QuotaExceeded' })).toBe(true);
  });

  it('follows a `cause` chain', () => {
    expect(isQuotaExceeded({ name: 'A', cause: { name: 'QuotaExceededError' } })).toBe(true);
  });

  it('says no for unrelated errors and non-objects', () => {
    expect(isQuotaExceeded(new Error('boom'))).toBe(false);
    expect(isQuotaExceeded({ name: 'AbortError' })).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
    expect(isQuotaExceeded('QuotaExceededError')).toBe(false);
  });

  it('does not loop forever on a self-referencing chain', () => {
    const err: Record<string, unknown> = { name: 'A' };
    err.inner = err;
    expect(isQuotaExceeded(err)).toBe(false);
  });
});

describe('onPersistFailure', () => {
  beforeEach(() => {
    resetPersistFailureThrottle();
    useToastStore.getState().clearToasts();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces a toast through the store the container renders', () => {
    onPersistFailure(new Error('disk gone'), 'element.update');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('common:errors.persistFailed');
  });

  it('uses the dedicated message when the quota is exhausted', () => {
    onPersistFailure({ name: 'QuotaExceededError' }, 'element.update');

    expect(useToastStore.getState().toasts[0].message).toBe('common:errors.storageFull');
  });

  it('does not storm the user when a sync fails many writes at once', () => {
    for (let i = 0; i < 50; i++) {
      onPersistFailure(new Error('boom'), `write-${i}`);
    }

    expect(useToastStore.getState().toasts).toHaveLength(1);
    // Every failure is still traceable in the console.
    expect(console.error).toHaveBeenCalledTimes(50);
  });

  it('notifies again once the quiet window has passed', () => {
    vi.useFakeTimers();
    try {
      onPersistFailure(new Error('boom'), 'a');
      vi.setSystemTime(Date.now() + 31_000);
      onPersistFailure(new Error('boom'), 'b');

      expect(useToastStore.getState().toasts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
