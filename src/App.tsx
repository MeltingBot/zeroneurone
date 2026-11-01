import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { HomePage, DossierPage, JoinPage } from './pages';
import { ToastContainer, MinResolutionGuard, ErrorBoundary } from './components/common';
import { TutorialOverlay } from './components/tutorial/TutorialOverlay';
import { useTagSetStore, useCustomIconStore } from './stores';
import { useVersionCheck } from './hooks/useVersionCheck';
import { usePlugins } from './plugins/usePlugins';
import { PasswordModal } from './components/modals/PasswordModal';
import { useEncryptionStore } from './stores/encryptionStore';
import { unlockEncryption } from './services/encryption/encryptionService';
import type { EncryptionMeta } from './services/encryption/encryptionService';
import { isWebAuthnAvailable, unlockWithWebAuthn } from './services/encryption/webauthnService';
import { db, cleanOrphanedOpfs } from './db/database';
import { syncService } from './services/syncService';
import { setPluginNavigate } from './plugins/pluginAPI';
import { PluginUiHost } from './components/plugins/PluginUiHost';
import { ExportProgressModal } from './components/modals/ExportProgressModal';
import { appPath } from './utils/basePath';
import { useShallow } from 'zustand/react/shallow';

/**
  * Reads _encryptionMeta straight through the native IndexedDB API, bypassing
  * Dexie. Tells whether encryption is enabled BEFORE Dexie opens, so the
  * middleware can be installed before the first transaction.
 */
async function readEncryptionMetaRaw(): Promise<EncryptionMeta | null> {
  try {
    // Check that the database already exists (avoids creating it via onupgradeneeded)
    const databases = await indexedDB.databases();
    if (!databases.some(d => d.name === 'zeroneurone')) return null;
  } catch {
    // indexedDB.databases() not supported (rare) → try anyway
  }

  return new Promise((resolve) => {
    const openReq = indexedDB.open('zeroneurone');

    openReq.onupgradeneeded = () => {
      // The database did not exist (or an old version without _encryptionMeta)
      openReq.result.close();
      resolve(null);
    };

    openReq.onsuccess = () => {
      const idb = openReq.result;
      if (!idb.objectStoreNames.contains('_encryptionMeta')) {
        idb.close();
        resolve(null);
        return;
      }
      const tx = idb.transaction('_encryptionMeta', 'readonly');
      const req = tx.objectStore('_encryptionMeta').get('main');
      req.onsuccess = () => { idb.close(); resolve((req.result as EncryptionMeta) ?? null); };
      req.onerror = () => { idb.close(); resolve(null); };
    };

    openReq.onerror = () => resolve(null);
  });
}

/**
 * Global error fallback for unrecoverable errors
 */
function GlobalErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-error/10">
          <svg
            className="w-8 h-8 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">
          Erreur critique
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          L'application a rencontré une erreur inattendue et ne peut pas continuer.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded hover:bg-accent-hover"
          >
            Recharger l'application
          </button>
          <button
            onClick={() => {
              window.location.href = appPath('/');
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}

/**
  * EncryptionGate — Checks at startup whether the database is encrypted.
  * If so, shows the PasswordModal until it is unlocked.
  * If not, lets the app through directly.
 */
function EncryptionGate({ children }: { children: React.ReactNode }) {
  const { isLocked, setDek, setEnabled, setError, setReady, error, isEnabled, autoLockMinutes, setAutoLockMinutes } = useEncryptionStore(useShallow((s) => ({ isLocked: s.isLocked, setDek: s.setDek, setEnabled: s.setEnabled, setError: s.setError, setReady: s.setReady, error: s.error, isEnabled: s.isEnabled, autoLockMinutes: s.autoLockMinutes, setAutoLockMinutes: s.setAutoLockMinutes })));
  const [isVerifying, setIsVerifying] = useState(false);
  const [encryptionChecked, setEncryptionChecked] = useState(false);
  // Keeps the metadata read through raw IDB, for unlocking
  const [rawMeta, setRawMeta] = useState<EncryptionMeta | null>(null);
  // True once the Dexie middleware is installed (avoids stacking it twice
  // on re-unlock after a session lock).
  const middlewareInstalled = useRef(false);

  useEffect(() => {
    // Read _encryptionMeta through raw IndexedDB — Dexie is NOT open yet.
    // Going through db._encryptionMeta.get('main') would open the Dexie
    // connection without middleware, and the later db.close() would raise
    // DatabaseClosedError on every pending transaction.
    readEncryptionMetaRaw().then(meta => {
      if (meta) {
        setRawMeta(meta);
        setEnabled(true);
        if (meta.autoLockMinutes != null) setAutoLockMinutes(meta.autoLockMinutes);
        useEncryptionStore.getState().setLocked(true);
        // isReady stays false: Dexie must not open before unlocking
      } else {
        // No encryption: Dexie can open freely
        setReady();
      }
      setEncryptionChecked(true);
    }).catch(() => {
      setReady();
      setEncryptionChecked(true);
    });
  }, [setEnabled, setReady]);

  // Alt+L shortcut: locks the session when encryption is active and unlocked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'l' && isEnabled && !isLocked) {
        useEncryptionStore.getState().lock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, isLocked]);

  // Auto-lock on inactivity
  useEffect(() => {
    if (!autoLockMinutes || !isEnabled || isLocked) return;

    const ms = autoLockMinutes * 60_000;
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();

    const resetTimer = () => {
      const now = Date.now();
      // Throttle: ignore if < 10s since the last reset
      if (now - lastActivity < 10_000) return;
      lastActivity = now;
      clearTimeout(timer);
      timer = setTimeout(() => useEncryptionStore.getState().lock(), ms);
    };

    timer = setTimeout(() => useEncryptionStore.getState().lock(), ms);

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Check again when a hidden tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivity;
        if (elapsed >= ms) {
          useEncryptionStore.getState().lock();
        } else {
          clearTimeout(timer);
          timer = setTimeout(() => useEncryptionStore.getState().lock(), ms - elapsed);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoLockMinutes, isEnabled, isLocked]);

  const handleUnlock = async (password: string) => {
    setIsVerifying(true);
    setError(null);

    try {
      const meta = rawMeta;
      if (!meta) {
        setError('Métadonnées de chiffrement introuvables');
        return;
      }

      const { dek, upgradedMeta } = await unlockEncryption(meta, password);

      // Install the middleware BEFORE the first Dexie operation.
      // If it is already installed (re-unlock after a session lock),
      // applyEncryption is NOT called again, to avoid stacking it twice.
      if (!middlewareInstalled.current) {
        db.applyEncryption(dek);
        middlewareInstalled.current = true;
      }

      // Configure syncService for future y-indexeddb databases
      syncService.setAtRestDek(dek);

      // Keep the DEK in memory and unblock Dexie
      setDek(dek);
      setReady();

      // Silent PBKDF2 upgrade (v1 → v2): persist the new meta
      // once Dexie is open (setReady() allows DB operations).
      if (upgradedMeta) {
        setRawMeta(upgradedMeta);
        db._encryptionMeta.put(upgradedMeta).catch((err) =>
          console.warn('[EncryptionGate] Échec upgrade meta PBKDF2:', err)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mot de passe incorrect');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!encryptionChecked) {
    return null;
  }

  const hasWebAuthn = isWebAuthnAvailable()
    && !!rawMeta?.webauthnCredentials
    && rawMeta.webauthnCredentials.length > 0;

  const handleUnlockWebAuthn = async () => {
    setError(null);
    try {
      const meta = rawMeta;
      if (!meta?.webauthnCredentials?.length) return;

      const { dek } = await unlockWithWebAuthn(meta.webauthnCredentials);

      if (!middlewareInstalled.current) {
        db.applyEncryption(dek);
        middlewareInstalled.current = true;
      }
      syncService.setAtRestDek(dek);
      setDek(dek);
      setReady();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Authentication cancelled') {
        setError(msg);
      }
    }
  };

  if (isLocked) {
    return (
      <PasswordModal
        onUnlock={handleUnlock}
        error={error}
        isVerifying={isVerifying}
        hasWebAuthn={hasWebAuthn}
        onUnlockWebAuthn={handleUnlockWebAuthn}
      />
    );
  }

  return <>{children}</>;
}

/** Legacy route: /investigation/:id → /dossier/:id */
function LegacyInvestigationRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dossier/${id}`} replace />;
}

/** Injects react-router navigate into pluginAPI.services.navigateTo */
function NavigateRef() {
  const navigate = useNavigate();
  useEffect(() => { setPluginNavigate(navigate); }, [navigate]);
  return null;
}

function App() {
  const loadTagSets = useTagSetStore((state) => state.load);
  const loadCustomIcons = useCustomIconStore((state) => state.load);
  const isReady = useEncryptionStore((state) => state.isReady);

  // Initialize TagSets only once Dexie is ready (middleware installed
  // or no encryption). Avoids opening Dexie before the password
  // is entered and the middleware installed.
  useEffect(() => {
    if (!isReady) return;
    loadTagSets();
    loadCustomIcons();
    cleanOrphanedOpfs();
  }, [loadTagSets, loadCustomIcons, isReady]);

  // Check for app updates on tab focus
  useVersionCheck();

  const globalPlugins = usePlugins('app:global');

  return (
    <ErrorBoundary fallback={<GlobalErrorFallback />}>
      <MinResolutionGuard>
        <EncryptionGate>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <NavigateRef />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/dossier/:id" element={<DossierPage />} />
              {/* Legacy route redirect */}
              <Route path="/investigation/:id" element={<LegacyInvestigationRedirect />} />
              <Route path="/join/:roomId" element={<JoinPage />} />
            </Routes>
            <ToastContainer />
            <ExportProgressModal />
            <TutorialOverlay />
            {globalPlugins.map((Plugin, i) => <Plugin key={`gp-${i}`} />)}
            <PluginUiHost />
          </BrowserRouter>
        </EncryptionGate>
      </MinResolutionGuard>
    </ErrorBoundary>
  );
}

export default App;
