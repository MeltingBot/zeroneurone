import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useExportProgress } from '../../services/exportProgress';

/**
 * Progress of the archive being built, wherever the export started (the
 * dossier's export window, a card of the dossier list). Mounted once for the
 * whole app; shown only while an export runs, and it cannot be closed.
 */
export function ExportProgressModal() {
  const { t } = useTranslation(['modals', 'common']);
  const progress = useExportProgress();
  if (!progress.active) return null;

  const percent = progress.phase === 'files'
    ? Math.round((progress.done / Math.max(1, progress.total)) * 100)
    : progress.phase === 'compress' ? Math.round(progress.done)
      : progress.phase === 'encrypt' ? 100 : 0;
  const text = progress.phase === 'files'
    ? t('modals:export.progress.files', { done: progress.done, total: progress.total })
    : progress.phase === 'compress'
      ? t('modals:export.progress.compress', { percent: Math.round(progress.done) })
      : progress.phase === 'encrypt' ? t('modals:export.progress.encrypt')
        : progress.phase === 'data' ? t('modals:export.progress.data') : t('modals:export.progress.preparing');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" data-testid="export-progress-modal">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-progress-title"
        className="w-80 bg-bg-primary border border-border-default rounded shadow-lg sketchy-border-soft"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
          <Loader2 size={14} className="animate-spin text-text-secondary" />
          <h2 id="export-progress-title" className="text-sm font-semibold text-text-primary">
            {t('common:activity.export')}
          </h2>
        </div>
        <div className="px-4 py-4 space-y-2" aria-live="polite">
          <p className="text-xs text-text-secondary">{text}</p>
          <div className="h-1 bg-bg-tertiary rounded overflow-hidden">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
