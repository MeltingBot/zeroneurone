import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { setThemePreference, themePreference, type ThemePreference } from './theme';
import { choiceButton, inputClass, sectionTitle } from './ui';

const THEMES = [
  { id: 'light', Icon: Sun },
  { id: 'dark', Icon: Moon },
  { id: 'system', Icon: Monitor },
] as const;

/** Theme and language of the companion */
export function Preferences() {
  const { t, i18n } = useTranslation('companion');
  const [theme, setTheme] = useState<ThemePreference>(themePreference);
  const current = SUPPORTED_LANGUAGES.find((l) => i18n.language === l.code || i18n.language.startsWith(`${l.code}-`))?.code
    ?? SUPPORTED_LANGUAGES[0].code;

  const pickTheme = (pref: ThemePreference) => {
    setTheme(pref);
    setThemePreference(pref);
  };

  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>{t('preferences.title')}</h2>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('preferences.theme')}>
        {THEMES.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            className={choiceButton(theme === id)}
            onClick={() => pickTheme(id)}
          >
            <Icon size={16} />
            {t(`preferences.${id}`)}
          </button>
        ))}
      </div>
      <select
        className={inputClass}
        value={current}
        onChange={(e) => void changeLanguage(e.target.value)}
        aria-label={t('preferences.language')}
      >
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </section>
  );
}
