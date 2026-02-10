import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../stores/toastStore';

const CHECK_THROTTLE_MS = 60_000; // Don't re-check within 60s

/**
 * Checks for app updates on tab focus by fetching /version.json.
 * Shows a persistent warning toast when a new version is detected.
 */
export function useVersionCheck() {
  const { t } = useTranslation('common');
  const lastCheckRef = useRef(0);
  const notifiedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_THROTTLE_MS) return;
      lastCheckRef.current = now;

      try {
        const res = await fetch(`/version.json?t=${now}`);
        if (!res.ok) return;
        const data = await res.json();
        const remoteVersion = data.version as string;

        if (remoteVersion && remoteVersion !== __APP_VERSION__ && remoteVersion !== notifiedVersionRef.current) {
          notifiedVersionRef.current = remoteVersion;
          toast.warning(
            t('versionUpdate', { version: remoteVersion }),
            0, // persistent — user must dismiss or reload
          );
        }
      } catch {
        // Network error — silently ignore
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also check once on mount (app startup / hard refresh)
    checkVersion();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [t]);
}
