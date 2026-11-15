/**
 * SseSocket - the relay's HTTP fallback, shaped as a WebSocket
 *
 * For networks that block WebSocket (a proxy dropping the Upgrade): reads
 * the room from a Server-Sent Events stream and writes with POST requests
 * (relay/sse.js). y-websocket and EncryptedWebSocket use it as they use a
 * WebSocket, so nothing above changes: encryption, sync, files.
 *
 * - Opens on the relay's `event: session` (its id), not on the HTTP
 *   response: a proxy holding the stream back would otherwise look connected.
 *   Not open within OPEN_TIMEOUT_MS: closed (1006), y-websocket retries.
 * - Relay's `event: close` → onclose with its code and reason, as a
 *   WebSocket close (EventSource sees no HTTP status).
 * - Stream error: closed (1006), never EventSource's own reconnection, so
 *   y-websocket keeps its backoff.
 * - Sends in order: one POST at a time, what is queued meanwhile goes in
 *   the next one.
 * - close() lets queued messages go first, as a WebSocket sends what it
 *   buffered (unshare sends a last full state just before), within
 *   DRAIN_TIMEOUT_MS: the stream stays open meanwhile, the relay needs it.
 */

export const OPEN_TIMEOUT_MS = 10_000;
export const DRAIN_TIMEOUT_MS = 10_000;
/** A POST carries queued messages up to this size (a larger one goes alone) */
const BATCH_BYTES = 1024 * 1024;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** The stream URL of a WebSocket URL: `/sse/` before the room, http(s) */
export function sseUrlOf(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  const segments = url.pathname.split('/');
  const room = segments.pop() ?? '';
  url.pathname = [...segments, 'sse', room].join('/');
  return url.toString();
}

function toBytes(data: string | ArrayBuffer | Blob | ArrayBufferView): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return null; // A Blob: y-websocket never sends one
}

function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function closeEvent(code: number, reason: string): CloseEvent {
  const init = { code, reason, wasClean: code === 1000 };
  return (typeof CloseEvent !== 'undefined'
    ? new CloseEvent('close', init)
    : Object.assign(new Event('close'), init)) as CloseEvent;
}

export class SseSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  public binaryType: BinaryType = 'arraybuffer';
  public readyState: number = CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  readonly url: string;
  readonly protocol = '';
  readonly extensions = '';

  private source: EventSource | null;
  private streamUrl: string;
  private sessionId: string | null = null;
  private queue: Uint8Array[] = [];
  private queuedBytes = 0;
  private inFlightBytes = 0;
  private posting = false;
  private openTimer: ReturnType<typeof setTimeout> | null;
  /** close() asked while messages were queued: closes once they are sent */
  private closeAfterDrain: { code: number; reason: string } | null = null;
  private finished = false;

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = String(url);
    this.streamUrl = sseUrlOf(this.url);
    this.source = new EventSource(this.streamUrl);
    this.openTimer = setTimeout(() => this.fail(1006, 'HTTP fallback did not open'), OPEN_TIMEOUT_MS);

    // Not EventSource's own `open` (the HTTP response): the relay's session,
    // which a proxy holding the stream back never lets through
    this.source.addEventListener('session', (event) => {
      if (this.readyState !== CONNECTING) return;
      this.sessionId = (event as MessageEvent).data;
      this.clearOpenTimer();
      this.readyState = OPEN;
      this.onopen?.(new Event('open'));
      this.flush();
    });
    this.source.addEventListener('message', (event) => {
      if (this.readyState !== OPEN) return;
      this.onmessage?.(new MessageEvent('message', { data: fromBase64((event as MessageEvent).data) }));
    });
    this.source.addEventListener('close', (event) => {
      let code = 1006;
      let reason = '';
      try {
        const told = JSON.parse((event as MessageEvent).data) as { code?: number; reason?: string };
        code = told.code ?? code;
        reason = told.reason ?? reason;
      } catch { /* malformed: a plain disconnection */ }
      this.fail(code, reason);
    });
    this.source.onerror = () => this.fail(1006, '');
  }

  get bufferedAmount(): number {
    return this.queuedBytes + this.inFlightBytes;
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (this.readyState !== OPEN) return;
    const bytes = toBytes(data);
    if (!bytes || bytes.byteLength === 0) return;
    this.queue.push(bytes);
    this.queuedBytes += bytes.byteLength;
    this.flush();
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === OPEN && (this.posting || this.queue.length > 0)) {
      this.readyState = CLOSING;
      this.closeAfterDrain = { code, reason };
      setTimeout(() => this.fail(code, reason), DRAIN_TIMEOUT_MS);
      return;
    }
    this.fail(code, reason);
  }

  private get sending(): boolean {
    return this.readyState === OPEN || (this.readyState === CLOSING && this.closeAfterDrain !== null);
  }

  /** One POST at a time; the messages queued meanwhile go in the next one */
  private flush(): void {
    if (this.posting || !this.sending) return;
    if (this.queue.length === 0) {
      if (this.closeAfterDrain) this.fail(this.closeAfterDrain.code, this.closeAfterDrain.reason);
      return;
    }
    const batch: Uint8Array[] = [];
    let size = 0;
    while (this.queue.length > 0 && (batch.length === 0 || size + this.queue[0].byteLength <= BATCH_BYTES)) {
      const next = this.queue.shift()!;
      batch.push(next);
      size += next.byteLength;
    }
    this.queuedBytes -= size;
    this.inFlightBytes = size;

    const body = new Uint8Array(size + 4 * batch.length);
    const view = new DataView(body.buffer);
    let at = 0;
    for (const message of batch) {
      view.setUint32(at, message.byteLength);
      body.set(message, at + 4);
      at += 4 + message.byteLength;
    }

    this.posting = true;
    const postUrl = new URL(this.streamUrl);
    postUrl.pathname += `/${this.sessionId}`;
    postUrl.search = '';
    fetch(postUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/octet-stream' },
      cache: 'no-store',
    })
      .then((res) => {
        this.posting = false;
        this.inFlightBytes = 0;
        // 410: the relay no longer knows the session; anything else: lost
        if (!res.ok) this.fail(1006, `HTTP fallback refused the message (${res.status})`);
        else this.flush();
      })
      .catch(() => {
        this.posting = false;
        this.inFlightBytes = 0;
        this.fail(1006, '');
      });
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  /** Closes once: stream, queue, then onclose (async, as a WebSocket) */
  private fail(code: number, reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.closeAfterDrain = null;
    this.readyState = CLOSING;
    this.clearOpenTimer();
    this.source?.close();
    this.source = null;
    this.queue = [];
    this.queuedBytes = 0;
    setTimeout(() => {
      this.readyState = CLOSED;
      this.onclose?.(closeEvent(code, reason));
    }, 0);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const call = (e: Event) => (typeof listener === 'function' ? listener(e) : listener.handleEvent(e));
    if (type === 'open') { const prev = this.onopen; this.onopen = (e) => { prev?.(e); call(e); }; }
    else if (type === 'close') { const prev = this.onclose; this.onclose = (e) => { prev?.(e); call(e); }; }
    else if (type === 'error') { const prev = this.onerror; this.onerror = (e) => { prev?.(e); call(e); }; }
    else if (type === 'message') { const prev = this.onmessage; this.onmessage = (e) => { prev?.(e); call(e); }; }
  }

  removeEventListener(type: string): void {
    if (type === 'open') this.onopen = null;
    else if (type === 'close') this.onclose = null;
    else if (type === 'error') this.onerror = null;
    else if (type === 'message') this.onmessage = null;
  }

  dispatchEvent(_event: Event): boolean {
    return false;
  }
}
