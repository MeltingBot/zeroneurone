/**
 * PasswordModal — Saisie du mot de passe de chiffrement au démarrage
 *
 * Affiché au lancement de l'app si `_encryptionMeta` existe dans Dexie.
 * Bloquant : l'app n'est pas accessible tant que le mot de passe n'est pas validé.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, TriangleAlert } from 'lucide-react';

interface PasswordModalProps {
  /** Appelé avec le mot de passe quand l'utilisateur soumet */
  onUnlock: (password: string) => Promise<void>;
  /** Message d'erreur à afficher (mot de passe incorrect, etc.) */
  error?: string | null;
  /** Vrai pendant la vérification du mot de passe */
  isVerifying?: boolean;
}

export function PasswordModal({ onUnlock, error, isVerifying = false }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!password || isVerifying) return;
    await onUnlock(password);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      // Supprime _encryptionMeta via raw IndexedDB (sans passer par Dexie)
      await new Promise<void>((resolve, reject) => {
        const openReq = indexedDB.open('zeroneurone');
        openReq.onsuccess = () => {
          const idb = openReq.result;
          if (!idb.objectStoreNames.contains('_encryptionMeta')) {
            idb.close();
            resolve();
            return;
          }
          const tx = idb.transaction('_encryptionMeta', 'readwrite');
          tx.objectStore('_encryptionMeta').delete('main');
          tx.oncomplete = () => { idb.close(); resolve(); };
          tx.onerror = () => { idb.close(); reject(tx.error); };
        };
        openReq.onerror = () => reject(openReq.error);
      });
      window.location.reload();
    } catch {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
    >
      <div className="bg-bg-primary border border-border-default shadow-lg w-full max-w-sm mx-4 p-6 rounded">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-5">
          <Lock size={16} className="text-text-secondary shrink-0" />
          <div>
            <h2 id="password-modal-title" className="text-sm font-semibold text-text-primary">
              Base chiffrée
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Entrez le mot de passe pour déverrouiller vos données
            </p>
          </div>
        </div>

        {/* Champ mot de passe */}
        <div className="mb-4">
          <label
            htmlFor="encryption-password"
            className="block text-xs font-medium text-text-primary mb-1.5"
          >
            Mot de passe
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="encryption-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Entrez votre mot de passe"
              disabled={isVerifying}
              className="w-full text-sm border border-border-default rounded px-3 py-2 pr-9 bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent disabled:bg-bg-secondary disabled:text-text-tertiary"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-bg-secondary border border-border-default rounded text-xs text-error">
            <AlertTriangle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Bouton */}
        <button
          onClick={handleSubmit}
          disabled={!password || isVerifying}
          className="w-full text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isVerifying ? 'Vérification…' : 'Déverrouiller'}
        </button>

        {/* Mot de passe oublié */}
        {!showReset ? (
          <p className="text-xs text-text-tertiary mt-3 text-center">
            Sans ce mot de passe, les données sont irrécupérables.{' '}
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className="underline hover:text-text-secondary"
            >
              Mot de passe oublié ?
            </button>
          </p>
        ) : (
          <div className="mt-3 p-3 border border-error/40 rounded bg-bg-secondary">
            <div className="flex items-start gap-2 mb-2">
              <TriangleAlert size={13} className="text-error shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary">
                Supprimer les métadonnées de chiffrement. Si les données sont chiffrées,{' '}
                <span className="font-medium text-text-primary">elles seront définitivement inaccessibles.</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                disabled={isResetting}
                className="flex-1 text-xs py-1.5 border border-border-default rounded text-text-secondary hover:text-text-primary disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="flex-1 text-xs py-1.5 border border-error/40 rounded text-error hover:bg-error/5 disabled:opacity-40"
              >
                {isResetting ? 'Réinitialisation…' : 'Réinitialiser'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
