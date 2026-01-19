import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const version = __APP_VERSION__;
  const showVersion = version && version !== 'dev';

  return (
    <div className="h-screen flex flex-col bg-bg-canvas relative">
      {children}
      {showVersion && (
        <div className="absolute bottom-1 right-2 text-[10px] text-text-tertiary/50 select-none pointer-events-none">
          {version.slice(0, 7)}
        </div>
      )}
    </div>
  );
}
