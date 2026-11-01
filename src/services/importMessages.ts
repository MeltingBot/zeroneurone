/** Import messages (errors and warnings) in the interface language */

import i18next from 'i18next';
import frImportData from '../locales/fr/importData.json';

function interpolate(text: string, options?: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    options && name in options ? String(options[name]) : match
  );
}

/**
 * Text of `importData:<key>`. Before i18next is initialised (unit tests,
 * early errors), falls back to the French text of the same key.
 */
export function importMessage(key: string, options?: Record<string, unknown>): string {
  if (i18next.isInitialized && i18next.exists(`importData:${key}`)) {
    return i18next.t(`importData:${key}`, options ?? {}) as string;
  }
  const french = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], frImportData);
  return typeof french === 'string' ? interpolate(french, options) : key;
}

/** Message of an unexpected error caught during an import */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : importMessage('common.unknownError');
}
