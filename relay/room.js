/**
 * The rooms of the relay: who may join, what is passed on to whom, what is
 * kept for clients away (async buffer).
 *
 * A client is anything shaped like a `ws` WebSocket: `send(data)`,
 * `close(code, reason)`, `readyState` (1 when open) and `bufferedAmount`.
 * A WebSocket is one; the HTTP fallback's stream (relay/sse.js) is another,
 * so both meet in the same rooms.
 *
 * Used by relay/index.js and server/index.js.
 */

import { createHash, randomBytes } from 'node:crypto';
import { clientTagOf } from './asyncBuffer.js';
import { forward, forwardToTarget, targetOf } from './forward.js';
import { accessOf, readerMayRelay } from './access.js';

export const OPEN = 1;

/** The room a request path names: its last segment, `ws/` or `sse/` prefix left out */
export function roomIdOf(pathname) {
  let path = pathname.slice(1) || 'default';
  if (path.startsWith('ws/')) path = path.slice(3);
  else if (path.startsWith('sse/')) path = path.slice(4);
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'default';
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * @param {object} options
 * @param {object} options.LIMITS - relayConfig().LIMITS
 * @param {object} options.BUFFER_LIMITS - relayConfig().BUFFER_LIMITS
 * @param {object} options.asyncBuffer - createAsyncBuffer()
 */
export function createRoomHub({ LIMITS, BUFFER_LIMITS, asyncBuffer, log = console.log }) {
  const connectionsPerIP = new Map();
  const rooms = new Map();                 // roomId → Set of clients
  const asyncRooms = new Set();
  const roomTokens = new Map();            // roomId → hashed token
  const roomLastActivity = new Map();      // roomId → timestamp (for orphan cleanup)
  const roomReconnects = new Map();        // roomId → { count, lastLog }
  let messagesRelayed = 0;
  let connectionsServed = 0;

  function isValidRoomId(roomId) {
    if (!roomId || roomId.length > LIMITS.MAX_ROOM_ID_LENGTH) return false;
    return LIMITS.ROOM_ID_PATTERN.test(roomId);
  }

  function createRateLimiter() {
    let messageCount = 0;
    let windowStart = Date.now();
    return {
      check() {
        const now = Date.now();
        if (now - windowStart > LIMITS.RATE_WINDOW_MS) {
          messageCount = 1;
          windowStart = now;
          return true;
        }
        messageCount++;
        return messageCount <= LIMITS.MAX_MESSAGES_PER_WINDOW;
      },
    };
  }

  function releaseIP(clientIP) {
    const count = connectionsPerIP.get(clientIP) || 1;
    if (count <= 1) connectionsPerIP.delete(clientIP);
    else connectionsPerIP.set(clientIP, count - 1);
  }

  function logJoin(room, roomId, clientIP, kind) {
    const roomIdShort = roomId.slice(0, 8) + '...';
    const mode = asyncRooms.has(roomId) ? ', async' : '';
    if (room.size >= 2) {
      log(`[${kind}] Client from ${clientIP} joined room "${roomIdShort}" (${room.size} clients${mode})`);
      roomReconnects.delete(roomId);
      return;
    }
    // Throttled: the first join, then a summary of reconnections
    const rc = roomReconnects.get(roomId) || { count: 0, lastLog: 0 };
    rc.count++;
    if (rc.count === 1) {
      log(`[${kind}] Client from ${clientIP} joined room "${roomIdShort}" (1 client${mode})`);
      rc.lastLog = Date.now();
    } else if (Date.now() - rc.lastLog > 5 * 60_000) {
      log(`[${kind}] Client from ${clientIP} reconnected to room "${roomIdShort}" (${rc.count} reconnections)`);
      rc.lastLog = Date.now();
    }
    roomReconnects.set(roomId, rc);
  }

  /**
   * Lets `client` into the room `url` names, or closes it with the reason
   * (code 1008). Returns whether it joined. `kind` only labels the logs.
   */
  function join(client, url, clientIP, kind = 'WS') {
    connectionsServed++;

    const currentConnections = connectionsPerIP.get(clientIP) || 0;
    if (currentConnections >= LIMITS.MAX_CONNECTIONS_PER_IP) {
      log(`[${kind}] Rejected connection from ${clientIP}: too many connections`);
      client.close(1008, 'Too many connections');
      return false;
    }
    connectionsPerIP.set(clientIP, currentConnections + 1);
    const refuse = (reason, why) => {
      log(`[${kind}] Rejected connection${why}`);
      releaseIP(clientIP);
      client.close(1008, reason);
      return false;
    };

    if (rooms.size >= LIMITS.MAX_ROOMS) return refuse('Server at capacity', ': too many rooms');

    const asyncEnabled = url.searchParams.get('async') === '1';
    const token = url.searchParams.get('token');
    // Messages for one client find it by this tag (forward.js)
    client.clientTag = clientTagOf(url.searchParams, () => randomBytes(9).toString('base64url'));

    const roomId = roomIdOf(url.pathname);
    const roomIdShort = roomId.slice(0, 8) + '...';
    if (!isValidRoomId(roomId)) return refuse('Invalid room ID', `: invalid room ID "${roomId.slice(0, 32)}..."`);

    // Read-only sharing (access.js): a signed room tells writers from readers
    const access = accessOf(roomId, url.searchParams);
    if (access.refused) return refuse('Write proof refused', ` to room "${roomIdShort}": ${access.refused}`);
    client.reader = !access.writer;

    // Token validation (hashed comparison — never stores plain text)
    const tokenHash = token ? hashToken(token) : null;
    if (roomTokens.has(roomId)) {
      if (roomTokens.get(roomId) !== tokenHash) return refuse('Invalid token', ` to room "${roomIdShort}": invalid token`);
    } else if (tokenHash) {
      roomTokens.set(roomId, tokenHash);
    }

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const room = rooms.get(roomId);
    if (room.size >= LIMITS.MAX_CLIENTS_PER_ROOM) {
      if (room.size === 0) rooms.delete(roomId);
      return refuse('Room full', ` to room "${roomIdShort}": room full`);
    }

    if (asyncEnabled) asyncRooms.add(roomId);
    room.add(client);
    roomLastActivity.set(roomId, Date.now());
    client.roomId = roomId;
    client.clientIP = clientIP;
    client.kind = kind;
    client.rateLimiter = createRateLimiter();
    client.joined = true;

    // Hand the client, even alone, the buffered messages it has not received
    // (its own left out). Delayed so the client is set up first (key, sync).
    if (asyncRooms.has(roomId)) {
      setTimeout(async () => {
        if (client.readyState !== OPEN) return;
        const sent = await asyncBuffer.replay(roomId, client.clientTag, (data) => {
          if (client.readyState !== OPEN) return false;
          client.send(data);
          return true;
        });
        if (sent > 0) log(`[Buffer] Sent ${sent} buffered messages to a client in room "${roomIdShort}"`);
      }, 1500);
    }

    logJoin(room, roomId, clientIP, kind);
    return true;
  }

  /** A message from a client that joined */
  function receive(client, data) {
    if (!client.joined) return;
    const { roomId, clientIP, kind } = client;
    const roomIdShort = roomId.slice(0, 8) + '...';

    if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
      log(`[${kind}] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
      client.close(1009, 'Message too large');
      return;
    }
    if (!client.rateLimiter.check()) {
      log(`[${kind}] Rate limited client ${clientIP} in room "${roomIdShort}"`);
      return;
    }

    const room = rooms.get(roomId);
    if (!room) return;
    roomLastActivity.set(roomId, Date.now());

    // A reader sends presence and requests only: its changes go nowhere
    const target = targetOf(data);
    if (client.reader && !readerMayRelay(target?.payload ?? data)) {
      if (!client.readerDropLogged) {
        client.readerDropLogged = true;
        log(`[${kind}] Dropped a change from a reader in room "${roomIdShort}"`);
      }
      return;
    }

    // For one client only: delivered to it, never buffered
    if (target) {
      forwardToTarget(room, client, target, LIMITS.MAX_BUFFERED_AMOUNT, OPEN);
      messagesRelayed++;
      return;
    }

    let relayed = 0;
    room.forEach((other) => {
      if (other !== client && other.readyState === OPEN) {
        // Backpressure: a client too far behind is disconnected, never left without the message
        if (forward(other, data, LIMITS.MAX_BUFFERED_AMOUNT)) relayed++;
      }
    });
    messagesRelayed++;

    if (relayed === 0) {
      // Solo client: echo message back periodically to keep y-websocket's
      // wsLastMessageReceived fresh (prevents 30s reconnect timeout).
      // Messages may be encrypted so we can't inspect type — throttle to
      // one echo every 10s to avoid bandwidth waste.
      const now = Date.now();
      if (client.readyState === OPEN && (!client.lastEcho || now - client.lastEcho > 10_000)) {
        client.send(data);
        client.lastEcho = now;
      }
      if (asyncRooms.has(roomId)) {
        asyncBuffer.add(roomId, client.clientTag, data).catch((err) => {
          console.error('[Buffer] Error adding message:', err.message);
        });
      }
    }
  }

  /** A client that joined is gone */
  function leave(client) {
    if (!client.joined) return;
    client.joined = false;
    releaseIP(client.clientIP);
    const room = rooms.get(client.roomId);
    if (!room) return;
    room.delete(client);
    if (room.size > 0) {
      log(`[${client.kind}] Client from ${client.clientIP} left room "${client.roomId.slice(0, 8)}..." (${room.size} remaining)`);
    } else {
      rooms.delete(client.roomId);
      roomLastActivity.set(client.roomId, Date.now());
    }
  }

  /** Buffers past their age, orphaned rooms (memory buffer only: Redis has its TTL) */
  function cleanup(now = Date.now()) {
    let cleanedOrphans = 0;
    const { emptied, dropped } = asyncBuffer.cleanup(now);
    for (const roomId of emptied) {
      if (rooms.has(roomId)) continue;
      asyncRooms.delete(roomId);
      roomTokens.delete(roomId);
      roomLastActivity.delete(roomId);
    }
    for (const [roomId, lastActivity] of roomLastActivity.entries()) {
      if (rooms.has(roomId)) continue;
      if (asyncBuffer.holds(roomId)) continue;
      if (now - lastActivity < BUFFER_LIMITS.ORPHAN_MAX_AGE_MS) continue;
      asyncRooms.delete(roomId);
      roomTokens.delete(roomId);
      roomLastActivity.delete(roomId);
      roomReconnects.delete(roomId);
      cleanedOrphans++;
    }
    if (emptied.length > 0 || dropped > 0 || cleanedOrphans > 0) {
      log(`[Cleanup] Removed ${emptied.length} buffered rooms, ${dropped} messages, ${cleanedOrphans} orphaned rooms`);
    }
  }

  function stats() {
    return {
      rooms: rooms.size,
      asyncRooms: asyncRooms.size,
      clients: Array.from(rooms.values()).reduce((sum, r) => sum + r.size, 0),
      uniqueIPs: connectionsPerIP.size,
      messagesRelayed,
      connectionsServed,
    };
  }

  /** Closes every client (shutdown) and forgets every room */
  function closeAll(code, reason) {
    rooms.forEach((room) => room.forEach((client) => client.close(code, reason)));
    rooms.clear();
    connectionsPerIP.clear();
    asyncRooms.clear();
    roomTokens.clear();
  }

  return { join, receive, leave, cleanup, stats, closeAll };
}
