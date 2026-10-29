import { useTranslation } from 'react-i18next';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { ImportProgressLine } from './ImportProgressLine';

/**
 * Blocks shared by the two import modals (new dossier from the home page,
 * into the open dossier), so that both show the same zones in the same order:
 * file drop zone, mapping assistant entry, CSV template.
 */

/** File zone: opens the file picker; shows the import progress while busy */
export function ImportDropZone({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslation('modals');
  return (
    <button
      onClick={onClick}
      disabled={busy}
      data-testid="import-drop-zone"
      className="w-full flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
    >
      <Download size={32} className="text-text-tertiary" />
      <div className="text-center">
        <div className="text-sm font-medium text-text-primary">
          {busy ? t('import.importing') : t('import.selectFile')}
        </div>
        <ImportProgressLine className="text-xs text-text-secondary mt-1" />
        <div className="text-xs text-text-tertiary mt-1">{t('import.supportedFormats')}</div>
        <div className="text-xs text-text-tertiary mt-0.5">{t('import.jsonFormats')}</div>
        <div className="text-xs text-text-tertiary mt-0.5">{t('import.genealogyFormats')}</div>
      </div>
    </button>
  );
}

/** Entry of the JSON / CSV mapping assistant */
export function ImportMappingEntry({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('modals');
  return (
    <button
      onClick={onClick}
      data-testid="import-open-mapping"
      className="w-full flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent hover:bg-accent/5 transition-colors text-left"
    >
      <FileJson size={16} className="text-text-secondary shrink-0" />
      <div>
        <div className="text-xs font-medium text-text-primary">{t('importJsonMapping.entryTitle')}</div>
        <div className="text-[11px] text-text-tertiary">{t('importJsonMapping.entryDescription')}</div>
      </div>
    </button>
  );
}

/** The native CSV format's template to download (the format is described in the user documentation) */
export function CsvTemplateCard({ onDownload }: { onDownload: () => void }) {
  const { t } = useTranslation('modals');
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border-default">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={14} className="text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">{t('import.csvTemplate.title')}</span>
        </div>
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-accent hover:bg-accent/5 rounded transition-colors"
        >
          <Download size={12} />
          {t('import.csvTemplate.download')}
        </button>
      </div>
    </div>
  );
}
