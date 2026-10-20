import { useTranslation } from 'react-i18next';
import { useImportProgress } from '../../services/importProgress';

/** Elements and links written by the running import; nothing when idle. */
export function ImportProgressLine({ className = 'text-xs text-text-secondary' }: { className?: string }) {
  const { t, i18n } = useTranslation('modals');
  const progress = useImportProgress();
  if (!progress.active || progress.elements + progress.links === 0) return null;
  const format = (n: number) => n.toLocaleString(i18n.language);
  return (
    <p className={className} aria-live="polite" data-testid="import-progress">
      {t('import.progress', { elements: format(progress.elements), links: format(progress.links) })}
    </p>
  );
}
