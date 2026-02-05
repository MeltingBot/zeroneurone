/**
 * EncryptedWebSocket - WebSocket wrapper with E2E encryption
 *
 * Wraps a native WebSocket to encrypt outgoing messages and decrypt incoming ones.
 * Used with y-websocket's WebSocketPolyfill parameter.
 */

import { encrypt, decrypt, importEncryptionKey } from './cryptoService';

// Message type prefix to identify encrypted messages
const ENCRYPTED_PREFIX = new Uint8Array([0xE2, 0xE2]); // "EE" marker

export class EncryptedWebSocket {
  private ws: WebSocket;
  private key: CryptoKey | null = null;
  private pendingOutgoing: ArrayBuffer[] = [];
  private pendingIncoming: MessageEvent[] = [];
  private keyReady = false;

  // WebSocket-like interface
  public binaryType: BinaryType = 'arraybuffer';
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.ws = new WebSocket(url, protocols);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = (event) => {
      this.processPendingMessages();
      this.onopen?.(event);
    };

    this.ws.onclose = (event) => {
      this.onclose?.(event);
    };

    this.ws.onerror = (event) => {
      this.onerror?.(event);
    };

    this.ws.onmessage = async (event) => {
      // If key not ready yet, queue the message
      if (!this.keyReady) {
        this.pendingIncoming.push(event);
        return;
      }

      await this.processIncomingMessage(event);
    };
  }

  /**
   * Process a single incoming message (decrypt if needed)
   */
  private async processIncomingMessage(event: MessageEvent): Promise<void> {
    if (!this.key) {
      // No encryption configured, pass through
      this.onmessage?.(event);
      return;
    }

    try {
      const data = event.data as ArrayBuffer;
      const dataArray = new Uint8Array(data);

      // Check if message is encrypted (has our prefix)
      if (this.hasEncryptedPrefix(dataArray)) {
        // Remove prefix and decrypt
        const encrypted = dataArray.slice(ENCRYPTED_PREFIX.length);
        const decrypted = await decrypt(this.key, encrypted);

        // Create new MessageEvent with decrypted data
        const decryptedEvent = new MessageEvent('message', {
          data: decrypted.buffer,
        });
        this.onmessage?.(decryptedEvent);
      } else {
        // Message without encryption prefix when we expect encryption
        // This could be from a client with wrong/no key - drop it silently
        // to avoid y-websocket trying to decode garbage
        console.warn('[EncryptedWS] Received unencrypted message when encryption expected, dropping');
        return;
      }
    } catch (err) {
      // Decryption failed - likely key mismatch
      // Drop the message silently to avoid y-websocket errors
      console.error('[EncryptedWS] Decryption failed:', err);
      return;
    }
  }

  /**
   * Set the encryption key
   */
  async setEncryptionKey(keyString: string): Promise<void> {
    this.key = await importEncryptionKey(keyString);
    this.keyReady = true;
    // Process any messages that were waiting for the key
    this.processPendingMessages();
    // Process any incoming messages that arrived before the key was ready
    await this.processPendingIncoming();
  }

  /**
   * Process queued incoming messages
   */
  private async processPendingIncoming(): Promise<void> {
    while (this.pendingIncoming.length > 0) {
      const event = this.pendingIncoming.shift()!;
      await this.processIncomingMessage(event);
    }
  }

  /**
   * Check if data has our encrypted prefix
   */
  private hasEncryptedPrefix(data: Uint8Array): boolean {
    if (data.length < ENCRYPTED_PREFIX.length) return false;
    for (let i = 0; i < ENCRYPTED_PREFIX.length; i++) {
      if (data[i] !== ENCRYPTED_PREFIX[i]) return false;
    }
    return true;
  }

  /**
   * Process pending outgoing messages (called when key is ready or connection opens)
   */
  private async processPendingMessages(): Promise<void> {
    if (!this.keyReady || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.pendingOutgoing.length > 0) {
      const data = this.pendingOutgoing.shift()!;
      await this.sendEncrypted(data);
    }
  }

  /**
   * Send data with encryption
   */
  private async sendEncrypted(data: ArrayBuffer): Promise<void> {
    if (!this.key) {
      // No encryption, send as-is
      this.ws.send(data);
      return;
    }

    const dataArray = new Uint8Array(data);
    const encrypted = await encrypt(this.key, dataArray);

    // Add prefix to mark as encrypted
    const withPrefix = new Uint8Array(ENCRYPTED_PREFIX.length + encrypted.length);
    withPrefix.set(ENCRYPTED_PREFIX, 0);
    withPrefix.set(encrypted, ENCRYPTED_PREFIX.length);

    this.ws.send(withPrefix.buffer);
  }

  // WebSocket interface methods
  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    // Convert to ArrayBuffer if needed
    let buffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (ArrayBuffer.isView(data)) {
      buffer = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else if (data instanceof Blob) {
      // For Blob, we can't encrypt synchronously - this shouldn't happen with y-websocket
      this.ws.send(data);
      return;
    } else {
      // String data - convert to ArrayBuffer
      const encoder = new TextEncoder();
      buffer = encoder.encode(data).buffer;
    }

    // If not ready, queue the message
    if (!this.keyReady || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingOutgoing.push(buffer);
      return;
    }

    // Send encrypted
    this.sendEncrypted(buffer);
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  get readyState(): number {
    return this.ws.readyState;
  }

  get bufferedAmount(): number {
    return this.ws.bufferedAmount;
  }

  get extensions(): string {
    return this.ws.extensions;
  }

  get protocol(): string {
    return this.ws.protocol;
  }

  get url(): string {
    return this.ws.url;
  }

  // Static constants
  static readonly CONNECTING = WebSocket.CONNECTING;
  static readonly OPEN = WebSocket.OPEN;
  static readonly CLOSING = WebSocket.CLOSING;
  static readonly CLOSED = WebSocket.CLOSED;

  // Instance constants (for compatibility)
  readonly CONNECTING = WebSocket.CONNECTING;
  readonly OPEN = WebSocket.OPEN;
  readonly CLOSING = WebSocket.CLOSING;
  readonly CLOSED = WebSocket.CLOSED;

  // Event listener methods (for compatibility)
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions
  ): void {
    // Map to our handlers
    if (type === 'open') {
      const prev = this.onopen;
      this.onopen = (e) => {
        prev?.(e);
        if (typeof listener === 'function') listener(e);
        else listener.handleEvent(e);
      };
    } else if (type === 'close') {
      const prev = this.onclose;
      this.onclose = (e) => {
        prev?.(e);
        if (typeof listener === 'function') listener(e);
        else listener.handleEvent(e);
      };
    } else if (type === 'error') {
      const prev = this.onerror;
      this.onerror = (e) => {
        prev?.(e);
        if (typeof listener === 'function') listener(e);
        else listener.handleEvent(e);
      };
    } else if (type === 'message') {
      const prev = this.onmessage;
      this.onmessage = (e) => {
        prev?.(e);
        if (typeof listener === 'function') listener(e);
        else listener.handleEvent(e);
      };
    }
  }

  removeEventListener(
    type: string,
    _listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions
  ): void {
    // Simplified - just clear the handler
    if (type === 'open') this.onopen = null;
    else if (type === 'close') this.onclose = null;
    else if (type === 'error') this.onerror = null;
    else if (type === 'message') this.onmessage = null;
  }

  dispatchEvent(event: Event): boolean {
    return this.ws.dispatchEvent(event);
  }
}

/**
 * Create an EncryptedWebSocket factory for use with y-websocket
 */
export function createEncryptedWebSocketClass(encryptionKey: string | null): typeof WebSocket {
  if (!encryptionKey) {
    // No encryption, return native WebSocket
    return WebSocket;
  }

  // Capture key for closure
  const key = encryptionKey;

  // Return a class that creates encrypted WebSockets
  return class extends EncryptedWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      // Set the encryption key asynchronously
      this.setEncryptionKey(key).catch(() => {
        // Key import failed - encryption won't work
      });
    }
  } as unknown as typeof WebSocket;
}
