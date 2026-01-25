import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// =============================================================================
// DYNAMIC LANGUAGE LOADING
// To add a new language:
// 1. Add entry to /public/locales/languages.json
// 2. Create translation files in /public/locales/{code}/
//    (common.json, modals.json, panels.json, pages.json)
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

// Use Vite's import.meta.glob to dynamically import all translation files
// The { eager: true } makes them available synchronously at startup
const translationModules = import.meta.glob('./locales/*/!(languages).json', { eager: true });

// Build the resources object dynamically from the glob imports
function buildResources(): Record<string, Record<string, unknown>> {
  const resources: Record<string, Record<string, unknown>> = {};

  for (const [path, module] of Object.entries(translationModules)) {
    // Path format: ../public/locales/{lang}/{namespace}.json
    const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (match) {
      const [, lang, namespace] = match;
      if (!resources[lang]) {
        resources[lang] = {};
      }
      resources[lang][namespace] = (module as { default: unknown }).default;
    }
  }

  return resources;
}

export const resources = buildResources();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    defaultNS: 'common',
    ns: ['common', 'modals', 'panels', 'pages'],

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'zeroneurone-lang',
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
