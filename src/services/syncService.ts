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
import type { SyncState } from '../types/yjs';
import { DEFAULT_SYNC_STATE } from '../types/yjs';
import { createEncryptedWebSocketClass } from './encryptedWebSocket';
import { generateEncryptionKey, isValidKeyString } from './cryptoService';

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
   * Check if an investigation is currently open
   */
  isOpen(): boolean {
    return this.ydoc !== null;
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
   * @param investigationId - The investigation UUID (also used as roomId)
   * @param encryptionKey - The AES-256-GCM key for E2E encryption (optional)
   */
  async openShared(investigationId: string, encryptionKey?: string): Promise<Y.Doc> {
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
    const dbName = `zeroneurone-ydoc-${investigationId}`;
    this.indexeddbProvider = new IndexeddbPersistence(dbName, this.ydoc);

    // Wait for local data to be loaded first
    await this.indexeddbProvider.whenSynced;

    // Connect to signaling server using investigationId as roomId
    this.connectWebSocket(investigationId, encryptionKey);

    return this.ydoc;
  }

  /**
   * Share the currently open investigation
   * Generates a new encryption key and uses the investigation UUID as roomId
   *
   * @returns The generated encryption key for sharing
   */
  async share(): Promise<string> {
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

    // If already shared, disconnect first to reconnect with new key
    if (this.websocketProvider) {
      this.websocketProvider.disconnect();
      this.websocketProvider.destroy();
      this.websocketProvider = null;
    }

    // Connect using investigation UUID as roomId
    this.connectWebSocket(this.investigationId, newKey);

    return newKey;
  }

  /**
   * Stop sharing (disconnect from signaling server)
   */
  async unshare(): Promise<void> {
    if (this.websocketProvider) {
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

  private connectWebSocket(roomId: string, encryptionKey?: string): void {
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

    // Create WebSocket provider with optional encryption
    // The roomId is appended to the server URL path
    this.websocketProvider = new WebsocketProvider(
      this.serverUrl,
      roomId,
      this.ydoc,
      { WebSocketPolyfill: WebSocketClass }
    );

    // Listen to connection status
    this.websocketProvider.on('status', (event: { status: string }) => {
      const connected = event.status === 'connected';
      this.setState({ connected });
    });

    // Listen to sync status
    this.websocketProvider.on('sync', (synced: boolean) => {
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

    // Handle connection errors
    this.websocketProvider.on('connection-error', () => {
      this.setState({ error: 'Erreur de connexion au serveur' });
    });

    this.setState({
      mode: 'shared',
      roomId,
      error: null,
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
   * Get the current encryption key
   */
  getEncryptionKey(): string | null {
    return this.encryptionKey;
  }

  /**
   * Check if E2E encryption is active
   */
  isEncrypted(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Build a share URL for the current investigation
   * URL format: /join/{investigationId}?server=...&name=...#key=xxx
   *
   * The encryption key is placed in the URL fragment (#key=xxx) which is
   * never sent to the server - it stays client-side only.
   *
   * @param investigationId - The investigation UUID (used as roomId)
   * @param encryptionKey - The E2E encryption key
   * @param investigationName - Optional display name
   * @param baseUrl - Optional base URL (defaults to current origin)
   */
  buildShareUrl(
    investigationId: string,
    encryptionKey: string,
    investigationName?: string,
    baseUrl?: string
  ): string {
    const base = baseUrl || window.location.origin;
    const url = new URL(`${base}/join/${investigationId}`);

    if (this.serverUrl) {
      url.searchParams.set('server', this.serverUrl);
    }
    if (investigationName) {
      url.searchParams.set('name', investigationName);
    }

    // Add encryption key as fragment (never sent to server)
    return `${url.toString()}#key=${encryptionKey}`;
  }

  /**
   * Parse a share URL to extract investigation ID and encryption key
   *
   * @param url - The share URL to parse
   * @returns Object with investigationId, encryptionKey, serverUrl, and name
   */
  parseShareUrl(url: string): {
    investigationId: string;
    encryptionKey: string | null;
    serverUrl: string | null;
    name: string | null;
  } {
    const parsed = new URL(url);

    // Extract investigation ID from path: /join/{investigationId}
    const pathMatch = parsed.pathname.match(/\/join\/([^/]+)/);
    const investigationId = pathMatch ? pathMatch[1] : '';

    // Extract encryption key from fragment: #key=xxx
    let encryptionKey: string | null = null;
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      encryptionKey = hashParams.get('key');
    }

    // Extract query params
    const serverUrl = parsed.searchParams.get('server');
    const name = parsed.searchParams.get('name');

    return { investigationId, encryptionKey, serverUrl, name };
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
