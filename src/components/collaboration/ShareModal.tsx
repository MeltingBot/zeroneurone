/**
 * ShareModal - Modal to share or stop sharing an investigation
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Link2, Link2Off, Users, Server, ChevronDown, ChevronUp, Lock, Clock } from 'lucide-react';
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
  const { t } = useTranslation('modals');
  const { mode, share, unshare, localUser, updateLocalUserName } = useSyncStore();
  const currentInvestigation = useInvestigationStore((state) => state.currentInvestigation);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Rebuild share URL when modal opens if already sharing/connected
  // Works for both host and client (gets key from syncService)
  useEffect(() => {
    const buildUrl = async () => {
      if (isOpen && mode === 'shared' && currentInvestigation && !shareUrl) {
        const encryptionKey = syncService.getEncryptionKey();
        if (encryptionKey) {
          const url = await syncService.buildShareUrl(
            currentInvestigation.id,
            encryptionKey,
            currentInvestigation.name
          );
          setShareUrl(url);
        }
      }
    };
    buildUrl();
  }, [isOpen, mode, currentInvestigation, shareUrl]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(localUser.name);

  // Async collaboration option
  const [asyncEnabled, setAsyncEnabled] = useState(false);

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
      const result = await share(currentInvestigation?.name, asyncEnabled);
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
      title={t('collaboration.title')}
      width="sm"
      footer={
        <Button variant="secondary" onClick={handleClose}>
          {t('collaboration.close')}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* User identity section */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            {t('collaboration.yourName')}
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
            <span>{t('collaboration.server')}</span>
            {showServerConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {!isServerConfigured && (
              <span className="ml-auto text-warning">{t('collaboration.notConfigured')}</span>
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
                placeholder={t('collaboration.serverPlaceholder')}
                className="text-xs font-mono"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveServer}
                  disabled={serverInput === serverUrl}
                >
                  {t('collaboration.save')}
                </Button>
              </div>
              <p className="text-xs text-text-tertiary">
                {t('collaboration.serverHelp')}{' '}
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
                  {t('collaboration.shareDescription')}
                </p>
              </div>

              {/* Async collaboration option */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={asyncEnabled}
                  onChange={(e) => setAsyncEnabled(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <Clock size={14} />
                    {t('collaboration.asyncMode')}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {t('collaboration.asyncModeHelp')}
                  </p>
                </div>
              </label>

              {!isServerConfigured && (
                <p className="text-xs text-warning bg-warning/10 px-3 py-2 rounded">
                  {t('collaboration.serverRequired')}
                </p>
              )}
              <Button
                variant="primary"
                onClick={handleShare}
                disabled={isLoading || !isServerConfigured}
                className="w-full"
              >
                <Link2 size={16} />
                {isLoading ? t('collaboration.sharing') : t('collaboration.share')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Share URL */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-secondary">
                  {t('collaboration.shareLink')}
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
                    title={t('collaboration.copyLink')}
                    disabled={!shareUrl}
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  {shareUrl && <Lock size={12} className="text-success" />}
                  {t('collaboration.shareLinkHelp')}
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
                  {isLoading ? t('collaboration.stopping') : t('collaboration.stopSharing')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
