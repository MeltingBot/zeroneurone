import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SheetPickerModal } from '../components/modals/SheetPickerModal';
import { isSpreadsheetFile, readSpreadsheet, sheetAsCsvFile, sheetsWithData, type SheetTable } from '../utils/spreadsheet';

/** What a file becomes before the import: itself, the CSV of the sheet chosen, nothing (cancelled) or an error */
export type SpreadsheetOutcome = { file: File } | { cancelled: true } | { error: string };

/**
 * A workbook (XLSX, ODS) goes through the CSV import: its sheet is turned
 * into a CSV file, then imported as any CSV (native columns, or the column
 * mapping). Several sheets with data: the user picks one. Other files pass
 * through unchanged. Render `picker` in the modal that uses it.
 */
export function useSpreadsheetToCsv() {
  const { t } = useTranslation('modals');
  const [pending, setPending] = useState<{ name: string; sheets: SheetTable[] } | null>(null);
  const resolveRef = useRef<((sheet: SheetTable | null) => void) | null>(null);

  const toCsv = useCallback(async (file: File): Promise<SpreadsheetOutcome> => {
    if (!isSpreadsheetFile(file.name)) return { file };
    let sheets: SheetTable[];
    try {
      sheets = sheetsWithData(await readSpreadsheet(await file.arrayBuffer(), file.name));
    } catch {
      return { error: t('import.sheet.unreadable') };
    }
    if (sheets.length === 0) return { error: t('import.sheet.empty') };
    if (sheets.length === 1) return { file: sheetAsCsvFile(file.name, sheets[0], true) };
    const sheet = await new Promise<SheetTable | null>((resolve) => {
      resolveRef.current = resolve;
      setPending({ name: file.name, sheets });
    });
    return sheet ? { file: sheetAsCsvFile(file.name, sheet, false) } : { cancelled: true };
  }, [t]);

  const settle = (sheet: SheetTable | null) => {
    resolveRef.current?.(sheet);
    resolveRef.current = null;
    setPending(null);
  };

  const picker = pending ? (
    <SheetPickerModal
      workbookName={pending.name}
      sheets={pending.sheets}
      onPick={(sheet) => settle(sheet)}
      onCancel={() => settle(null)}
    />
  ) : null;

  return { toCsv, picker };
}
