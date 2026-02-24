/**
 * EncryptionModal — Paramètres de chiffrement at-rest
 *
 * Trois états :
 * - Chiffrement désactivé : toggle pour activer + saisie mot de passe
 * - Chiffrement activé : toggle pour désactiver + changement de mot de passe
 * - Migration en cours : barre de progression
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock, Eye, EyeOff, AlertTriangle, CheckCircle, Shield, ShieldOff, RefreshCw, LockKeyhole, KeyRound, Trash2, Timer } from 'lucide-react';
import { Modal } from '../common';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { enableEncryption, disableEncryption } from '../../services/encryption/migrationService';
import { changePassword } from '../../services/encryption/encryptionService';
import type { WebAuthnCredentialEntry } from '../../services/encryption/encryptionService';
import { isWebAuthnAvailable, registerWebAuthnCredential } from '../../services/encryption/webauthnService';
import { db } from '../../db/database';

interface EncryptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'main' | 'enable' | 'disable' | 'change-password' | 'webauthn';

interface MigrationState {
  phase: string;
  current: number;
  total: number;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function EncryptionModal({ isOpen, onClose }: EncryptionModalProps) {
  const { t } = useTranslation('modals');
  const { isEnabled, dek, setDek, setEnabled, lock: lockStore, autoLockMinutes, setAutoLockMinutes } = useEncryptionStore();
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
      title={t('encryption.title')}
      width="sm"
    >
      {view === 'main' && (
        <MainView
          isEnabled={isEnabled}
          hasDek={!!dek}
          error={error}
          success={success}
          autoLockMinutes={autoLockMinutes}
          onAutoLockChange={async (minutes) => {
            setAutoLockMinutes(minutes);
            await db._encryptionMeta.update('main', { autoLockMinutes: minutes });
          }}
          onEnable={() => { setError(null); setSuccess(null); setView('enable'); }}
          onDisable={() => { setError(null); setSuccess(null); setView('disable'); }}
          onChangePassword={() => { setError(null); setSuccess(null); setView('change-password'); }}
          onWebAuthn={() => { setError(null); setSuccess(null); setView('webauthn'); }}
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
              setSuccess(t('encryption.successEnabled'));
              setView('main');
            } catch (err) {
              setError(err instanceof Error ? err.message : t('encryption.errorActivation'));
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
            if (!dek) { setError(t('encryption.errorMissingKey')); return; }
            setIsBusy(true);
            setError(null);
            try {
              // Vérifier le mot de passe avant de désactiver
              const meta = await db._encryptionMeta.get('main');
              if (!meta) throw new Error(t('encryption.errorMetaNotFound'));
              const { unlockEncryption } = await import('../../services/encryption/encryptionService');
              await unlockEncryption(meta, password); // lance si incorrect

              await disableEncryption(dek, (p) => setMigration(p));
              setEnabled(false);
              lockStore();
              setSuccess(t('encryption.successDisabled'));
              setView('main');
              // Recharger pour rouvrir Dexie sans middleware
              setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
              setError(err instanceof Error ? err.message : t('encryption.errorDeactivation'));
            } finally {
              setIsBusy(false);
              setMigration(null);
            }
          }}
          onBack={() => { setError(null); setView('main'); }}
        />
      )}

      {view === 'webauthn' && (
        <WebAuthnView
          dek={dek}
          isBusy={isBusy}
          error={error}
          onSuccess={(msg) => { setSuccess(msg); setView('main'); }}
          onError={(msg) => setError(msg)}
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
              if (!meta) throw new Error(t('encryption.errorMetaNotFound'));
              const newMeta = await changePassword(meta, oldPassword, newPassword);
              await db._encryptionMeta.put(newMeta);
              setSuccess(t('encryption.successPasswordChanged'));
              setView('main');
            } catch (err) {
              setError(err instanceof Error ? err.message : t('encryption.errorPasswordChange'));
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
  autoLockMinutes,
  onAutoLockChange,
  onEnable,
  onDisable,
  onChangePassword,
  onWebAuthn,
  onLockSession,
}: {
  isEnabled: boolean;
  hasDek: boolean;
  error: string | null;
  success: string | null;
  autoLockMinutes: number | null;
  onAutoLockChange: (minutes: number | null) => void;
  onEnable: () => void;
  onDisable: () => void;
  onChangePassword: () => void;
  onWebAuthn: () => void;
  onLockSession: () => void;
}) {
  const { t } = useTranslation('modals');

  return (
    <div className="space-y-4">
      {/* Status */}
      <div
        data-testid="encryption-status"
        data-encryption-enabled={isEnabled ? 'true' : 'false'}
        className="flex items-center justify-between p-3 bg-bg-secondary rounded border border-border-default"
      >
        <div className="flex items-center gap-2.5">
          {isEnabled
            ? <Shield size={16} className="text-success shrink-0" />
            : <ShieldOff size={16} className="text-text-tertiary shrink-0" />
          }
          <div>
            <p className="text-sm font-medium text-text-primary">
              {isEnabled ? t('encryption.statusActive') : t('encryption.statusInactive')}
            </p>
            <p className="text-xs text-text-secondary">
              {isEnabled
                ? t('encryption.statusDetail')
                : t('encryption.statusClear')}
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          isEnabled ? 'bg-success/10 text-success' : 'bg-bg-tertiary text-text-tertiary'
        }`}>
          {isEnabled ? t('encryption.on') : t('encryption.off')}
        </span>
      </div>

      {/* Avertissement si activé mais non déverrouillé */}
      {isEnabled && !hasDek && (
        <p className="text-xs text-warning flex items-center gap-1.5">
          <AlertTriangle size={12} />
          {t('encryption.sessionLocked')}
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
            data-testid="enable-encryption-button"
            onClick={onEnable}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded hover:bg-bg-secondary"
          >
            <Lock size={14} />
            {t('encryption.enableButton')}
          </button>
        ) : (
          <>
            <button
              data-testid="change-password-button"
              onClick={onChangePassword}
              disabled={!hasDek}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded hover:bg-bg-secondary disabled:opacity-40"
            >
              <RefreshCw size={14} />
              {t('encryption.changePasswordButton')}
            </button>
            {isWebAuthnAvailable() && (
              <button
                onClick={onWebAuthn}
                disabled={!hasDek}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded hover:bg-bg-secondary disabled:opacity-40"
              >
                <KeyRound size={14} />
                {t('encryption.webauthn.title')}
              </button>
            )}
            {/* Auto-lock */}
            <div className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary border border-border-default rounded">
              <Timer size={14} className="shrink-0" />
              <span className="flex-1">{t('encryption.autoLockLabel')}</span>
              <select
                value={autoLockMinutes ?? ''}
                onChange={(e) => onAutoLockChange(e.target.value ? Number(e.target.value) : null)}
                disabled={!hasDek}
                className="text-xs bg-bg-secondary border border-border-default rounded px-1.5 py-0.5 text-text-primary disabled:opacity-40"
              >
                <option value="">{t('encryption.autoLockDisabled')}</option>
                <option value="5">{t('encryption.autoLockMinutes', { minutes: 5 })}</option>
                <option value="15">{t('encryption.autoLockMinutes', { minutes: 15 })}</option>
                <option value="30">{t('encryption.autoLockMinutes', { minutes: 30 })}</option>
                <option value="60">{t('encryption.autoLockMinutes', { minutes: 60 })}</option>
              </select>
            </div>
            <button
              data-testid="disable-encryption-button"
              onClick={onDisable}
              disabled={!hasDek}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-error border border-error/20 rounded hover:bg-error/5 disabled:opacity-40"
            >
              <Unlock size={14} />
              {t('encryption.disableButton')}
            </button>
          </>
        )}

        {/* Lock session — distinct du disable chiffrement */}
        {isEnabled && hasDek && (
          <button
            data-testid="lock-session-button"
            onClick={onLockSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary border border-border-default rounded hover:bg-bg-secondary mt-1"
          >
            <LockKeyhole size={14} />
            {t('encryption.lockSessionButton')}
            <span className="ml-auto text-xs text-text-tertiary">Alt+L</span>
          </button>
        )}
      </div>

      {/* Note sécurité */}
      {!isEnabled && (
        <p className="text-xs text-text-tertiary border-t border-border-default pt-3">
          {t('encryption.securityNote')}
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
  const { t } = useTranslation('modals');
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
      <div className="p-3 bg-error/8 border border-error/25 rounded text-xs space-y-2">
        <p className="font-semibold text-error flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          {t('encryption.enable.riskTitle')}
        </p>
        <ul className="space-y-1 pl-1">
          {(t('encryption.enable.risks', { returnObjects: true }) as string[]).map((risk, i) => (
            <li key={i} className="flex items-start gap-1.5 text-text-secondary">
              <span className="shrink-0 mt-0.5 text-error">·</span>
              {risk}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-primary mb-1.5">
            {t('encryption.enable.passwordLabel')}
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              data-testid="enable-password-input"
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
            {t('encryption.enable.confirmLabel')}
          </label>
          <input
            data-testid="enable-password-confirm-input"
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
          {mismatch && <p className="text-xs text-error mt-1">{t('encryption.enable.mismatch')}</p>}
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
          {t('encryption.enable.cancel')}
        </button>
        <button
          data-testid="enable-confirm-button"
          onClick={() => onConfirm(password)}
          disabled={!canSubmit}
          className="flex-1 text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ? t('encryption.enable.busy') : t('encryption.enable.submit')}
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
  const { t } = useTranslation('modals');
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="space-y-4">
      <div className="p-3 bg-error/5 border border-error/20 rounded text-xs text-error flex items-start gap-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        <span>{t('encryption.disable.warning')}</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-primary mb-1.5">
          {t('encryption.disable.passwordLabel')}
        </label>
        <input
          ref={inputRef}
          data-testid="disable-password-input"
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
          {t('encryption.disable.cancel')}
        </button>
        <button
          data-testid="disable-confirm-button"
          onClick={() => onConfirm(password)}
          disabled={!password || isBusy}
          className="flex-1 text-sm font-medium bg-error text-white rounded px-4 py-2 hover:bg-red-700 disabled:opacity-50"
        >
          {isBusy ? t('encryption.disable.busy') : t('encryption.disable.submit')}
        </button>
      </div>
    </div>
  );
}

function WebAuthnView({
  dek,
  isBusy: _isBusy,
  error,
  onSuccess,
  onError,
  onBack,
}: {
  dek: Uint8Array | null;
  isBusy: boolean;
  error: string | null;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation('modals');
  const [credentials, setCredentials] = useState<WebAuthnCredentialEntry[]>([]);
  const [label, setLabel] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger les credentials existants
  useEffect(() => {
    db._encryptionMeta.get('main').then(meta => {
      if (meta?.webauthnCredentials) {
        setCredentials(meta.webauthnCredentials);
      }
    });
  }, []);

  const handleAdd = async () => {
    if (!dek || !label.trim()) return;
    setIsRegistering(true);
    onError(''); // clear
    try {
      const existingIds = credentials.map(c => c.credentialId);
      const entry = await registerWebAuthnCredential(dek, label.trim(), existingIds);
      const updated = [...credentials, entry];

      // Persister dans _encryptionMeta
      const meta = await db._encryptionMeta.get('main');
      if (meta) {
        await db._encryptionMeta.put({ ...meta, webauthnCredentials: updated });
      }

      setCredentials(updated);
      setLabel('');
      onSuccess(t('encryption.webauthn.successAdded'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[WebAuthn] Registration error:', msg, err);
      if (msg === 'PRF_NOT_SUPPORTED') {
        onError(t('encryption.webauthn.errorPrfNotSupported'));
      } else if (msg !== 'Registration cancelled') {
        onError(`${t('encryption.webauthn.errorRegistration')} (${msg})`);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRemove = async (index: number) => {
    if (!confirm(t('encryption.webauthn.deleteConfirm'))) return;
    const updated = credentials.filter((_, i) => i !== index);

    const meta = await db._encryptionMeta.get('main');
    if (meta) {
      await db._encryptionMeta.put({
        ...meta,
        webauthnCredentials: updated.length > 0 ? updated : undefined,
      });
    }

    setCredentials(updated);
    onSuccess(t('encryption.webauthn.successRemoved'));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        {t('encryption.webauthn.description')}
      </p>

      {/* Liste des clés existantes */}
      {credentials.length > 0 ? (
        <div className="space-y-2">
          {credentials.map((cred, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-bg-secondary border border-border-default rounded">
              <KeyRound size={14} className="text-text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{cred.label}</p>
                <p className="text-xs text-text-tertiary">
                  {t('encryption.webauthn.addedOn')} {new Date(cred.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="shrink-0 p-1 text-text-tertiary hover:text-error"
                title={t('encryption.webauthn.deleteConfirm')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary text-center py-3">
          {t('encryption.webauthn.noKeys')}
        </p>
      )}

      {/* Ajouter une clé */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-text-primary">
          {t('encryption.webauthn.label')}
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && label.trim() && !isRegistering && handleAdd()}
            placeholder={t('encryption.webauthn.labelPlaceholder')}
            disabled={isRegistering || !dek}
            className="flex-1 text-sm border border-border-default rounded px-3 py-2 focus:outline-none focus:border-accent disabled:bg-bg-secondary"
          />
          <button
            onClick={handleAdd}
            disabled={!label.trim() || isRegistering || !dek}
            className="text-sm font-medium bg-accent text-white rounded px-3 py-2 hover:bg-accent/90 disabled:opacity-40 whitespace-nowrap"
          >
            {isRegistering ? t('encryption.webauthn.registering') : t('encryption.webauthn.addKey')}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded text-xs text-error">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full text-sm text-text-secondary border border-border-default rounded px-4 py-2 hover:bg-bg-secondary"
      >
        {t('encryption.enable.cancel')}
      </button>
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
  const { t } = useTranslation('modals');
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
            {t('encryption.changePassword.oldLabel')}
          </label>
          <input
            ref={inputRef}
            data-testid="change-old-password-input"
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
            {t('encryption.changePassword.newLabel')}
          </label>
          <div className="relative">
            <input
              data-testid="change-new-password-input"
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
            {t('encryption.changePassword.confirmLabel')}
          </label>
          <input
            data-testid="change-new-password-confirm-input"
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
          {mismatch && <p className="text-xs text-error mt-1">{t('encryption.changePassword.mismatch')}</p>}
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
          {t('encryption.changePassword.cancel')}
        </button>
        <button
          data-testid="change-password-confirm-button"
          onClick={() => onConfirm(oldPassword, newPassword)}
          disabled={!canSubmit}
          className="flex-1 text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ? t('encryption.changePassword.busy') : t('encryption.changePassword.submit')}
        </button>
      </div>
    </div>
  );
}
