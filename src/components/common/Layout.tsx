import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation('common');
  const version = __APP_VERSION__;
  const showVersion = version && version !== 'dev';

  return (
    <div className="h-screen flex flex-col bg-bg-canvas relative">
      {/* Skip to main content link - visible only when focused */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded focus:text-sm focus:font-medium"
      >
        {t('accessibility.skipToContent')}
      </a>
      <div id="main-content" tabIndex={-1} className="contents">
        {children}
      </div>
      {showVersion && (
        <div className="absolute bottom-1 right-2 text-[10px] text-text-tertiary/50 select-none pointer-events-none">
          {version.slice(0, 7)}
        </div>
      )}
    </div>
  );
}
