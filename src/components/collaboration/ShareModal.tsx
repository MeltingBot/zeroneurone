/**
 * ShareModal - Modal to share or stop sharing an investigation
 */

import { useState, useEffect } from 'react';
import { Copy, Check, Link2, Link2Off, Users, Server, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useSyncStore, useInvestigationStore } from '../../stores';
import { syncService } from '../../services/syncService';

const STORAGE_KEY = 'zeroneurone-signaling-server';
const DEFAULT_SERVER_URL = ''; // Empty = not configured

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({ isOpen, onClose }: ShareModalProps) {
  const { mode, share, unshare, localUser, updateLocalUserName, encryptionKey } = useSyncStore();
  const currentInvestigation = useInvestigationStore((state) => state.currentInvestigation);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Rebuild share URL when modal opens if already sharing
  useEffect(() => {
    if (isOpen && mode === 'shared' && encryptionKey && currentInvestigation && !shareUrl) {
      const url = syncService.buildShareUrl(
        currentInvestigation.id,
        encryptionKey,
        currentInvestigation.name
      );
      setShareUrl(url);
    }
  }, [isOpen, mode, encryptionKey, currentInvestigation, shareUrl]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(localUser.name);

  // Server configuration
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SERVER_URL;
  });
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl);

  const isShared = mode === 'shared';
  const isServerConfigured = serverUrl.trim() !== '';

  // Apply server URL on mount and when it changes
  useEffect(() => {
    if (serverUrl) {
      syncService.setServerUrl(serverUrl);
    }
  }, [serverUrl]);

  const handleShare = async () => {
    if (!isServerConfigured) {
      setShowServerConfig(true);
      return;
    }

    setIsLoading(true);
    try {
      const result = await share(currentInvestigation?.name);
      setShareUrl(result.shareUrl);
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshare = async () => {
    setIsLoading(true);
    try {
      await unshare();
      setShareUrl(null);
    } catch (error) {
      console.error('Failed to unshare:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateLocalUserName(nameInput.trim());
    }
    setEditingName(false);
  };

  const handleSaveServer = () => {
    const url = serverInput.trim();
    setServerUrl(url);
    if (url) {
      localStorage.setItem(STORAGE_KEY, url);
      syncService.setServerUrl(url);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleClose = () => {
    setEditingName(false);
    setNameInput(localUser.name);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Collaboration"
      width="sm"
      footer={
        <Button variant="secondary" onClick={handleClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4">
        {/* User identity section */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            Votre nom (visible par les autres)
          </label>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
              style={{ backgroundColor: localUser.color }}
            >
              {localUser.name.slice(0, 2).toUpperCase()}
            </div>
            {editingName ? (
              <div className="flex-1 flex gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNameInput(localUser.name);
                    }
                  }}
                  autoFocus
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSaveName}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                className="flex-1 text-left text-sm text-text-primary hover:text-accent"
                onClick={() => setEditingName(true)}
              >
                {localUser.name}
              </button>
            )}
          </div>
        </div>

        {/* Server configuration */}
        <div className="border-t border-border-default pt-4">
          <button
            className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary w-full"
            onClick={() => setShowServerConfig(!showServerConfig)}
          >
            <Server size={14} />
            <span>Serveur de synchronisation</span>
            {showServerConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {!isServerConfigured && (
              <span className="ml-auto text-warning">Non configuré</span>
            )}
            {isServerConfigured && !showServerConfig && (
              <span className="ml-auto text-text-tertiary truncate max-w-[150px]">
                {serverUrl.replace(/^wss?:\/\//, '')}
              </span>
            )}
          </button>

          {showServerConfig && (
            <div className="mt-3 space-y-2">
              <Input
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
                placeholder="wss://votre-serveur.example.com"
                className="text-xs font-mono"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveServer}
                  disabled={serverInput === serverUrl}
                >
                  Enregistrer
                </Button>
              </div>
              <p className="text-xs text-text-tertiary">
                Utilisez un serveur y-websocket compatible.
                Vous pouvez héberger le vôtre avec{' '}
                <code className="bg-bg-tertiary px-1 rounded">y-websocket</code>.
              </p>
            </div>
          )}
        </div>

        {/* Share status */}
        <div className="border-t border-border-default pt-4">
          {!isShared ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-text-secondary">
                <Users size={20} className="mt-0.5 flex-shrink-0" />
                <p className="text-sm">
                  Partagez cette investigation pour collaborer en temps réel.
                  Chaque participant verra les modifications instantanément.
                </p>
              </div>
              {!isServerConfigured && (
                <p className="text-xs text-warning bg-warning/10 px-3 py-2 rounded">
                  Configurez d'abord un serveur de synchronisation pour activer le partage.
                </p>
              )}
              <Button
                variant="primary"
                onClick={handleShare}
                disabled={isLoading || !isServerConfigured}
                className="w-full"
              >
                <Link2 size={16} />
                {isLoading ? 'Partage...' : 'Partager'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Share URL */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-secondary">
                  Lien de partage
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shareUrl || ''}
                    readOnly
                    className="flex-1 text-xs font-mono"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    title="Copier le lien"
                    disabled={!shareUrl}
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  {encryptionKey && <Lock size={12} className="text-success" />}
                  Envoyez ce lien aux personnes avec qui vous souhaitez collaborer.
                </p>
              </div>

              {/* Stop sharing */}
              <div className="pt-2 border-t border-border-default">
                <Button
                  variant="ghost"
                  onClick={handleUnshare}
                  disabled={isLoading}
                  className="w-full text-error hover:bg-error/10"
                >
                  <Link2Off size={16} />
                  {isLoading ? 'Arrêt...' : 'Arrêter le partage'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
