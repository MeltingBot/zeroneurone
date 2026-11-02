import { describe, it, expect } from 'vitest';
import { nextThemePreference } from './uiStore';

describe('nextThemePreference', () => {
  it('leaves "system" for the mode opposite to the OS, so the first click shows a change', () => {
    expect(nextThemePreference('system', 'light')).toBe('dark');
    expect(nextThemePreference('system', 'dark')).toBe('light');
  });

  it('cycles opposite → OS mode → system', () => {
    expect(nextThemePreference('dark', 'light')).toBe('light');
    expect(nextThemePreference('light', 'light')).toBe('system');
    expect(nextThemePreference('light', 'dark')).toBe('dark');
    expect(nextThemePreference('dark', 'dark')).toBe('system');
  });
});
