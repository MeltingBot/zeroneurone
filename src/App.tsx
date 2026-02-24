import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage, JoinPage } from './pages';
import { ToastContainer, MinResolutionGuard, ErrorBoundary } from './components/common';
import { useTagSetStore } from './stores';
import { useVersionCheck } from './hooks/useVersionCheck';
import { usePlugins } from './plugins/usePlugins';
import { PasswordModal } from './components/modals/PasswordModal';
import { useEncryptionStore } from './stores/encryptionStore';
import { unlockEncryption } from './services/encryption/encryptionService';
import { db } from './db/database';
import { syncService } from './services/syncService';

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
              window.location.href = '/';
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
 * EncryptionGate — Vérifie si la base est chiffrée au démarrage.
 * Si oui, affiche le PasswordModal jusqu'à déverrouillage.
 * Si non, laisse passer directement.
 */
function EncryptionGate({ children }: { children: React.ReactNode }) {
  const { isLocked, setDek, setEnabled, setError, error } = useEncryptionStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [encryptionChecked, setEncryptionChecked] = useState(false);

  useEffect(() => {
    // Vérifier au démarrage si un _encryptionMeta existe
    db._encryptionMeta.get('main').then(meta => {
      if (meta) {
        // Chiffrement activé : bloquer jusqu'à saisie du mot de passe
        setEnabled(true);
        useEncryptionStore.getState().setLocked(true);
      }
      setEncryptionChecked(true);
    }).catch(() => {
      // Erreur DB : continuer sans chiffrement
      setEncryptionChecked(true);
    });
  }, [setEnabled]);

  const handleUnlock = async (password: string) => {
    setIsVerifying(true);
    setError(null);

    try {
      const meta = await db._encryptionMeta.get('main');
      if (!meta) {
        setError('Métadonnées de chiffrement introuvables');
        return;
      }

      const dek = await unlockEncryption(meta, password);

      // Appliquer le middleware Dexie
      db.applyEncryption(dek);

      // Configurer syncService pour les futures bases y-indexeddb
      syncService.setAtRestDek(dek);

      // Stocker la DEK en mémoire
      setDek(dek);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mot de passe incorrect');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!encryptionChecked) {
    // Attendre la vérification initiale (très rapide, ~1 query IndexedDB)
    return null;
  }

  if (isLocked) {
    return (
      <PasswordModal
        onUnlock={handleUnlock}
        error={error}
        isVerifying={isVerifying}
      />
    );
  }

  return <>{children}</>;
}

function App() {
  const loadTagSets = useTagSetStore((state) => state.load);

  // Initialize TagSets on app startup
  useEffect(() => {
    loadTagSets();
  }, [loadTagSets]);

  // Check for app updates on tab focus
  useVersionCheck();

  const globalPlugins = usePlugins('app:global');

  return (
    <ErrorBoundary fallback={<GlobalErrorFallback />}>
      <MinResolutionGuard>
        <EncryptionGate>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/investigation/:id" element={<InvestigationPage />} />
              <Route path="/join/:roomId" element={<JoinPage />} />
            </Routes>
            <ToastContainer />
            {globalPlugins.map((Plugin, i) => <Plugin key={`gp-${i}`} />)}
          </BrowserRouter>
        </EncryptionGate>
      </MinResolutionGuard>
    </ErrorBoundary>
  );
}

export default App;
