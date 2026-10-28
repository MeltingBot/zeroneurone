import { useTranslation } from 'react-i18next';
import { useImportProgress } from '../../services/importProgress';

/** Media, elements and links written by the running import; nothing when idle. */
export function ImportProgressLine({ className = 'text-xs text-text-secondary' }: { className?: string }) {
  const { t, i18n } = useTranslation('modals');
  const progress = useImportProgress();
  if (!progress.active) return null;
  const { media } = progress;
  const hasMedia = media !== null && media.total > 0;
  const hasRows = progress.elements + progress.links > 0;
  if (!hasMedia && !hasRows) return null;
  const format = (n: number) => n.toLocaleString(i18n.language);
  return (
    <p className={className} aria-live="polite" data-testid="import-progress">
      {hasMedia && t('import.progressMedia', { done: format(media.done), total: format(media.total) })}
      {hasMedia && hasRows && ' · '}
      {hasRows && t('import.progress', { elements: format(progress.elements), links: format(progress.links) })}
    </p>
  );
}
