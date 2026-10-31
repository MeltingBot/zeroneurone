import type { PhoneParser } from './normalizers';

/**
 * libphonenumber, loaded the first time the duplicates rule needs it (its
 * own chunk: the app does not pay for it until then).
 */
let parser: PhoneParser | null = null;
let loading: Promise<PhoneParser | null> | null = null;

/** The parser if already loaded, null otherwise (French numbers only then) */
export function getPhoneParser(): PhoneParser | null {
  return parser;
}

export function loadPhoneParser(): Promise<PhoneParser | null> {
  if (parser) return Promise.resolve(parser);
  loading ??= import('libphonenumber-js/min')
    .then(({ parsePhoneNumberFromString }) => {
      parser = (text) => {
        const number = parsePhoneNumberFromString(text, 'FR');
        return number && number.isValid() ? number.number : null;
      };
      return parser;
    })
    .catch((error) => {
      console.warn('[Duplicates] Phone library unavailable, French numbers only:', error);
      loading = null;
      return null;
    });
  return loading;
}
