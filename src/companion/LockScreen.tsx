/**
 * The companion locked: nothing of the dossiers shown, unlocked from a tap
 * (Face ID, fingerprint or the phone's code). Also the way out when the
 * passkey is gone: forgetting everything kept on the phone.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Lock, Trash2, X } from 'lucide-react';
import { IconAction } from './IconAction';
import { forgetEverything, unlock, unsentChanges } from './lock';
import { readLock } from './lockState';
import { primaryButton } from './ui';

export function LockScreen({ onUnlocked, cover = false }: {
  onUnlocked: () => void;
  /** Over the app after a while in the background: the app stays as it was */
  cover?: boolean;
}) {
  const { t } = useTranslation('companion');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const count = readLock()?.dossierIds.length ?? 0;
  const unsent = unsentChanges();

  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await unlock();
      onUnlocked();
    } catch (err) {
      console.warn('[Companion] unlock failed:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const forgetAll = async () => {
    setBusy(true);
    try {
      await forgetEverything();
    } finally {
      window.location.replace(window.location.pathname.replace(/\/m\/.*$/, '/m/'));
    }
  };

  return (
    <div className={`${cover ? 'fixed inset-0 z-[60]' : 'min-h-dvh'} flex flex-col items-center justify-center gap-6 px-8 bg-bg-primary text-text-primary`} role="dialog" aria-label={t('lock.title')}>
      <Lock size={36} className="text-text-tertiary" />
      <button type="button" className={`${primaryButton} min-w-48`} onClick={open} disabled={busy}>
        <Fingerprint size={18} />
        {t('lock.unlock')}
      </button>
      {failed && <p className="text-sm text-error text-center">{t('lock.failed')}</p>}
      {!cover && (forgetting ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm">{t('lock.forgetConfirm', { count })}</p>
          {unsent > 0 && <p className="text-sm text-error">{t('settings.forgetPending', { count: unsent })}</p>}
          <div className="flex gap-2">
            <IconAction icon={X} label={t('cancel')} onClick={() => setForgetting(false)} />
            <IconAction icon={Trash2} label={t('lock.forgetAll')} variant="confirm" onClick={forgetAll} disabled={busy} />
          </div>
        </div>
      ) : (
        <button type="button" className="text-xs text-text-tertiary underline" onClick={() => setForgetting(true)}>
          {t('lock.forgetAll')}
        </button>
      ))}
    </div>
  );
}
