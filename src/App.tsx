import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage, JoinPage } from './pages';
import { ToastContainer, MinResolutionGuard, ErrorBoundary } from './components/common';
import { useTagSetStore } from './stores';
import { useVersionCheck } from './hooks/useVersionCheck';
import { usePlugins } from './plugins/usePlugins';
import { PasswordModal } from './components/modals/PasswordModal';
import { useEncryptionStore } from './stores/encryptionStore';
import { unlockEncryption } from './services/encryption/encryptionService';
import type { EncryptionMeta } from './services/encryption/encryptionService';
import { db } from './db/database';
import { syncService } from './services/syncService';

/**
 * Lit _encryptionMeta directement via l'API IndexedDB native, sans passer par
 * Dexie. Permet de savoir si le chiffrement est activé AVANT d'ouvrir Dexie,
 * afin d'installer le middleware avant la première transaction.
 */
async function readEncryptionMetaRaw(): Promise<EncryptionMeta | null> {
  try {
    // Vérifier que la base existe déjà (évite de la créer avec onupgradeneeded)
    const databases = await indexedDB.databases();
    if (!databases.some(d => d.name === 'zeroneurone')) return null;
  } catch {
    // indexedDB.databases() non supporté (rare) → on tente quand même
  }

  return new Promise((resolve) => {
    const openReq = indexedDB.open('zeroneurone');

    openReq.onupgradeneeded = () => {
      // La base n'existait pas (ou ancienne version sans _encryptionMeta)
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
  const { isLocked, setDek, setEnabled, setError, setReady, error, isEnabled } = useEncryptionStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [encryptionChecked, setEncryptionChecked] = useState(false);
  // Conserve les métadonnées lues en raw IDB pour le déverrouillage
  const [rawMeta, setRawMeta] = useState<EncryptionMeta | null>(null);
  // Vrai si le middleware Dexie a déjà été installé (évite le double-stack
  // au re-unlock après un lock session).
  const middlewareInstalled = useRef(false);

  useEffect(() => {
    // Lire _encryptionMeta via raw IndexedDB — Dexie n'est PAS encore ouverte.
    // Si on passait par db._encryptionMeta.get('main'), Dexie ouvrirait la
    // connexion sans middleware, et le db.close() ultérieur causerait des
    // DatabaseClosedError sur toutes les transactions en cours.
    readEncryptionMetaRaw().then(meta => {
      if (meta) {
        setRawMeta(meta);
        setEnabled(true);
        useEncryptionStore.getState().setLocked(true);
        // isReady reste false : Dexie ne doit pas être ouverte avant le déverrouillage
      } else {
        // Pas de chiffrement : Dexie peut être ouverte librement
        setReady();
      }
      setEncryptionChecked(true);
    }).catch(() => {
      setReady();
      setEncryptionChecked(true);
    });
  }, [setEnabled, setReady]);

  // Raccourci Alt+L : verrouille la session si chiffrement actif et déverrouillé
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'l' && isEnabled && !isLocked) {
        useEncryptionStore.getState().lock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, isLocked]);

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

      // Installer le middleware AVANT la première opération Dexie.
      // Si le middleware est déjà installé (re-unlock après lock session),
      // on ne rappelle PAS applyEncryption pour éviter le double-stack.
      if (!middlewareInstalled.current) {
        db.applyEncryption(dek);
        middlewareInstalled.current = true;
      }

      // Configurer syncService pour les futures bases y-indexeddb
      syncService.setAtRestDek(dek);

      // Stocker la DEK en mémoire et débloquer Dexie
      setDek(dek);
      setReady();

      // Upgrade PBKDF2 silencieux (v1 → v2) : persister le nouveau meta
      // après ouverture de Dexie (setReady() autorise les opérations DB).
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
  const isReady = useEncryptionStore((state) => state.isReady);

  // Initialize TagSets uniquement quand Dexie est prête (middleware installé
  // ou chiffrement absent). Évite d'ouvrir Dexie avant que le mot de passe
  // soit saisi et le middleware installé.
  useEffect(() => {
    if (!isReady) return;
    loadTagSets();
  }, [loadTagSets, isReady]);

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
