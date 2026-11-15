/**
 * HTTP fallback of the relay, for networks that block WebSocket (a proxy
 * that drops the Upgrade): the client reads a Server-Sent Events stream and
 * writes with POST requests. Its stream is a client of the room like a
 * WebSocket (relay/room.js): same access checks, same messages.
 *
 * - GET  /sse/<room>?<same parameters as the WebSocket URL>
 *   `event: session` with its id (not `open`: EventSource fires its own
 *   `open` on the response), then one `data:` event per message
 *   (base64), a `: ping` comment every 20 s. Closed by the relay with
 *   `event: close` and `{ code, reason }`, as a WebSocket close (EventSource
 *   sees no HTTP status: a refusal is told this way too).
 * - POST /sse/<room>/<session>, application/octet-stream: messages in order,
 *   each as a 4-byte big-endian length then its bytes. 204, or 410 when the
 *   session is gone (the client reconnects).
 *
 * The session id is random (128 bits) and only given to the stream's
 * reader: it is what lets a POST speak for that client.
 *
 * Used by relay/index.js and server/index.js.
 */

import { randomBytes } from 'node:crypto';
import { OPEN, roomIdOf } from './room.js';

/** The path segment before the room: `.../sse/<room>` */
export const SSE_SEGMENT = 'sse';
const CLOSED = 3;
const PING_INTERVAL_MS = 20_000;
/** Room for the 4-byte lengths of a batch of messages */
const FRAMING_ALLOWANCE = 64 * 1024;

/** A client of the room writing to an SSE response */
export function createSseClient(res) {
  const client = {
    readyState: OPEN,
    get bufferedAmount() { return res.writableLength; },
    send(data) {
      if (client.readyState !== OPEN) return;
      res.write(`data: ${Buffer.from(data).toString('base64')}\n\n`);
    },
    close(code = 1000, reason = '') {
      if (client.readyState !== OPEN) return;
      client.readyState = CLOSED;
      res.end(`event: close\ndata: ${JSON.stringify({ code, reason })}\n\n`);
    },
  };
  return client;
}

/** The messages of a POST body: 4-byte big-endian length, then the bytes; null when malformed */
export function framesOf(body) {
  const frames = [];
  let at = 0;
  while (at < body.length) {
    if (at + 4 > body.length) return null;
    const length = body.readUInt32BE(at);
    at += 4;
    if (length === 0 || at + length > body.length) return null;
    frames.push(body.subarray(at, at + length));
    at += length;
  }
  return frames;
}

/**
 * The /sse/ routes over `hub` (relay/room.js). `handle(req, res)` answers
 * and returns true for a request it owns.
 */
export function createSseRoutes({ hub, LIMITS, getClientIP }) {
  const sessions = new Map(); // session id → client

  function open(req, res, url) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      // no-transform: a proxy must neither compress nor hold back the stream
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const client = createSseClient(res);
    if (!hub.join(client, url, getClientIP(req), 'SSE')) return;

    const sessionId = randomBytes(16).toString('base64url');
    sessions.set(sessionId, client);
    res.write(`event: session\ndata: ${sessionId}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_INTERVAL_MS);

    const gone = () => {
      clearInterval(ping);
      sessions.delete(sessionId);
      client.readyState = CLOSED;
      hub.leave(client);
    };
    res.on('close', gone);
    res.on('error', gone);
  }

  function post(req, res, roomId, sessionId) {
    const client = sessions.get(sessionId);
    if (!client || client.roomId !== roomId || client.readyState !== OPEN) {
      req.resume();
      res.writeHead(410);
      res.end();
      return;
    }
    const limit = LIMITS.MAX_MESSAGE_SIZE + FRAMING_ALLOWANCE;
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        client.close(1009, 'Message too large');
        res.writeHead(413);
        res.end();
        return;
      }
      const frames = framesOf(Buffer.concat(chunks));
      if (!frames) {
        res.writeHead(400);
        res.end();
        return;
      }
      for (const frame of frames) {
        if (client.readyState !== OPEN) break;
        hub.receive(client, frame);
      }
      res.writeHead(client.readyState === OPEN ? 204 : 410);
      res.end();
    });
  }

  function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    // `sse` right before the room, whatever comes first (a `/ws/` prefix kept by a proxy)
    const segments = url.pathname.split('/').filter(Boolean);
    const at = segments.lastIndexOf(SSE_SEGMENT);
    if (at < 0) return false;
    const rest = segments.slice(at + 1);
    if (req.method === 'GET' && rest.length === 1) {
      open(req, res, url);
      return true;
    }
    if (req.method === 'POST' && rest.length === 2) {
      post(req, res, roomIdOf(`/${rest[0]}`), rest[1]);
      return true;
    }
    return false;
  }

  return { handle };
}
