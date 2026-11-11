import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { disableLock, enableLock, lockSupport, LockUnsupportedError, setLockDelay } from './lock';
import { DEFAULT_LOCK_DELAY, LOCK_DELAYS, readLock } from './lockState';
import { currentRoute, navigate } from './router';
import { dangerButton, inputClass, secondaryButton, sectionTitle } from './ui';

/** Turning the lock on or off, and its delay; offered only where the phone can */
export function LockSettings() {
  const { t } = useTranslation('companion');
  const [support, setSupport] = useState<'yes' | 'no' | 'unknown' | null>(null);
  const [enabled, setEnabled] = useState(() => readLock() !== null);
  const [delay, setDelay] = useState(() => readLock()?.timeoutMin ?? DEFAULT_LOCK_DELAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void lockSupport().then((s) => { if (!cancelled) setSupport(s); });
    return () => { cancelled = true; };
  }, []);

  /** The open dossier was closed to encrypt or decrypt it: back home */
  const leaveDossier = () => { if (currentRoute().kind === 'dossier') navigate('', true); };

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableLock(delay);
      setEnabled(true);
      leaveDossier();
    } catch (err) {
      console.warn('[Companion] lock not enabled:', err);
      setError(err instanceof LockUnsupportedError ? t('lock.unavailable') : t('lock.failed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await disableLock();
      setEnabled(false);
      setConfirmOff(false);
      leaveDossier();
    } catch (err) {
      console.warn('[Companion] lock not disabled:', err);
      setError(t('lock.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (support === null) return null;
  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>{t('lock.title')}</h2>
      {!enabled ? (
        support === 'no' ? (
          <p className="text-sm text-text-tertiary">{t('lock.unavailable')}</p>
        ) : (
          <button type="button" className={`${secondaryButton} w-full`} onClick={turnOn} disabled={busy}>
            <Lock size={16} />
            {t('lock.enable')}
          </button>
        )
      ) : (
        <>
          <select
            className={inputClass}
            value={delay}
            onChange={(e) => { const v = Number(e.target.value); setDelay(v); setLockDelay(v); }}
            aria-label={t('lock.delay')}
          >
            {LOCK_DELAYS.map((d) => (
              <option key={d} value={d}>{d === 0 ? t('lock.immediately') : t('lock.after', { count: d })}</option>
            ))}
          </select>
          {confirmOff ? (
            <div className="flex gap-2">
              <button type="button" className={`${secondaryButton} flex-1`} onClick={() => setConfirmOff(false)} disabled={busy}>{t('cancel')}</button>
              <button type="button" className={`${dangerButton} flex-1`} onClick={turnOff} disabled={busy}>{t('lock.disable')}</button>
            </div>
          ) : (
            <button type="button" className={`${dangerButton} w-full`} onClick={() => setConfirmOff(true)} disabled={busy}>
              {t('lock.disable')}
            </button>
          )}
        </>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </section>
  );
}
