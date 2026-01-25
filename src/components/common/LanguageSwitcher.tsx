import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { DropdownMenu, DropdownItem } from './DropdownMenu';
import { SUPPORTED_LANGUAGES } from '../../i18n';

interface LanguageSwitcherProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
  direction?: 'down' | 'up';
}

export function LanguageSwitcher({ size = 'sm', showLabel = false, direction = 'down' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation('common');

  // Find current language - handle both exact match (e.g., 'fr') and regional variants (e.g., 'fr-FR')
  const currentLangData = SUPPORTED_LANGUAGES.find(l =>
    i18n.language === l.code || i18n.language.startsWith(l.code + '-')
  ) || SUPPORTED_LANGUAGES[0];
  const currentLang = currentLangData.code;

  return (
    <DropdownMenu
      direction={direction}
      trigger={
        <button
          className={`inline-flex items-center gap-1.5 hover:bg-bg-tertiary rounded transition-colors text-text-secondary hover:text-text-primary ${
            size === 'sm' ? 'p-1.5 text-xs' : 'p-2 text-sm'
          }`}
          title={t('language.switch')}
        >
          <span className={size === 'sm' ? 'text-sm' : 'text-base'}>{currentLangData.flag}</span>
          {showLabel && <span>{currentLangData.code.toUpperCase()}</span>}
        </button>
      }
      align="right"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <DropdownItem
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
        >
          <span className="flex items-center gap-2 w-full">
            <span>{lang.flag}</span>
            <span className="flex-1">{lang.label}</span>
            {currentLang === lang.code && <Check size={14} className="text-accent" />}
          </span>
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}
