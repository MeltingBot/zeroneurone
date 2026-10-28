import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { usePluginWriteLocks } from '../../utils/dossierLock';

/** Shown while a plugin suspends writes (reason given by the plugin) */
export function WriteLockBanner() {
  const { t } = useTranslation('common');
  const reason = usePluginWriteLocks((s) => Object.values(s.locks)[0] ?? null);
  if (!reason) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-text-primary bg-bg-tertiary border-b border-border-default">
      <Lock size={12} className="text-warning" />
      {t('dossierLock.plugin', { reason })}
    </div>
  );
}
