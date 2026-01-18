/**
 * JoinPage - Page to join a collaborative session via investigation UUID
 *
 * URL format: /join/{investigationId}?server=...&name=...#key=xxx
 *
 * Flow:
 * 1. Extract investigation UUID from URL path (now used as roomId)
 * 2. Extract encryption key from URL fragment (#key=xxx)
 * 3. Check if signaling server is configured
 * 4. Check if investigation already exists locally, if not create it with the UUID
 * 5. Connect to shared session via syncService with encryption
 * 6. Redirect to investigation page
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Users, AlertCircle, Loader2, Server, Lock } from 'lucide-react';
import { Layout, Button, Input } from '../components/common';
import { useInvestigationStore, useSyncStore } from '../stores';
import { syncService } from '../services/syncService';
import { isValidKeyString } from '../services/cryptoService';
import { investigationRepository } from '../db/repositories';

const STORAGE_KEY = 'zeroneurone-signaling-server';

type JoinState = 'input' | 'connecting' | 'error';

export function JoinPage() {
  // The roomId is now the investigation UUID
  const { roomId: investigationId } = useParams<{ roomId: string }>();
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

  // Get params from URL
  const serverFromUrl = searchParams.get('server');
  const nameFromUrl = searchParams.get('name');

  // Extract encryption key from URL fragment (#key=xxx)
  const encryptionKeyFromUrl = useRef<string | null>(null);
  if (location.hash && !encryptionKeyFromUrl.current) {
    const hashParams = new URLSearchParams(location.hash.slice(1));
    encryptionKeyFromUrl.current = hashParams.get('key');
  }
  const hasValidEncryptionKey = encryptionKeyFromUrl.current && isValidKeyString(encryptionKeyFromUrl.current);

  // Server configuration - prioritize URL param, then localStorage
  const [serverUrl, setServerUrl] = useState(() => {
    return serverFromUrl || localStorage.getItem(STORAGE_KEY) || '';
  });
  const [serverInput, setServerInput] = useState(serverUrl);
  const isServerConfigured = serverUrl.trim() !== '';
  const isServerFromUrl = !!serverFromUrl;

  // Investigation name - use name from URL or default
  const [investigationName, setInvestigationName] = useState(
    nameFromUrl || 'Session collaborative'
  );

  // Apply server from URL and save to localStorage
  useEffect(() => {
    if (serverFromUrl) {
      localStorage.setItem(STORAGE_KEY, serverFromUrl);
      syncService.setServerUrl(serverFromUrl);
    }
  }, [serverFromUrl]);

  // Validate investigation ID and encryption key
  useEffect(() => {
    if (!investigationId) {
      setError('ID de session invalide');
      setState('error');
    }
  }, [investigationId]);

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
      setError('Configurez d\'abord un serveur de synchronisation');
      return;
    }

    // Validate server URL format
    const trimmedUrl = serverUrl.trim();
    if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
      setError('Le serveur doit commencer par ws:// ou wss://');
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
        // Create investigation with the specific UUID from the share link
        existingInvestigation = await createInvestigationWithId(
          investigationId,
          investigationName || 'Session collaborative',
          `Session partagée rejointe le ${new Date().toLocaleDateString('fr-FR')}`
        );
      }

      // Close any existing Y.Doc first
      await syncService.close();

      // Open in shared mode with the investigation UUID as roomId and encryption key
      await syncService.openShared(investigationId, encryptionKeyFromUrl.current || undefined);

      // Wait a moment for WebSocket connection to establish
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Délai de connexion dépassé'));
        }, 10000); // 10 second timeout

        const checkConnection = () => {
          const state = syncService.getState();
          if (state.connected) {
            clearTimeout(timeout);
            resolve();
          } else if (state.error) {
            clearTimeout(timeout);
            reject(new Error(state.error));
          } else {
            // Check again in 100ms
            setTimeout(checkConnection, 100);
          }
        };

        // Start checking after a brief delay to let WebSocket initialize
        setTimeout(checkConnection, 100);
      });

      // Navigate to the investigation
      navigate(`/investigation/${existingInvestigation.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la connexion');
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
            <span className="text-lg font-medium">Connexion en cours...</span>
          </div>
          <p className="text-sm text-text-secondary flex items-center gap-1">
            Synchronisation avec la session {investigationId?.slice(0, 8)}...
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
            <span className="text-lg font-medium">Erreur de connexion</span>
          </div>
          <p className="text-sm text-text-secondary max-w-md text-center">
            {error || 'Impossible de rejoindre la session. Vérifiez le lien et réessayez.'}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Retour à l'accueil
            </Button>
            <Button variant="primary" onClick={handleRetry}>
              Réessayer
            </Button>
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
                Rejoindre une session
              </h1>
              <p className="text-xs text-text-secondary flex items-center gap-1">
                Session: {investigationId?.slice(0, 8)}...
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
                  Serveur non configuré
                </span>
              </div>
              <p className="text-xs text-text-secondary mb-3">
                Pour rejoindre une session collaborative, vous devez configurer le même serveur de synchronisation que l'hôte.
              </p>
              <div className="space-y-2">
                <Input
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  placeholder="wss://serveur.example.com"
                  className="text-xs font-mono"
                />
                <Button
                  size="sm"
                  onClick={handleSaveServer}
                  disabled={!serverInput.trim()}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          )}

          {/* Server info (if configured) */}
          {isServerConfigured && (
            <div className="mb-4 p-3 bg-bg-secondary rounded border border-border-default">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-text-secondary">Serveur de synchronisation</p>
                {isServerFromUrl && (
                  <span className="text-xs text-success">fourni par le lien</span>
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
                    Modifier
                  </button>
                )}
              </div>
            </div>
          )}

          {/* User info - editable */}
          <div className="mb-4 p-3 bg-bg-secondary rounded border border-border-default">
            <p className="text-xs text-text-secondary mb-1">Vous rejoindrez en tant que</p>
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
              Nom de votre copie locale
            </label>
            <Input
              value={investigationName}
              onChange={(e) => setInvestigationName(e.target.value)}
              placeholder="Session collaborative"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Ce nom sera utilisé pour identifier cette session sur votre appareil.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/')}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleJoin}
              disabled={!isServerConfigured}
              className="flex-1"
            >
              Rejoindre
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
