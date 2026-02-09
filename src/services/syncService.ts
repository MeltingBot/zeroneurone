/**
 * SyncService - Manages Y.Doc and sync providers
 *
 * Handles:
 * - Y.Doc lifecycle (create, open, close)
 * - y-indexeddb provider for local persistence
 * - y-websocket provider for collaboration via signaling server
 * - E2E encryption for data exchange
 * - Sync state management
 */

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import type { SyncState } from '../types/yjs';
import { DEFAULT_SYNC_STATE } from '../types/yjs';
import { createEncryptedWebSocketClass } from './encryptedWebSocket';
import { generateEncryptionKey, isValidKeyString, deriveRoomId, deriveAccessToken } from './cryptoService';

// Y.js sync protocol message types (from y-protocols/sync)
const messageSync = 0;
const messageYjsUpdate = 2;

// Storage key for signaling server URL
const STORAGE_KEY = 'zeroneurone-signaling-server';

type StateListener = (state: SyncState) => void;

class SyncService {
  private ydoc: Y.Doc | null = null;
  private indexeddbProvider: IndexeddbPersistence | null = null;
  private websocketProvider: WebsocketProvider | null = null;
  private investigationId: string | null = null;
  private encryptionKey: string | null = null;

  private state: SyncState = { ...DEFAULT_SYNC_STATE };
  private stateListeners: Set<StateListener> = new Set();

  // Load server URL from localStorage (empty string if not configured)
  private serverUrl: string = '';

  constructor() {
    // Load server URL from localStorage on initialization
    if (typeof localStorage !== 'undefined') {
      this.serverUrl = localStorage.getItem(STORAGE_KEY) || '';
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Set the signaling server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  /**
   * Get the current signaling server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Check if a signaling server is configured
   */
  isServerConfigured(): boolean {
    return this.serverUrl.trim() !== '';
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Get the current sync state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  private setState(changes: Partial<SyncState>): void {
    this.state = { ...this.state, ...changes };
    this.stateListeners.forEach(listener => listener(this.getState()));
  }

  // ============================================================================
  // Y.DOC ACCESS
  // ============================================================================

  /**
   * Get the current Y.Doc (null if no investigation open)
   */
  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }

  /**
   * Get the current investigation ID
   */
  getInvestigationId(): string | null {
    return this.investigationId;
  }

  /**
   * Get the current encryption key (if sharing/connected)
   */
  getEncryptionKey(): string | null {
    return this.encryptionKey;
  }

  /**
   * Check if an investigation is currently open
   */
  isOpen(): boolean {
    return this.ydoc !== null;
  }

  /**
   * Wait for the WebSocket provider to complete initial Y.js sync.
   * Resolves immediately if already synced, not connected, or no provider.
   * Rejects after timeout to avoid blocking forever.
   */
  waitForSync(timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve) => {
      if (!this.websocketProvider) {
        resolve();
        return;
      }
      if (this.websocketProvider.synced) {
        resolve();
        return;
      }
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      this.websocketProvider.on('sync', (synced: boolean) => {
        if (synced) done();
      });
      setTimeout(done, timeoutMs);
    });
  }

  // ============================================================================
  // LOCAL MODE
  // ============================================================================

  /**
   * Open an investigation in local mode (no sync)
   * Creates/loads Y.Doc with IndexedDB persistence
   */
  async openLocal(investigationId: string): Promise<Y.Doc> {
    // Close any existing investigation
    await this.close();

    this.investigationId = investigationId;
    this.ydoc = new Y.Doc();

    // Set up IndexedDB persistence
    const dbName = `zeroneurone-ydoc-${investigationId}`;
    this.indexeddbProvider = new IndexeddbPersistence(dbName, this.ydoc);

    // Wait for local data to be loaded
    await this.indexeddbProvider.whenSynced;

    this.setState({
      mode: 'local',
      connected: false,
      syncing: false,
      error: null,
      roomId: null,
      peerCount: 0,
    });

    return this.ydoc;
  }

  // ============================================================================
  // SHARED MODE
  // ============================================================================

  /**
   * Open an investigation in shared mode (sync with peers via signaling server)
   * If the investigation has local data, it will be synced with peers
   *
   * @param investigationId - The investigation UUID (used for local storage)
   * @param encryptionKey - The AES-256-GCM key for E2E encryption (optional)
   * @param roomId - The room ID for WebSocket (optional, defaults to investigationId for legacy support)
   * @param asyncEnabled - Whether async buffering is enabled (default: false)
   */
  async openShared(
    investigationId: string,
    encryptionKey?: string,
    roomId?: string,
    asyncEnabled: boolean = false
  ): Promise<Y.Doc> {
    if (!this.isServerConfigured()) {
      throw new Error('Serveur de synchronisation non configuré');
    }

    // Validate encryption key if provided
    if (encryptionKey && !isValidKeyString(encryptionKey)) {
      throw new Error('Clé de chiffrement invalide');
    }

    // Close any existing investigation
    await this.close();

    this.investigationId = investigationId;
    this.encryptionKey = encryptionKey || null;
    this.ydoc = new Y.Doc();

    // Set up IndexedDB persistence (for offline support)
    // Uses investigationId (UUID) for local storage
    const dbName = `zeroneurone-ydoc-${investigationId}`;
    this.indexeddbProvider = new IndexeddbPersistence(dbName, this.ydoc);

    // Wait for local data to be loaded first
    await this.indexeddbProvider.whenSynced;

    // Derive access token if we have encryption key and roomId
    const effectiveRoomId = roomId || investigationId;
    let accessToken: string | undefined;
    if (encryptionKey && roomId) {
      accessToken = await deriveAccessToken(encryptionKey, roomId);
    }

    // Connect to signaling server
    // Uses roomId if provided (hashed), otherwise investigationId (legacy)
    this.connectWebSocket(effectiveRoomId, encryptionKey, {
      async: asyncEnabled,
      token: accessToken,
    });

    return this.ydoc;
  }

  /**
   * Share the currently open investigation
   * Generates a new encryption key and derives a hashed roomId
   *
   * @param asyncEnabled - Whether to enable async buffering (default: false)
   * @returns The generated encryption key for sharing
   */
  async share(asyncEnabled: boolean = false): Promise<string> {
    if (!this.isServerConfigured()) {
      throw new Error('Serveur de synchronisation non configuré');
    }

    if (!this.ydoc || !this.investigationId) {
      throw new Error('No investigation open');
    }

    // Always generate a new encryption key when sharing
    // This invalidates previous share links (security measure)
    const newKey = await generateEncryptionKey();
    this.encryptionKey = newKey;

    // Derive hashed roomId from investigation UUID + key
    // Server cannot correlate sessions, and re-sharing creates new room
    const hashedRoomId = await deriveRoomId(this.investigationId, newKey);

    // Derive access token for room authentication
    const accessToken = await deriveAccessToken(newKey, hashedRoomId);

    // If already shared, disconnect first to reconnect with new key
    if (this.websocketProvider) {
      this.websocketProvider.disconnect();
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }

    // Connect using hashed roomId (not UUID) with optional async buffering
    this.connectWebSocket(hashedRoomId, newKey, {
      async: asyncEnabled,
      token: accessToken,
    });

    return newKey;
  }

  /**
   * Stop sharing (disconnect from signaling server)
   */
  async unshare(): Promise<void> {
    if (this.websocketProvider) {
      // CRITICAL: Before disconnecting, send a full state snapshot
      // This enables async collaboration - new clients can sync from buffered state
      // Y.js sync protocol is bidirectional (sync step 1 <-> sync step 2),
      // but a full state update can be applied by any client, even with empty Y.Doc
      if (this.ydoc && this.websocketProvider.ws?.readyState === WebSocket.OPEN) {
        try {
          const fullState = Y.encodeStateAsUpdate(this.ydoc);

          // Encode as y-websocket sync update message
          // Format: [messageSync(0), messageYjsUpdate(2), update data]
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          encoding.writeVarUint(encoder, messageYjsUpdate);
          encoding.writeVarUint8Array(encoder, fullState);

          this.websocketProvider.ws.send(encoding.toUint8Array(encoder));

          // Small delay to ensure the snapshot is sent before disconnecting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.error('[SyncService] Failed to send state snapshot:', err);
        }
      }

      // Clear awareness state to notify peers immediately of our departure
      if (this.websocketProvider.awareness) {
        this.websocketProvider.awareness.setLocalState(null);
      }

      // Small delay to let the awareness update propagate before disconnecting
      await new Promise(resolve => setTimeout(resolve, 100));

      // Disconnect first to prevent auto-reconnect, then destroy
      this.websocketProvider.disconnect();
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }

    // Clear encryption key when stopping sharing
    this.encryptionKey = null;

    this.setState({
      mode: 'local',
      connected: false,
      syncing: false,
      roomId: null,
      peerCount: 0,
    });
  }

  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================

  private connectWebSocket(
    roomId: string,
    encryptionKey?: string,
    options?: { async?: boolean; token?: string }
  ): void {
    if (!this.ydoc) {
      throw new Error('No Y.Doc available');
    }

    // Destroy existing provider if any
    if (this.websocketProvider) {
      this.websocketProvider.disconnect();
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }

    // Create encrypted WebSocket class if encryption key is provided
    const WebSocketClass = createEncryptedWebSocketClass(encryptionKey || null);

    // Build query params for async mode and token
    const urlParams: string[] = [];
    if (options?.async) {
      urlParams.push('async=1');
    }
    if (options?.token) {
      urlParams.push(`token=${encodeURIComponent(options.token)}`);
    }

    // Create WebSocket provider with reconnection options
    // y-websocket handles automatic reconnection with exponential backoff
    // y-websocket constructs URL as: serverUrl/roomId
    // So we append params to roomId to get: serverUrl/roomId?params
    const roomIdWithParams = urlParams.length > 0
      ? `${roomId}?${urlParams.join('&')}`
      : roomId;

    this.websocketProvider = new WebsocketProvider(
      this.serverUrl,
      roomIdWithParams,
      this.ydoc,
      {
        WebSocketPolyfill: WebSocketClass,
        // Max time between reconnection attempts (30 seconds)
        maxBackoffTime: 30000,
        // Disable periodic resync - it causes glitches during drag operations
        // Y.js CRDT handles consistency without forced resyncs
        resyncInterval: -1,
      }
    );

    // Track if we were previously connected (for reconnection detection)
    let wasConnected = false;

    // Set syncing to true while waiting for initial sync
    this.setState({ syncing: true });

    // Listen to connection status
    this.websocketProvider.on('status', (event: { status: string }) => {
      const connected = event.status === 'connected';

      if (connected) {
        // Successfully connected or reconnected
        if (wasConnected) {
          // This was a reconnection - clear reconnecting state
        }
        this.setState({
          connected: true,
          reconnecting: false,
          error: null,
        });
        wasConnected = true;

        // After connection, check sync state after a short delay
        // This handles the case where 'sync' event isn't emitted (no peers, already synced)
        // Also mark as synced if we're alone (peerCount === 0)
        setTimeout(() => {
          const currentState = this.getState();
          if (this.websocketProvider?.synced || currentState.peerCount === 0) {
            this.setState({ syncing: false });
          }
        }, 500);
      } else {
        // Disconnected
        if (wasConnected) {
          // We were connected before, now disconnected - entering reconnection mode
          this.setState({
            connected: false,
            reconnecting: true,
            syncing: true, // Reset syncing state for reconnection
            error: null, // Don't show error during reconnection attempts
          });
        } else {
          // Never connected yet
          this.setState({ connected: false });
        }
      }
    });

    // Listen to sync status
    this.websocketProvider.on('sync', (synced: boolean) => {
      // When alone (no peers), there's no one to sync with — never set syncing to true
      if (!synced && this.getState().peerCount === 0) return;
      this.setState({ syncing: !synced });
    });

    // Listen to awareness for peer count and trigger re-broadcast on change
    if (this.websocketProvider.awareness) {
      let previousPeerCount = 0;

      const updatePeerCount = () => {
        const awareness = this.websocketProvider?.awareness;
        if (!awareness) return;

        const states = awareness.getStates();
        // Subtract 1 for self
        const peerCount = states ? Math.max(0, states.size - 1) : 0;
        this.setState({ peerCount });

        // When peer count drops to 0 (we're alone), mark sync as complete
        // There's no one to sync with, so we're effectively synced
        if (peerCount === 0 && previousPeerCount > 0) {
          this.setState({ syncing: false });
        }

        // When peer count increases (someone joined), re-broadcast our state
        // This helps new clients see existing clients with relay servers
        if (peerCount > previousPeerCount && awareness.getLocalState()) {
          setTimeout(() => {
            const currentAwareness = this.websocketProvider?.awareness;
            if (currentAwareness) {
              const state = currentAwareness.getLocalState();
              if (state) {
                currentAwareness.setLocalState({ ...state });
              }
            }
          }, 200);
        }
        previousPeerCount = peerCount;
      };

      this.websocketProvider.awareness.on('change', updatePeerCount);
      updatePeerCount();
    }

    // Handle connection errors (only show if not in reconnecting mode)
    this.websocketProvider.on('connection-error', (event: Event | { message?: string }) => {
      // Don't overwrite reconnecting state with error - let it keep trying
      if (!this.state.reconnecting) {
        const message = (event && typeof event === 'object' && 'message' in event)
          ? (event as { message?: string }).message
          : 'Erreur de connexion au serveur';
        this.setState({ error: message || 'Erreur de connexion au serveur' });
      }
    });

    // Handle connection close
    this.websocketProvider.on('connection-close', () => {
      if (wasConnected && this.state.mode === 'shared') {
        // Only set reconnecting if we're still supposed to be in shared mode
        this.setState({
          connected: false,
          reconnecting: true,
        });
      }
    });

    this.setState({
      mode: 'shared',
      roomId,
      error: null,
      reconnecting: false,
    });
  }

  // ============================================================================
  // AWARENESS (Presence)
  // ============================================================================

  /**
   * Get the WebSocket provider's awareness instance
   * Used for presence features (cursors, selection, etc.)
   */
  getAwareness() {
    return this.websocketProvider?.awareness || null;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Close the current investigation and clean up resources
   */
  async close(): Promise<void> {
    // Disconnect and destroy WebSocket provider
    if (this.websocketProvider) {
      this.websocketProvider.disconnect();
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }

    // Destroy IndexedDB provider
    if (this.indexeddbProvider) {
      await this.indexeddbProvider.destroy();
      this.indexeddbProvider = null;
    }

    // Destroy Y.Doc
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    this.investigationId = null;
    this.encryptionKey = null;

    this.setState({ ...DEFAULT_SYNC_STATE });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Check if E2E encryption is active
   */
  isEncrypted(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Build a share URL for the current investigation
   *
   * NEW FORMAT (v2):
   * /join/{hashedRoomId}?server=wss://...&async=1#key=xxx&name=xxx&id=uuid
   *
   * Security improvements:
   * - roomId is hashed (server cannot see real UUID)
   * - name is in fragment (never sent to server)
   * - id (UUID) is in fragment (never sent to server)
   * - key is in fragment (never sent to server)
   * - async flag enables server-side buffering for asynchronous collaboration
   *
   * @param investigationId - The investigation UUID
   * @param encryptionKey - The E2E encryption key
   * @param investigationName - Optional display name
   * @param asyncEnabled - Whether async buffering is enabled (default: false)
   * @param baseUrl - Optional base URL (defaults to current origin)
   */
  async buildShareUrl(
    investigationId: string,
    encryptionKey: string,
    investigationName?: string,
    asyncEnabled?: boolean,
    baseUrl?: string
  ): Promise<string> {
    const base = baseUrl || window.location.origin;

    // Derive hashed room ID from UUID + key (server cannot correlate)
    const hashedRoomId = await deriveRoomId(investigationId, encryptionKey);

    const url = new URL(`${base}/join/${hashedRoomId}`);

    if (this.serverUrl) {
      url.searchParams.set('server', this.serverUrl);
    }

    // Add async flag to query params (visible to server, needed for buffering)
    if (asyncEnabled) {
      url.searchParams.set('async', '1');
    }

    // All sensitive data in fragment (never sent to server)
    const fragmentParams = new URLSearchParams();
    fragmentParams.set('key', encryptionKey);
    fragmentParams.set('id', investigationId);
    if (investigationName) {
      fragmentParams.set('name', investigationName);
    }

    return `${url.toString()}#${fragmentParams.toString()}`;
  }

  /**
   * Parse a share URL to extract investigation ID and encryption key
   *
   * Supports both formats for backwards compatibility:
   *
   * OLD FORMAT (pre-v1.7):
   * /join/{uuid}?server=...&name=...#key=xxx
   *
   * NEW FORMAT (v2):
   * /join/{hash}?server=...&async=1#key=xxx&name=xxx&id=uuid
   *
   * @param url - The share URL to parse
   * @returns Object with investigationId, encryptionKey, serverUrl, name, roomId, async flag
   */
  parseShareUrl(url: string): {
    investigationId: string;
    encryptionKey: string | null;
    serverUrl: string | null;
    name: string | null;
    roomId: string; // The actual roomId to use for WebSocket (hash or UUID)
    isLegacyFormat: boolean;
    asyncEnabled: boolean; // Whether async buffering is enabled
  } {
    const parsed = new URL(url);

    // Extract path segment: /join/{something}
    const pathMatch = parsed.pathname.match(/\/join\/([^/]+)/);
    const pathSegment = pathMatch ? pathMatch[1] : '';

    // Parse fragment parameters
    let encryptionKey: string | null = null;
    let fragmentId: string | null = null;
    let fragmentName: string | null = null;

    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      encryptionKey = hashParams.get('key');
      fragmentId = hashParams.get('id');
      fragmentName = hashParams.get('name');
    }

    // Extract query params
    const serverUrl = parsed.searchParams.get('server');
    const queryName = parsed.searchParams.get('name');
    const asyncEnabled = parsed.searchParams.get('async') === '1';

    // Determine format:
    // - NEW FORMAT: id is in fragment, path contains hash
    // - OLD FORMAT: id is in path (UUID format), name may be in query
    const isLegacyFormat = !fragmentId;

    // Investigation ID: from fragment (new) or path (old)
    const investigationId = fragmentId || pathSegment;

    // Room ID: path segment (hash in new format, UUID in old format)
    const roomId = pathSegment;

    // Name: from fragment (new) or query (old)
    const name = fragmentName || queryName;

    return {
      investigationId,
      encryptionKey,
      serverUrl,
      name,
      roomId,
      isLegacyFormat,
      asyncEnabled,
    };
  }

  /**
   * Check if IndexedDB has data for a given investigation
   */
  async hasLocalData(investigationId: string): Promise<boolean> {
    const dbName = `zeroneurone-ydoc-${investigationId}`;
    try {
      const databases = await indexedDB.databases();
      return databases.some(db => db.name === dbName);
    } catch {
      // Firefox doesn't support indexedDB.databases()
      // Try to open and check
      return new Promise((resolve) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => {
          const db = request.result;
          const hasData = db.objectStoreNames.length > 0;
          db.close();
          resolve(hasData);
        };
        request.onerror = () => resolve(false);
      });
    }
  }

  /**
   * Delete local data for an investigation
   */
  async deleteLocalData(investigationId: string): Promise<void> {
    const dbName = `zeroneurone-ydoc-${investigationId}`;
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const syncService = new SyncService();
