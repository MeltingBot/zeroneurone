// ─── Welcome Banner (onboarding) ─────────────────────────────
//
// One-time, dismissible welcome banner shown on the home page for new users.
// Mirrors the localStorage "show once then remember" pattern of the storage
// disclaimer. Removed permanently on dismiss; never auto-reappears.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, BookOpen, X } from 'lucide-react';
import { Button } from '../common';

const STORAGE_KEY = 'zeroneurone:onboarding-dismissed';

interface WelcomeBannerProps {
  onTryExample: () => void;
}

export function WelcomeBanner({ onTryExample }: WelcomeBannerProps) {
  const { t } = useTranslation('pages');
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="px-6 pt-6">
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-secondary border border-border-default rounded">
        <Compass size={16} className="text-text-secondary shrink-0" />
        <p className="flex-1 text-sm text-text-secondary">
          {t('home.onboarding.welcome')}
        </p>
        <a
          href="https://doc.zeroneurone.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary shrink-0"
        >
          <BookOpen size={14} />
          {t('home.documentation')}
        </a>
        <Button variant="primary" size="sm" onClick={onTryExample}>
          {t('home.onboarding.tryExample')}
        </Button>
        <button
          onClick={dismiss}
          title={t('home.onboarding.dismiss')}
          className="text-text-tertiary hover:text-text-primary shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
