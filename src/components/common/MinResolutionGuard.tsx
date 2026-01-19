import { useState, useEffect } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 800;

interface MinResolutionGuardProps {
  children: React.ReactNode;
}

export function MinResolutionGuard({ children }: MinResolutionGuardProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const checkResolution = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Check on mount
    checkResolution();

    // Check on resize
    window.addEventListener('resize', checkResolution);
    return () => window.removeEventListener('resize', checkResolution);
  }, []);

  // Don't render anything until we've checked (avoid flash)
  if (!dimensions) {
    return null;
  }

  const isTooSmall = dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT;

  if (isTooSmall) {
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
            Resolution insuffisante
          </h1>

          {/* Message */}
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Cette application necessite une resolution d'ecran minimale de{' '}
              <span className="font-medium text-text-primary">{MIN_WIDTH} x {MIN_HEIGHT} pixels</span>.
            </p>
            <p>
              Votre resolution actuelle est de{' '}
              <span className="font-medium text-text-primary">
                {dimensions.width} x {dimensions.height}
              </span>.
            </p>
          </div>

          {/* Suggestions */}
          <div className="bg-bg-secondary border border-border-default rounded p-4 text-left">
            <p className="text-xs font-medium text-text-primary mb-2">
              Suggestions :
            </p>
            <ul className="text-xs text-text-secondary space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>Utilisez un ordinateur ou une tablette avec un ecran plus grand</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>Agrandissez la fenetre de votre navigateur</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>Reduisez le niveau de zoom de votre navigateur (Ctrl + -)</span>
              </li>
            </ul>
          </div>

        </div>
      </div>
    );
  }

  return <>{children}</>;
}
