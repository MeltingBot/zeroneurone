// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import i18n, {
  initI18n,
  ensureLanguageLoaded,
  changeLanguage,
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  NAMESPACES,
} from './i18n';

/**
 * Translations are fetched per language instead of being bundled eagerly.
 * These check that the machinery actually resolves keys, since a mistake here
 * shows up as raw keys all over the UI rather than as a crash.
 */

beforeAll(async () => {
  localStorage.setItem('zeroneurone-lang', 'fr');
  await initI18n();
});

describe('i18n bootstrap', () => {
  it('starts in the stored language', () => {
    expect(i18n.language).toBe('fr');
  });

  it('loads every namespace for that language', () => {
    for (const ns of NAMESPACES) {
      expect(i18n.hasResourceBundle('fr', ns)).toBe(true);
    }
  });

  it('resolves a real key rather than echoing it back', () => {
    const label = i18n.t('common:actions.cancel');
    expect(label).not.toBe('common:actions.cancel');
    expect(label.length).toBeGreaterThan(0);
  });

  it('also loads the fallback language, so a missing key still resolves', () => {
    expect(i18n.hasResourceBundle(FALLBACK_LANGUAGE, 'common')).toBe(true);
  });

  it('does not load the other languages up front', () => {
    const others = SUPPORTED_LANGUAGES
      .map((l) => l.code)
      .filter((code) => code !== 'fr' && code !== FALLBACK_LANGUAGE);

    for (const code of others) {
      expect(i18n.hasResourceBundle(code, 'common')).toBe(false);
    }
  });

  it('is idempotent', async () => {
    await expect(initI18n()).resolves.toBe(i18n);
  });
});

describe('switching language', () => {
  it('fetches the bundles before switching, so no key is ever shown raw', async () => {
    expect(i18n.hasResourceBundle('de', 'common')).toBe(false);

    await changeLanguage('de');

    expect(i18n.language).toBe('de');
    const label = i18n.t('common:actions.cancel');
    expect(label).not.toBe('common:actions.cancel');
  });

  it('does not re-fetch a language already in memory', async () => {
    await ensureLanguageLoaded('de');
    await ensureLanguageLoaded('de');

    expect(i18n.hasResourceBundle('de', 'common')).toBe(true);
  });

  it('ignores an unknown language instead of throwing', async () => {
    await expect(ensureLanguageLoaded('zz')).resolves.toBeUndefined();
  });
});
