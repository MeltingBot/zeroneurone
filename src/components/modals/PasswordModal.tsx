/**
 * PasswordModal — Saisie du mot de passe de chiffrement au démarrage
 *
 * Affiché au lancement de l'app si `_encryptionMeta` existe dans Dexie.
 * Bloquant : l'app n'est pas accessible tant que le mot de passe n'est pas validé.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
    >
      <div className="bg-white rounded border border-gray-200 shadow-lg w-full max-w-sm mx-4 p-6">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-5">
          <Lock size={20} className="text-gray-700 shrink-0" />
          <div>
            <h2 id="password-modal-title" className="text-sm font-semibold text-gray-900">
              Base chiffrée
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Entrez le mot de passe pour déverrouiller vos données
            </p>
          </div>
        </div>

        {/* Champ mot de passe */}
        <div className="mb-4">
          <label
            htmlFor="encryption-password"
            className="block text-xs font-medium text-gray-700 mb-1.5"
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
              className="w-full text-sm border border-gray-300 rounded px-3 py-2 pr-9 focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <AlertTriangle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Bouton */}
        <button
          onClick={handleSubmit}
          disabled={!password || isVerifying}
          className="w-full text-sm font-medium bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVerifying ? 'Vérification…' : 'Déverrouiller'}
        </button>

        {/* Avertissement perte de données */}
        <p className="text-xs text-gray-400 mt-3 text-center">
          Sans ce mot de passe, les données sont irrécupérables.
        </p>
      </div>
    </div>
  );
}
