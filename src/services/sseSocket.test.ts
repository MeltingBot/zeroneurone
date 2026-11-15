// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SseSocket, sseUrlOf, OPEN_TIMEOUT_MS } from './sseSocket';
import { rememberedTransport, rememberTransport, REMEMBER_MS } from './relayTransport';

/** A stand-in EventSource the test drives */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  url: string;
  closed = false;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: string) {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  close() { this.closed = true; }
}

const b64 = (s: string) => btoa(s);
const flush = () => new Promise((r) => setTimeout(r, 0));

/** The messages of a POST body (4-byte length + bytes each) */
function framesOf(body: Uint8Array): string[] {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const out: string[] = [];
  for (let at = 0; at < body.byteLength;) {
    const n = view.getUint32(at);
    out.push(new TextDecoder().decode(body.subarray(at + 4, at + 4 + n)));
    at += 4 + n;
  }
  return out;
}

describe('sseUrlOf', () => {
  it('puts sse before the room and keeps the path and parameters', () => {
    expect(sseUrlOf('wss://h.example/Zeroneurone-relay/room1?token=t&client=c'))
      .toBe('https://h.example/Zeroneurone-relay/sse/room1?token=t&client=c');
    expect(sseUrlOf('ws://127.0.0.1:4444/room1')).toBe('http://127.0.0.1:4444/sse/room1');
  });
});

describe('SseSocket', () => {
  let posts: { url: string; body: Uint8Array; resolve: (status: number) => void }[];

  beforeEach(() => {
    posts = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn((url: URL, init: RequestInit) => new Promise((resolve) => {
      posts.push({ url: String(url), body: init.body as Uint8Array, resolve: (status) => resolve({ ok: status < 300, status }) });
    })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function open() {
    const socket = new SseSocket('ws://relay.test/room1?client=abc');
    const source = FakeEventSource.last!;
    source.emit('session', 'session-1');
    return { socket, source };
  }

  it('opens on the relay\'s open event and passes messages as ArrayBuffer', () => {
    const socket = new SseSocket('ws://relay.test/room1?client=abc');
    const onopen = vi.fn();
    const received: string[] = [];
    socket.onopen = onopen;
    socket.onmessage = (e) => received.push(new TextDecoder().decode(e.data as ArrayBuffer));
    expect(FakeEventSource.last!.url).toBe('http://relay.test/sse/room1?client=abc');
    expect(socket.readyState).toBe(SseSocket.CONNECTING);
    FakeEventSource.last!.emit('session', 'session-1');
    expect(socket.readyState).toBe(SseSocket.OPEN);
    expect(onopen).toHaveBeenCalledOnce();
    FakeEventSource.last!.emit('message', b64('hello'));
    expect(received).toEqual(['hello']);
  });

  it('stays connecting on EventSource\'s own open (HTTP response only): a proxy may hold the stream', () => {
    const socket = new SseSocket('ws://relay.test/room1');
    const onopen = vi.fn();
    socket.onopen = onopen;
    FakeEventSource.last!.emit('open', '');
    expect(socket.readyState).toBe(SseSocket.CONNECTING);
    expect(onopen).not.toHaveBeenCalled();
  });

  it('posts one batch at a time, in order, to the session', async () => {
    const { socket } = open();
    socket.send(new TextEncoder().encode('one'));
    socket.send(new TextEncoder().encode('two'));
    socket.send(new TextEncoder().encode('three'));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('http://relay.test/sse/room1/session-1');
    expect(framesOf(posts[0].body)).toEqual(['one']);
    expect(socket.bufferedAmount).toBe(11);
    posts[0].resolve(204);
    await flush();
    expect(posts).toHaveLength(2);
    expect(framesOf(posts[1].body)).toEqual(['two', 'three']);
    posts[1].resolve(204);
    await flush();
    expect(socket.bufferedAmount).toBe(0);
  });

  it('closes with the relay\'s code and reason, once', async () => {
    const { socket, source } = open();
    const closes: { code: number; reason: string }[] = [];
    socket.onclose = (e) => closes.push({ code: e.code, reason: e.reason });
    source.emit('close', JSON.stringify({ code: 1008, reason: 'Write proof refused' }));
    source.onerror?.();
    socket.close();
    await flush();
    expect(closes).toEqual([{ code: 1008, reason: 'Write proof refused' }]);
    expect(source.closed).toBe(true);
    expect(socket.readyState).toBe(SseSocket.CLOSED);
  });

  it('closes on a stream error instead of letting EventSource reconnect', async () => {
    const { socket, source } = open();
    const onclose = vi.fn();
    socket.onclose = onclose;
    source.onerror?.();
    await flush();
    expect(source.closed).toBe(true);
    expect(onclose.mock.calls[0][0].code).toBe(1006);
  });

  it('closes when the session is gone (410)', async () => {
    const { socket } = open();
    const onclose = vi.fn();
    socket.onclose = onclose;
    socket.send(new Uint8Array([1]));
    posts[0].resolve(410);
    await flush();
    await flush();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('gives up when the stream never opens (proxy holding it back)', () => {
    vi.useFakeTimers();
    const socket = new SseSocket('ws://relay.test/room1');
    const onclose = vi.fn();
    socket.onclose = onclose;
    vi.advanceTimersByTime(OPEN_TIMEOUT_MS + 1);
    expect(FakeEventSource.last!.closed).toBe(true);
    expect(onclose.mock.calls[0][0].code).toBe(1006);
  });

  it('sends what is queued before closing, the stream open meanwhile', async () => {
    const { socket, source } = open();
    const onclose = vi.fn();
    socket.onclose = onclose;
    socket.send(new TextEncoder().encode('state'));
    socket.send(new TextEncoder().encode('last'));
    socket.close();
    expect(source.closed).toBe(false);
    posts[0].resolve(204);
    await flush();
    expect(framesOf(posts[1].body)).toEqual(['last']);
    expect(source.closed).toBe(false);
    posts[1].resolve(204);
    await flush();
    await flush();
    expect(source.closed).toBe(true);
    expect(onclose).toHaveBeenCalledOnce();
  });
});

describe('remembered transport', () => {
  beforeEach(() => localStorage.clear());

  it('remembers the fallback for a day, per relay', () => {
    const now = 1_000_000;
    expect(rememberedTransport('wss://a', now)).toBe('ws');
    rememberTransport('wss://a', 'sse', now);
    expect(rememberedTransport('wss://a', now + 1000)).toBe('sse');
    expect(rememberedTransport('wss://b', now + 1000)).toBe('ws');
    expect(rememberedTransport('wss://a', now + REMEMBER_MS + 1)).toBe('ws');
  });

  it('forgets it when WebSocket is chosen again', () => {
    rememberTransport('wss://a', 'sse');
    rememberTransport('wss://a', 'ws');
    expect(rememberedTransport('wss://a')).toBe('ws');
  });
});
