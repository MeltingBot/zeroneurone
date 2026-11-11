/**
 * Theme of the companion: light, dark, or the phone's own setting. Kept on
 * this phone apart from the desktop's preference (a computer and a phone are
 * often set differently).
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'zeroneurone-companion-theme';
const dark = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

export function themePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage unavailable */ }
  return 'system';
}

/** Applies the preference, and the browser bar colour that goes with it */
export function applyTheme(): void {
  const pref = themePreference();
  const mode = pref === 'system' ? (dark?.matches ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  const bg = getComputedStyle(root).getPropertyValue('--color-bg-primary').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (bg) meta.content = bg;
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* storage unavailable: applies for this visit */ }
  applyTheme();
}

/** Follows the phone's setting while the preference is "system" */
export function watchSystemTheme(): void {
  dark?.addEventListener('change', () => {
    if (themePreference() === 'system') applyTheme();
  });
}
