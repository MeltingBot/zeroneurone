import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./cryptoService', () => ({
  importEncryptionKey: vi.fn(async () => {
    throw new Error('bad key');
  }),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { EncryptedWebSocket, createEncryptedWebSocketClass } from './encryptedWebSocket';

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeSocket | null = null;
  readyState = 1;
  binaryType = 'blob';
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn((code?: number) => {
    this.readyState = 3;
    this.closedWith = code;
  });
  closedWith: number | undefined;
  constructor() {
    FakeSocket.last = this;
  }
}

describe('EncryptedWebSocket', () => {
  const original = globalThis.WebSocket;
  beforeEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = FakeSocket;
  });
  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = original;
  });

  it('closes the connection when the key cannot be imported', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onKeyError = vi.fn();
    const Socket = createEncryptedWebSocketClass('not-a-key', onKeyError);
    const ws = new Socket('ws://relay') as unknown as EncryptedWebSocket;
    ws.send(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(FakeSocket.last!.close).toHaveBeenCalled());
    expect(FakeSocket.last!.closedWith).toBe(4001);
    // The caller is told, so it can stop reconnecting with the same key
    expect(onKeyError).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();

    ws.send(new Uint8Array([4]));
    expect(FakeSocket.last!.send).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it('never sends a Blob in clear text', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = new EncryptedWebSocket('ws://relay');
    ws.send(new Blob(['secret']));
    expect(FakeSocket.last!.send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
