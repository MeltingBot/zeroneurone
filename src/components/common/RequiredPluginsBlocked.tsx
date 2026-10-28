import { useTranslation } from 'react-i18next';
import type { RequiredPluginFailure } from '../../plugins/requiredPlugins';

/** Replaces the app when a plugin required by the host could not be loaded */
export function RequiredPluginsBlocked({ failures }: { failures: RequiredPluginFailure[] }) {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-4">
      <div className="max-w-md w-full bg-bg-primary border border-border-default rounded p-6 space-y-3">
        <h1 className="text-sm font-semibold text-text-primary">{t('requiredPlugins.title')}</h1>
        <ul className="space-y-1">
          {failures.map((f) => (
            <li key={f.id} className="text-sm text-text-primary">
              {f.name} <span className="text-xs text-text-tertiary">({t(`requiredPlugins.reason.${f.reason}`)})</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-secondary">{t('requiredPlugins.contact')}</p>
      </div>
    </div>
  );
}
