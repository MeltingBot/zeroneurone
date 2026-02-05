/**
 * JoinPage - Page to join a collaborative session
 *
 * Supports two URL formats for backwards compatibility:
 *
 * OLD FORMAT (pre-v1.7):
 * /join/{uuid}?server=...&name=...#key=xxx
 *
 * NEW FORMAT (v2):
 * /join/{hash}?server=...&async=1#key=xxx&name=xxx&id=uuid
 *
 * Flow:
 * 1. Parse URL to extract roomId, investigationId, key, name, server, async
 * 2. Check if signaling server is configured
 * 3. Check if investigation already exists locally, if not create it with the UUID
 * 4. Connect to shared session via syncService with encryption
 * 5. Redirect to investigation page
 */

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Users, AlertCircle, Loader2, Server, Lock, ShieldAlert } from 'lucide-react';
import { Layout, Button, Input } from '../components/common';
import { useInvestigationStore, useSyncStore } from '../stores';
import { syncService } from '../services/syncService';
import { isValidKeyString } from '../services/cryptoService';
import { investigationRepository } from '../db/repositories';

const STORAGE_KEY = 'zeroneurone-signaling-server';

type JoinState = 'input' | 'connecting' | 'error' | 'server-warning';

export function JoinPage() {
  const { t, i18n } = useTranslation('pages');
  // Path segment can be UUID (old format) or hash (new format)
  const { roomId: pathSegment } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { createInvestigationWithId } = useInvestigationStore();
  const { localUser, updateLocalUserName } = useSyncStore();

  const [state, setState] = useState<JoinState>('input');
  const [error, setError] = useState<string | null>(null);

  // User name editing
  const [editingUserName, setEditingUserName] = useState(false);
  const [userNameInput, setUserNameInput] = useState(localUser.name);

  // Parse URL fragment for all formats
  const urlParams = useRef<{
    encryptionKey: string | null;
    investigationId: string | null;
    nameFromFragment: string | null;
    roomId: string;
    isLegacyFormat: boolean;
    asyncEnabled: boolean;
  } | null>(null);

  if (!urlParams.current && pathSegment) {
    const hashParams = location.hash ? new URLSearchParams(location.hash.slice(1)) : null;

    const encryptionKey = hashParams?.get('key') || null;
    const fragmentId = hashParams?.get('id') || null;
    const fragmentName = hashParams?.get('name') || null;

    // Determine format:
    // - NEW FORMAT: id is in fragment, path contains hash
    // - OLD FORMAT: path contains UUID, name may be in query
    const isLegacyFormat = !fragmentId;

    // Parse async flag from query params
    const asyncEnabled = searchParams.get('async') === '1';

    urlParams.current = {
      encryptionKey,
      investigationId: fragmentId || pathSegment, // UUID from fragment (new) or path (old)
      nameFromFragment: fragmentName,
      roomId: pathSegment, // Always the path segment (hash or UUID)
      isLegacyFormat,
      asyncEnabled,
    };
  }

  // Get params from URL (supports both formats)
  const serverFromUrl = searchParams.get('server');
  const nameFromUrl = urlParams.current?.nameFromFragment || searchParams.get('name');
  const encryptionKeyFromUrl = urlParams.current?.encryptionKey || null;
  const investigationId = urlParams.current?.investigationId || pathSegment;
  const roomId = urlParams.current?.roomId || pathSegment;

  const hasValidEncryptionKey = encryptionKeyFromUrl && isValidKeyString(encryptionKeyFromUrl);

  // Server configuration - prioritize URL param, then localStorage
  const savedServer = localStorage.getItem(STORAGE_KEY) || '';
  const [serverUrl, setServerUrl] = useState(() => {
    // Don't automatically use server from URL - need user confirmation if different
    return savedServer;
  });
  const [serverInput, setServerInput] = useState(serverUrl || serverFromUrl || '');
  const isServerConfigured = serverUrl.trim() !== '';
  const isServerFromUrl = !!serverFromUrl;

  // Check if server from URL is different from saved server
  const serverMismatch = serverFromUrl && savedServer && serverFromUrl !== savedServer;
  // Server is new if URL has one but we have nothing saved
  const serverIsNew = serverFromUrl && !savedServer;

  // Investigation name - use name from URL or default
  const [investigationName, setInvestigationName] = useState(
    nameFromUrl || t('join.defaultSessionName')
  );

  // Show warning if server from URL is different from saved one
  useEffect(() => {
    if (serverMismatch && state === 'input') {
      setState('server-warning');
    }
  }, [serverMismatch, state]);

  // Auto-apply server only if user has no saved server (first time setup)
  useEffect(() => {
    if (serverIsNew && state === 'input') {
      setServerInput(serverFromUrl);
    }
  }, [serverIsNew, serverFromUrl, state]);

  const handleAcceptNewServer = () => {
    if (serverFromUrl) {
      setServerUrl(serverFromUrl);
      localStorage.setItem(STORAGE_KEY, serverFromUrl);
      syncService.setServerUrl(serverFromUrl);
      setState('input');
    }
  };

  const handleKeepOldServer = () => {
    setState('input');
  };

  // Validate investigation ID and encryption key
  useEffect(() => {
    if (!investigationId) {
      setError(t('join.errors.invalidSessionId'));
      setState('error');
    }
  }, [investigationId, t]);

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

  const handleJoin = async () => {
    if (!investigationId) return;

    if (!isServerConfigured) {
      setError(t('join.errors.configureServerFirst'));
      return;
    }

    // Validate server URL format
    const trimmedUrl = serverUrl.trim();
    if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
      setError(t('join.errors.invalidServerUrl'));
      return;
    }

    setState('connecting');
    setError(null);

    try {
      // Ensure syncService has the correct server URL before connecting
      syncService.setServerUrl(trimmedUrl);

      // Check if investigation already exists locally
      let existingInvestigation = await investigationRepository.getById(investigationId);

      if (!existingInvestigation) {
        const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
        // Create investigation with the specific UUID from the share link
        existingInvestigation = await createInvestigationWithId(
          investigationId,
          investigationName || t('join.defaultSessionName'),
          t('join.sharedSessionJoined', { date: new Date().toLocaleDateString(locale) })
        );
      }

      // Close any existing Y.Doc first
      await syncService.close();

      // Open in shared mode
      // - investigationId: UUID for local storage
      // - encryptionKey: for E2E encryption
      // - roomId: hash (new format) or UUID (legacy) for WebSocket
      // - asyncEnabled: whether async buffering is enabled
      await syncService.openShared(
        investigationId!,
        encryptionKeyFromUrl || undefined,
        roomId,  // Pass separate roomId for WebSocket
        urlParams.current?.asyncEnabled || false
      );

      // Wait for WebSocket connection and initial sync to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Timeout is OK - we're connected but no peers to sync with
          const state = syncService.getState();
          if (state.connected) {
            resolve();
          } else {
            reject(new Error(t('join.errors.connectionTimeout')));
          }
        }, 10000); // 10 second timeout

        let wasConnected = false;

        const checkConnection = () => {
          const state = syncService.getState();

          if (state.error) {
            clearTimeout(timeout);
            reject(new Error(state.error));
            return;
          }

          if (state.connected) {
            wasConnected = true;
            // Wait for sync to complete (syncing becomes false)
            // or a short delay if no peers to sync with
            if (!state.syncing) {
              clearTimeout(timeout);
              resolve();
            } else {
              // Still syncing, check again
              setTimeout(checkConnection, 100);
            }
          } else if (wasConnected) {
            // Lost connection after being connected
            clearTimeout(timeout);
            reject(new Error(t('join.errors.connectionLost')));
          } else {
            // Not yet connected, check again
            setTimeout(checkConnection, 100);
          }
        };

        // Start checking after a brief delay to let WebSocket initialize
        setTimeout(checkConnection, 100);
      });

      // Navigate to the investigation
      navigate(`/investigation/${existingInvestigation.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message || t('join.errors.connectionError'));
      setState('error');
    }
  };

  const handleRetry = () => {
    setState('input');
    setError(null);
  };

  if (state === 'connecting') {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-3 text-accent">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-lg font-medium">{t('join.connecting')}</span>
          </div>
          <p className="text-sm text-text-secondary flex items-center gap-1">
            {t('join.syncing', { id: investigationId?.slice(0, 8) })}
            {hasValidEncryptionKey && <Lock size={12} className="text-success" />}
          </p>
        </div>
      </Layout>
    );
  }

  if (state === 'error') {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-3 text-error">
            <AlertCircle size={24} />
            <span className="text-lg font-medium">{t('join.connectionError')}</span>
          </div>
          <p className="text-sm text-text-secondary max-w-md text-center">
            {error || t('join.cannotJoin')}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate('/')}>
              {t('join.backToHome')}
            </Button>
            <Button variant="primary" onClick={handleRetry}>
              {t('join.retry')}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Security warning: server in link is different from saved server
  if (state === 'server-warning') {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center">
          <div className="w-full max-w-lg p-6 bg-bg-primary border border-warning rounded">
            {/* Warning header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                <ShieldAlert size={20} className="text-warning" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-warning">
                  {t('join.serverWarning.title')}
                </h1>
                <p className="text-xs text-text-secondary">
                  {t('join.serverWarning.subtitle')}
                </p>
              </div>
            </div>

            {/* Warning message */}
            <div className="mb-6 p-4 bg-warning/5 border border-warning/20 rounded">
              <p className="text-sm text-text-primary mb-3">
                {t('join.serverWarning.message')}
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-text-secondary w-28 flex-shrink-0">{t('join.serverWarning.yourServer')}</span>
                  <code className="font-mono text-text-primary break-all bg-bg-secondary px-1 rounded">
                    {savedServer.replace(/^wss?:\/\//, '')}
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-text-secondary w-28 flex-shrink-0">{t('join.serverWarning.linkServer')}</span>
                  <code className="font-mono text-warning break-all bg-warning/10 px-1 rounded">
                    {serverFromUrl?.replace(/^wss?:\/\//, '')}
                  </code>
                </div>
              </div>

              <p className="mt-4 text-xs text-text-secondary">
                {t('join.serverWarning.trustNote')}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleKeepOldServer}
                className="flex-1"
              >
                {t('join.serverWarning.keepOld')}
              </Button>
              <Button
                variant="primary"
                onClick={handleAcceptNewServer}
                className="flex-1"
              >
                {t('join.serverWarning.useNew')}
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-full max-w-md p-6 bg-bg-primary border border-border-default rounded">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Users size={20} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {t('join.title')}
              </h1>
              <p className="text-xs text-text-secondary flex items-center gap-1">
                {t('join.sessionId', { id: investigationId?.slice(0, 8) })}
                {hasValidEncryptionKey && <Lock size={10} className="text-success" />}
              </p>
            </div>
          </div>


          {/* Server configuration (if not configured) */}
          {!isServerConfigured && (
            <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded">
              <div className="flex items-center gap-2 mb-2">
                <Server size={16} className="text-warning" />
                <span className="text-sm font-medium text-warning">
                  {t('join.serverNotConfigured.title')}
                </span>
              </div>
              <p className="text-xs text-text-secondary mb-3">
                {t('join.serverNotConfigured.message')}
              </p>
              <div className="space-y-2">
                <Input
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  placeholder={t('join.serverNotConfigured.placeholder')}
                  className="text-xs font-mono"
                />
                <Button
                  size="sm"
                  onClick={handleSaveServer}
                  disabled={!serverInput.trim()}
                >
                  {t('join.serverNotConfigured.save')}
                </Button>
              </div>
            </div>
          )}

          {/* Server info (if configured) */}
          {isServerConfigured && (
            <div className="mb-4 p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-text-secondary">{t('join.serverInfo.label')}</p>
                {isServerFromUrl && (
                  <span className="text-xs text-success">{t('join.serverInfo.providedByLink')}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-primary truncate">
                  {serverUrl.replace(/^wss?:\/\//, '')}
                </span>
                {!isServerFromUrl && (
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={() => {
                      setServerInput(serverUrl);
                      setServerUrl('');
                    }}
                  >
                    {t('join.serverInfo.modify')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* User info - editable */}
          <div className="mb-4 p-3 bg-bg-secondary rounded border border-border-default">
            <p className="text-xs text-text-secondary mb-1">{t('join.userInfo.joiningAs')}</p>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                style={{ backgroundColor: localUser.color }}
              >
                {localUser.name.slice(0, 2).toUpperCase()}
              </div>
              {editingUserName ? (
                <div className="flex-1 flex gap-2">
                  <Input
                    value={userNameInput}
                    onChange={(e) => setUserNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && userNameInput.trim()) {
                        updateLocalUserName(userNameInput.trim());
                        setEditingUserName(false);
                      }
                      if (e.key === 'Escape') {
                        setEditingUserName(false);
                        setUserNameInput(localUser.name);
                      }
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (userNameInput.trim()) {
                        updateLocalUserName(userNameInput.trim());
                        setEditingUserName(false);
                      }
                    }}
                  >
                    OK
                  </Button>
                </div>
              ) : (
                <button
                  className="flex-1 text-left text-sm font-medium text-text-primary hover:text-accent"
                  onClick={() => {
                    setUserNameInput(localUser.name);
                    setEditingUserName(true);
                  }}
                >
                  {localUser.name}
                </button>
              )}
            </div>
          </div>

          {/* Investigation name input */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {t('join.localCopy.label')}
            </label>
            <Input
              value={investigationName}
              onChange={(e) => setInvestigationName(e.target.value)}
              placeholder={t('join.defaultSessionName')}
            />
            <p className="mt-1 text-xs text-text-tertiary">
              {t('join.localCopy.hint')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/')}
              className="flex-1"
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleJoin}
              disabled={!isServerConfigured}
              className="flex-1"
            >
              {t('join.join')}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
