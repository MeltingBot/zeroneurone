/**
 * EncryptionModal — Paramètres de chiffrement at-rest
 *
 * Trois états :
 * - Chiffrement désactivé : toggle pour activer + saisie mot de passe
 * - Chiffrement activé : toggle pour désactiver + changement de mot de passe
 * - Migration en cours : barre de progression
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Lock, Unlock, Eye, EyeOff, AlertTriangle, CheckCircle, Shield, ShieldOff, RefreshCw, LockKeyhole } from 'lucide-react';
import { Modal } from '../common';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { enableEncryption, disableEncryption } from '../../services/encryption/migrationService';
import { changePassword } from '../../services/encryption/encryptionService';
import { db } from '../../db/database';

interface EncryptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'main' | 'enable' | 'disable' | 'change-password';

interface MigrationState {
  phase: string;
  current: number;
  total: number;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function EncryptionModal({ isOpen, onClose }: EncryptionModalProps) {
  const { isEnabled, dek, setDek, setEnabled, lock: lockStore } = useEncryptionStore();
  const [view, setView] = useState<View>('main');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [migration, setMigration] = useState<MigrationState | null>(null);

  // Réinitialiser à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setView('main');
      setError(null);
      setSuccess(null);
      setMigration(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Chiffrement"
      width="sm"
    >
      {view === 'main' && (
        <MainView
          isEnabled={isEnabled}
          hasDek={!!dek}
          error={error}
          success={success}
          onEnable={() => { setError(null); setSuccess(null); setView('enable'); }}
          onDisable={() => { setError(null); setSuccess(null); setView('disable'); }}
          onChangePassword={() => { setError(null); setSuccess(null); setView('change-password'); }}
          onLockSession={() => { lockStore(); onClose(); }}
        />
      )}

      {view === 'enable' && (
        <EnableView
          isBusy={isBusy}
          migration={migration}
          error={error}
          onConfirm={async (password) => {
            setIsBusy(true);
            setError(null);
            try {
              const newDek = await enableEncryption(password, (p) => setMigration(p));
              setDek(newDek);
              setEnabled(true);
              setSuccess('Chiffrement activé. Vos données sont maintenant chiffrées.');
              setView('main');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur lors de l\'activation');
            } finally {
              setIsBusy(false);
              setMigration(null);
            }
          }}
          onBack={() => { setError(null); setView('main'); }}
        />
      )}

      {view === 'disable' && (
        <DisableView
          isBusy={isBusy}
          migration={migration}
          error={error}
          onConfirm={async (password) => {
            if (!dek) { setError('Clé de chiffrement absente'); return; }
            setIsBusy(true);
            setError(null);
            try {
              // Vérifier le mot de passe avant de désactiver
              const meta = await db._encryptionMeta.get('main');
              if (!meta) throw new Error('Métadonnées introuvables');
              const { unlockEncryption } = await import('../../services/encryption/encryptionService');
              await unlockEncryption(meta, password); // lance si incorrect

              await disableEncryption(dek, (p) => setMigration(p));
              setEnabled(false);
              lock();
              setSuccess('Chiffrement désactivé. Rechargement requis.');
              setView('main');
              // Recharger pour rouvrir Dexie sans middleware
              setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur lors de la désactivation');
            } finally {
              setIsBusy(false);
              setMigration(null);
            }
          }}
          onBack={() => { setError(null); setView('main'); }}
        />
      )}

      {view === 'change-password' && (
        <ChangePasswordView
          isBusy={isBusy}
          error={error}
          onConfirm={async (oldPassword, newPassword) => {
            setIsBusy(true);
            setError(null);
            try {
              const meta = await db._encryptionMeta.get('main');
              if (!meta) throw new Error('Métadonnées introuvables');
              const newMeta = await changePassword(meta, oldPassword, newPassword);
              await db._encryptionMeta.put(newMeta);
              setSuccess('Mot de passe modifié.');
              setView('main');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur lors du changement');
            } finally {
              setIsBusy(false);
            }
          }}
          onBack={() => { setError(null); setView('main'); }}
        />
      )}
    </Modal>
  );
}

// ============================================================================
// SOUS-VUES
// ============================================================================

function MainView({
  isEnabled,
  hasDek,
  error,
  success,
  onEnable,
  onDisable,
  onChangePassword,
  onLockSession,
}: {
  isEnabled: boolean;
  hasDek: boolean;
  error: string | null;
  success: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onChangePassword: () => void;
  onLockSession: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between p-3 bg-bg-secondary rounded border border-border-default">
        <div className="flex items-center gap-2.5">
          {isEnabled
            ? <Shield size={16} className="text-success shrink-0" />
            : <ShieldOff size={16} className="text-text-tertiary shrink-0" />
          }
          <div>
            <p className="text-sm font-medium text-text-primary">
              {isEnabled ? 'Chiffrement actif' : 'Chiffrement inactif'}
            </p>
            <p className="text-xs text-text-secondary">
              {isEnabled
                ? 'Données chiffrées (AES-256-GCM)'
                : 'Données stockées en clair dans IndexedDB'}
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          isEnabled ? 'bg-success/10 text-success' : 'bg-bg-tertiary text-text-tertiary'
        }`}>
          {isEnabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Avertissement si activé mais non déverrouillé */}
      {isEnabled && !hasDek && (
        <p className="text-xs text-warning flex items-center gap-1.5">
          <AlertTriangle size={12} />
          Session verrouillée — rechargez l'app pour saisir le mot de passe
        </p>
      )}

      {/* Messages */}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 bg-success/5 border border-success/20 rounded text-xs text-success">
          <CheckCircle size={13} className="shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded text-xs text-error">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {!isEnabled ? (
          <button
            onClick={onEnable}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded hover:bg-bg-secondary"
          >
            <Lock size={14} />
            Activer le chiffrement
          </button>
        ) : (
          <>
            <button
              onClick={onChangePassword}
              disabled={!hasDek}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded hover:bg-bg-secondary disabled:opacity-40"
            >
              <RefreshCw size={14} />
              Changer le mot de passe
            </button>
            <button
              onClick={onDisable}
              disabled={!hasDek}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-error border border-error/20 rounded hover:bg-error/5 disabled:opacity-40"
            >
              <Unlock size={14} />
              Désactiver le chiffrement
            </button>
          </>
        )}

        {/* Lock session — distinct du disable chiffrement */}
        {isEnabled && hasDek && (
          <button
            onClick={onLockSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary border border-border-default rounded hover:bg-bg-secondary mt-1"
          >
            <LockKeyhole size={14} />
            Verrouiller la session
            <span className="ml-auto text-xs text-text-tertiary">Alt+L</span>
          </button>
        )}
      </div>

      {/* Note sécurité */}
      {!isEnabled && (
        <p className="text-xs text-text-tertiary border-t border-border-default pt-3">
          Le chiffrement protège vos données contre l'accès aux fichiers du navigateur.
          Le mot de passe est irrécupérable — exportez vos données avant d'activer.
        </p>
      )}
    </div>
  );
}

function EnableView({
  isBusy,
  migration,
  error,
  onConfirm,
  onBack,
}: {
  isBusy: boolean;
  migration: MigrationState | null;
  error: string | null;
  onConfirm: (password: string) => Promise<void>;
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !isBusy;

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) onConfirm(password);
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-warning/5 border border-warning/20 rounded text-xs text-warning flex items-start gap-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        <span>Sans ce mot de passe, vos données seront <strong>irrécupérables</strong>. Exportez une sauvegarde avant de continuer.</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            Mot de passe (8 caractères minimum)
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              disabled={isBusy}
              className="w-full text-sm border border-border-default rounded px-3 py-2 pr-9 focus:outline-none focus:border-accent disabled:bg-bg-secondary"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            Confirmer le mot de passe
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={handleKey}
            disabled={isBusy}
            className={`w-full text-sm border rounded px-3 py-2 focus:outline-none disabled:bg-bg-secondary ${
              mismatch ? 'border-error focus:border-error' : 'border-border-default focus:border-accent'
            }`}
            autoComplete="new-password"
          />
          {mismatch && <p className="text-xs text-error mt-1">Les mots de passe ne correspondent pas</p>}
        </div>
      </div>

      {/* Progression migration */}
      {migration && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{migration.phase}</span>
            <span>{migration.current}/{migration.total}</span>
          </div>
          <div className="h-1.5 bg-bg-tertiary rounded overflow-hidden">
            <div
              className="h-full bg-accent rounded transition-all duration-300"
              style={{ width: `${migration.total > 0 ? (migration.current / migration.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded text-xs text-error">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={isBusy}
          className="flex-1 text-sm text-text-secondary border border-border-default rounded px-4 py-2 hover:bg-bg-secondary disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(password)}
          disabled={!canSubmit}
          className="flex-1 text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ? 'Migration…' : 'Activer'}
        </button>
      </div>
    </div>
  );
}

function DisableView({
  isBusy,
  migration,
  error,
  onConfirm,
  onBack,
}: {
  isBusy: boolean;
  migration: MigrationState | null;
  error: string | null;
  onConfirm: (password: string) => Promise<void>;
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="space-y-4">
      <div className="p-3 bg-error/5 border border-error/20 rounded text-xs text-error flex items-start gap-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        <span>Les données seront déchiffrées et stockées en clair. L'application se rechargera après la migration.</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-primary mb-1.5">
          Confirmez avec votre mot de passe actuel
        </label>
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password && !isBusy && onConfirm(password)}
          disabled={isBusy}
          className="w-full text-sm border border-border-default rounded px-3 py-2 focus:outline-none focus:border-accent disabled:bg-bg-secondary"
          autoComplete="current-password"
        />
      </div>

      {migration && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{migration.phase}</span>
            <span>{migration.current}/{migration.total}</span>
          </div>
          <div className="h-1.5 bg-bg-tertiary rounded overflow-hidden">
            <div
              className="h-full bg-error rounded transition-all duration-300"
              style={{ width: `${migration.total > 0 ? (migration.current / migration.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded text-xs text-error">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={isBusy}
          className="flex-1 text-sm text-text-secondary border border-border-default rounded px-4 py-2 hover:bg-bg-secondary disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(password)}
          disabled={!password || isBusy}
          className="flex-1 text-sm font-medium bg-error text-white rounded px-4 py-2 hover:bg-red-700 disabled:opacity-50"
        >
          {isBusy ? 'Migration…' : 'Désactiver'}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordView({
  isBusy,
  error,
  onConfirm,
  onBack,
}: {
  isBusy: boolean;
  error: string | null;
  onConfirm: (oldPassword: string, newPassword: string) => Promise<void>;
  onBack: () => void;
}) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const mismatch = confirmNew.length > 0 && newPassword !== confirmNew;
  const canSubmit = oldPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmNew && !isBusy;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            Mot de passe actuel
          </label>
          <input
            ref={inputRef}
            type={showPassword ? 'text' : 'password'}
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            disabled={isBusy}
            className="w-full text-sm border border-border-default rounded px-3 py-2 focus:outline-none focus:border-accent disabled:bg-bg-secondary"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              disabled={isBusy}
              className="w-full text-sm border border-border-default rounded px-3 py-2 pr-9 focus:outline-none focus:border-accent disabled:bg-bg-secondary"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            Confirmer le nouveau mot de passe
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmNew}
            onChange={e => setConfirmNew(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && onConfirm(oldPassword, newPassword)}
            disabled={isBusy}
            className={`w-full text-sm border rounded px-3 py-2 focus:outline-none disabled:bg-bg-secondary ${
              mismatch ? 'border-error' : 'border-border-default focus:border-accent'
            }`}
            autoComplete="new-password"
          />
          {mismatch && <p className="text-xs text-error mt-1">Les mots de passe ne correspondent pas</p>}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded text-xs text-error">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={isBusy}
          className="flex-1 text-sm text-text-secondary border border-border-default rounded px-4 py-2 hover:bg-bg-secondary disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(oldPassword, newPassword)}
          disabled={!canSubmit}
          className="flex-1 text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ? 'Modification…' : 'Changer'}
        </button>
      </div>
    </div>
  );
}
