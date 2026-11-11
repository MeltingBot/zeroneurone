import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as encoding from 'lib0/encoding';
// The relay's side, to check both halves agree
import { accessOf, roomIdForKey } from '../../relay/access.js';
import { generateEncryptionKey } from './cryptoService';
import { EncryptedWebSocket, createEncryptedWebSocketClass } from './encryptedWebSocket';
import { CATEGORY, categoryOf, readCategory, withCategory } from './messageCategory';
import { encodeChunk, encodeRequest } from './assetRequests';
import { generateWriteAccess, isReadOnly, setRelayClockOffset, signedRoomId, withAccess } from './writeAccess';

const message = (...parts: number[]) => {
  const e = encoding.createEncoder();
  for (const p of parts) encoding.writeVarUint(e, p);
  encoding.writeVarUint8Array(e, new Uint8Array([9, 9]));
  return encoding.toUint8Array(e);
};

describe('write keys', () => {
  it('name the room and prove writing as the relay checks it', async () => {
    const access = generateWriteAccess();
    const room = await signedRoomId(access.publicKey);
    const raw = Buffer.from(access.publicKey, 'base64url');
    expect(room).toBe(roomIdForKey(raw));

    const params = (url: string) => new URL(url).searchParams;
    const writer = withAccess(`ws://relay/${room}?token=t`, access);
    expect(accessOf(room, params(writer))).toEqual({ writer: true });
    expect(params(writer).get('token')).toBe('t');

    const reader = withAccess(`ws://relay/${room}?token=t`, { publicKey: access.publicKey });
    expect(accessOf(room, params(reader))).toEqual({ writer: false });
    expect(isReadOnly({ publicKey: access.publicKey })).toBe(true);
    expect(isReadOnly(access)).toBe(false);

    // The files room has its own proof
    const files = withAccess(`ws://relay/${room}.files?token=t`, access);
    expect(accessOf(`${room}.files`, params(files))).toEqual({ writer: true });
  });
});

describe('a writer whose clock is off', () => {
  it('still proves writing, with the relay\'s clock', async () => {
    const access = generateWriteAccess();
    const room = await signedRoomId(access.publicKey);
    const relayTime = Math.floor(Date.now() / 1000) + 3600;
    const params = (url: string) => new URL(url).searchParams;
    // Its own clock: an hour behind the relay, refused
    expect('refused' in accessOf(room, params(withAccess(`ws://relay/${room}`, access)), relayTime)).toBe(true);
    // The relay's clock (from /health): accepted
    setRelayClockOffset(3600);
    try {
      expect(accessOf(room, params(withAccess(`ws://relay/${room}`, access)), relayTime)).toEqual({ writer: true });
    } finally {
      setRelayClockOffset(0);
    }
  });
});

describe('message categories', () => {
  it('tell presence, requests and data apart', () => {
    expect(categoryOf(message(0, 0))).toBe(CATEGORY.request); // sync step 1
    expect(categoryOf(message(0, 1))).toBe(CATEGORY.data); // sync step 2
    expect(categoryOf(message(0, 2))).toBe(CATEGORY.data); // update
    expect(categoryOf(message(1))).toBe(CATEGORY.presence); // awareness
    expect(categoryOf(message(3))).toBe(CATEGORY.request); // query awareness
    expect(categoryOf(encodeRequest({ assetId: 'a', replyTo: 't', at: 1 }))).toBe(CATEGORY.request);
    expect(categoryOf(encodeChunk({ assetId: 'a', index: 0, total: 1, bytes: new Uint8Array(1) }))).toBe(CATEGORY.data);
    expect(categoryOf(new Uint8Array([0xff]))).toBe(CATEGORY.data);
  });
});

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 1;
  binaryType = 'blob';
  url: string;
  sent: Uint8Array[] = [];
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(new Uint8Array(data instanceof ArrayBuffer ? data : data.slice().buffer));
  }
  close() { this.readyState = 3; }
  receive(frame: Uint8Array) {
    void this.onmessage?.(new MessageEvent('message', { data: frame.slice().buffer }));
  }
}

describe('a socket in a signed room', () => {
  const original = globalThis.WebSocket;
  beforeEach(() => {
    FakeSocket.all = [];
    (globalThis as { WebSocket: unknown }).WebSocket = FakeSocket;
  });
  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = original;
  });

  async function pair() {
    const key = await generateEncryptionKey();
    const access = generateWriteAccess();
    const room = await signedRoomId(access.publicKey);
    const Writer = createEncryptedWebSocketClass(key, undefined, access);
    const Reader = createEncryptedWebSocketClass(key, undefined, { publicKey: access.publicKey });
    const writer = new Writer(`ws://relay/${room}?token=t`) as unknown as EncryptedWebSocket;
    const reader = new Reader(`ws://relay/${room}?token=t`) as unknown as EncryptedWebSocket;
    const [writerSocket, readerSocket] = FakeSocket.all;
    const ready = (ws: EncryptedWebSocket) => (ws as unknown as { keyReady: boolean }).keyReady;
    await vi.waitFor(() => expect(ready(writer) && ready(reader)).toBe(true));
    return { writer, reader, writerSocket, readerSocket };
  }

  it('connects writers with a fresh proof, readers with the public key alone', async () => {
    const { writerSocket, readerSocket } = await pair();
    expect(new URL(writerSocket.url).searchParams.get('wsig')).toBeTruthy();
    expect(new URL(readerSocket.url).searchParams.get('wsig')).toBeNull();
    expect(new URL(readerSocket.url).searchParams.get('wpub')).toBeTruthy();
  });

  it('marks each message with its category, and drops content under another one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { writer, reader, writerSocket } = await pair();
    const received: Uint8Array[] = [];
    reader.onmessage = (e) => received.push(new Uint8Array(e.data as ArrayBuffer));

    const update = message(0, 2);
    writer.send(update);
    await vi.waitFor(() => expect(writerSocket.sent).toHaveLength(1));
    const frame = writerSocket.sent[0];
    expect(readCategory(frame)?.category).toBe(CATEGORY.data);

    // Delivered as sent
    FakeSocket.all[1].receive(frame);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual(update);

    // The same content announced as presence (a reader's forgery): dropped
    const forged = withCategory(CATEGORY.presence, readCategory(frame)!.body);
    FakeSocket.all[1].receive(forged);
    // Without a category: dropped
    FakeSocket.all[1].receive(readCategory(frame)!.body);
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
