import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Monitor, Smartphone } from 'lucide-react';

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 600;
const DISMISS_KEY = 'zeroneurone:resolution-warning-dismissed';

interface MinResolutionGuardProps {
  children: React.ReactNode;
}

export function MinResolutionGuard({ children }: MinResolutionGuardProps) {
  const { t } = useTranslation('common');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    const checkResolution = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    checkResolution();

    window.addEventListener('resize', checkResolution);
    return () => window.removeEventListener('resize', checkResolution);
  }, []);

  if (!dimensions) {
    return null;
  }

  const isTooSmall = dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT;

  if (isTooSmall && !dismissed) {
    const handleDismiss = () => {
      sessionStorage.setItem(DISMISS_KEY, '1');
      setDismissed(true);
    };

    return (
      <div className="min-h-screen bg-bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-bg-primary border border-border-default rounded p-6 space-y-6 text-center">
          {/* Logo */}
          <div className="flex justify-center">
            <img src="/logo.png" alt="zeroneurone" className="h-16 w-auto" />
          </div>

          {/* Icon */}
          <div className="flex justify-center gap-4 text-text-tertiary">
            <Smartphone size={32} className="opacity-50" />
            <Monitor size={32} className="text-accent" />
          </div>

          {/* Title */}
          <h1 className="text-lg font-semibold text-text-primary">
            {t('resolution.title')}
          </h1>

          {/* Message */}
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              <Trans
                i18nKey="resolution.message"
                t={t}
                values={{ minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT }}
                components={{ strong: <span className="font-medium text-text-primary" /> }}
              />
            </p>
            <p>
              <Trans
                i18nKey="resolution.current"
                t={t}
                values={{ width: dimensions.width, height: dimensions.height }}
                components={{ strong: <span className="font-medium text-text-primary" /> }}
              />
            </p>
          </div>

          {/* Suggestions */}
          <div className="bg-bg-secondary border border-border-default rounded p-4 text-left">
            <p className="text-xs font-medium text-text-primary mb-2">
              {t('resolution.suggestions')}
            </p>
            <ul className="text-xs text-text-secondary space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>{t('resolution.suggestLarger')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>{t('resolution.suggestMaximize')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>{t('resolution.suggestZoom')}</span>
              </li>
            </ul>
          </div>

          {/* Continue button */}
          <button
            onClick={handleDismiss}
            className="text-sm text-accent hover:underline"
          >
            {t('resolution.continueAnyway')}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
