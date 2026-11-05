import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, X } from 'lucide-react';
import type { SheetTable } from '../../utils/spreadsheet';

interface SheetPickerModalProps {
  workbookName: string;
  /** Sheets holding a header and at least one row */
  sheets: SheetTable[];
  onPick: (sheet: SheetTable) => void;
  onCancel: () => void;
}

/** Which sheet of a workbook (XLSX, ODS) to import: one click picks it */
export function SheetPickerModal({ workbookName, sheets, onPick, onCancel }: SheetPickerModalProps) {
  const { t } = useTranslation('modals');
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-bg-primary border border-border-default rounded shadow-lg sketchy-border-soft w-[360px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('import.sheet.title')}
        data-testid="sheet-picker"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">{t('import.sheet.title')}</h2>
            <div className="text-xs text-text-tertiary truncate">{workbookName}</div>
          </div>
          <button onClick={onCancel} className="p-1 rounded text-text-secondary hover:bg-bg-secondary" aria-label={t('common:actions.cancel')}>
            <X size={16} />
          </button>
        </div>
        <ul className="overflow-y-auto py-1">
          {sheets.map((sheet) => (
            <li key={sheet.name}>
              <button
                onClick={() => onPick(sheet)}
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-bg-secondary"
              >
                <FileSpreadsheet size={16} className="text-text-secondary shrink-0" />
                <span className="flex-1 truncate">{sheet.name}</span>
                <span className="text-xs text-text-tertiary shrink-0">
                  {t('import.sheet.rows', { count: sheet.rows.length - 1 })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default bg-bg-secondary">
          <button
            onClick={onCancel}
            className="border border-border-default text-text-primary bg-bg-primary hover:bg-bg-secondary px-3 py-1.5 text-sm font-medium rounded sketchy-border"
          >
            {t('common:actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
