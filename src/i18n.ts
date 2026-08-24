import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// =============================================================================
// DYNAMIC LANGUAGE LOADING
// To add a new language:
// 1. Add entry to /public/locales/languages.json
// 2. Create translation files in /public/locales/{code}/
//    (common.json, modals.json, panels.json, pages.json, importData.json)
// That's it! No code changes needed.
// =============================================================================

export interface LanguageConfig {
  code: string;
  label: string;  // Native name (e.g., "Deutsch" not "German")
  flag: string;   // Emoji flag
}

// Import languages.json - this is the single source of truth
import languagesConfig from './locales/languages.json';
export const SUPPORTED_LANGUAGES: LanguageConfig[] = languagesConfig;

export const FALLBACK_LANGUAGE = 'en';
export const NAMESPACES = ['common', 'modals', 'panels', 'pages', 'importData'];

const LANGUAGE_STORAGE_KEY = 'zeroneurone-lang';

type Bundle = Record<string, unknown>;
type Loader = () => Promise<{ default: Bundle }>;

// Loaded on demand, not eagerly: the eleven languages weigh ~700 KB together,
// and a session uses one. Each becomes its own chunk.
const translationLoaders = import.meta.glob('./locales/*/!(languages).json') as Record<string, Loader>;

// path → { [lang]: { [namespace]: loader } }
const loadersByLanguage = Object.entries(translationLoaders).reduce<Record<string, Record<string, Loader>>>(
  (acc, [path, loader]) => {
    const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (match) {
      const [, lang, namespace] = match;
      (acc[lang] ??= {})[namespace] = loader;
    }
    return acc;
  },
  {}
);

async function readBundles(lang: string): Promise<Record<string, Bundle>> {
  const loaders = loadersByLanguage[lang];
  if (!loaders) return {};
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([namespace, load]) => [namespace, (await load()).default] as const)
  );
  return Object.fromEntries(entries);
}

/**
 * Make sure a language is available before switching to it.
 * Safe to call repeatedly: bundles already present are not re-fetched.
 */
export async function ensureLanguageLoaded(lang: string): Promise<void> {
  if (!loadersByLanguage[lang]) return;
  if (NAMESPACES.every((ns) => i18n.hasResourceBundle(lang, ns))) return;

  const bundles = await readBundles(lang);
  for (const [namespace, bundle] of Object.entries(bundles)) {
    i18n.addResourceBundle(lang, namespace, bundle, true, true);
  }
}

/** Load then switch, so the UI never renders raw keys. */
export async function changeLanguage(lang: string): Promise<void> {
  await ensureLanguageLoaded(lang);
  await i18n.changeLanguage(lang);
}

/**
 * Mirrors what LanguageDetector would pick with order ['localStorage',
 * 'navigator'], so we can fetch the right bundles before init.
 */
function detectLanguage(): string {
  const codes = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && codes.has(stored)) return stored;
  } catch {
    // localStorage can throw in private browsing; fall through to navigator.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.split('-')[0];
    if (base && codes.has(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}

let initPromise: Promise<typeof i18n> | null = null;

/** Initialise i18next with only the language actually needed. */
export function initI18n(): Promise<typeof i18n> {
  initPromise ??= (async () => {
    const lng = detectLanguage();
    // The fallback is loaded too, so a key missing from a translation still
    // resolves instead of showing up raw.
    const [primary, fallback] = await Promise.all([
      readBundles(lng),
      lng === FALLBACK_LANGUAGE ? Promise.resolve({}) : readBundles(FALLBACK_LANGUAGE),
    ]);

    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        lng,
        resources: {
          [lng]: primary,
          ...(lng === FALLBACK_LANGUAGE ? {} : { [FALLBACK_LANGUAGE]: fallback }),
        },
        fallbackLng: FALLBACK_LANGUAGE,
        defaultNS: 'common',
        ns: NAMESPACES,

        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        },

        interpolation: {
          escapeValue: false, // React already escapes
        },
      });

    // Anything switching language outside changeLanguage() above — a plugin,
    // or a restored preference — still gets its bundles.
    i18n.on('languageChanged', (next) => {
      void ensureLanguageLoaded(next);
    });

    return i18n;
  })();

  return initPromise;
}

export default i18n;
