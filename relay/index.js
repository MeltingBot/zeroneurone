/**
 * zeroneurone relay server - Production standalone
 *
 * WebSocket relay for E2E encrypted Yjs collaboration with async buffering.
 * This is the production relay, designed to run as a standalone container
 * independent from the web application.
 *
 * Usage: node index.js
 *
 * Settings: environment variables, or a .env file (relay/config.js). Every
 * one, with its default, is listed in relay/.env.example.
 *
 * URL parameters:
 * - async=1:   Enable async buffering (messages stored when alone in room)
 * - token=xxx: Access token for room (HMAC-based, prevents random access)
 * - client=xxx: Opaque client tag, per room (async buffer: what it already got)
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createHash, randomBytes } from 'crypto';
import { createAsyncBuffer, clientTagOf } from './asyncBuffer.js';
import { loadEnvFile, relayConfig } from './config.js';
import { forward } from './forward.js';

loadEnvFile();
const { PORT, HOST, REDIS_URL, TRUST_PROXY, ALLOWED_ORIGIN, LIMITS, BUFFER_LIMITS } = relayConfig();

const VERSION = '4';
const startedAt = Date.now();

// ============================================================================
// REDIS (optional)
// ============================================================================

let redisClient = null;

if (REDIS_URL) {
  try {
    const redis = await import('redis');
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    redisClient.on('error', (err) => console.error('[Redis] Runtime error:', err.message));
    console.log('[Redis] Connected to', REDIS_URL);
  } catch (err) {
    console.warn('[Redis] Failed to connect, falling back to in-memory storage:', err.message);
    redisClient = null;
  }
}


// ============================================================================
// STATE
// ============================================================================
const connectionsPerIP = new Map();
const rooms = new Map();
const asyncRooms = new Set();
const roomTokens = new Map();            // roomId → hashed token
const roomLastActivity = new Map();      // roomId → timestamp (for orphan cleanup)
const roomReconnects = new Map();        // roomId → { count, lastLog }
let totalMessagesRelayed = 0;
let totalConnectionsServed = 0;

// ============================================================================
// HELPERS
// ============================================================================

function getClientIP(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

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
    }
  };
}

// ============================================================================
// BUFFER STORAGE (Memory or Redis, see asyncBuffer.js)
// ============================================================================

const asyncBuffer = createAsyncBuffer({ limits: BUFFER_LIMITS, redis: redisClient });

async function cleanupBuffers() {
  if (redisClient) return; // Redis handles TTL

  const now = Date.now();
  let cleanedOrphans = 0;

  // Messages past their age; rooms left without any
  const { emptied, dropped } = asyncBuffer.cleanup(now);
  for (const roomId of emptied) {
    if (rooms.has(roomId)) continue;
    asyncRooms.delete(roomId);
    roomTokens.delete(roomId);
    roomLastActivity.delete(roomId);
  }

  // Clean orphaned rooms: no connections, no buffer, stale activity
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
    console.log(`[Cleanup] Removed ${emptied.length} buffered rooms, ${dropped} messages, ${cleanedOrphans} orphaned rooms`);
  }
}

const cleanupInterval = setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// HTTP SERVER (health + metrics endpoint)
// ============================================================================

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/api/health') {
    const totalClients = Array.from(rooms.values()).reduce((sum, r) => sum + r.size, 0);
    const metrics = {
      status: 'ok',
      version: VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      rooms: rooms.size,
      asyncRooms: asyncRooms.size,
      clients: totalClients,
      uniqueIPs: connectionsPerIP.size,
      messagesRelayed: totalMessagesRelayed,
      connectionsServed: totalConnectionsServed,
      buffer: asyncBuffer.stats(),
      storage: redisClient ? 'redis' : 'memory',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
    return;
  }

  res.writeHead(404);
  res.end();
});

// ============================================================================
// WEBSOCKET RELAY
// ============================================================================

const wss = new WebSocketServer({
  server,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  const clientIP = getClientIP(req);
  totalConnectionsServed++;

  // Connection limit per IP
  const currentConnections = connectionsPerIP.get(clientIP) || 0;
  if (currentConnections >= LIMITS.MAX_CONNECTIONS_PER_IP) {
    console.log(`[WS] Rejected connection from ${clientIP}: too many connections`);
    ws.close(1008, 'Too many connections');
    return;
  }
  connectionsPerIP.set(clientIP, currentConnections + 1);

  // Room limit
  if (rooms.size >= LIMITS.MAX_ROOMS) {
    console.log(`[WS] Rejected connection: too many rooms`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Server at capacity');
    return;
  }

  // Parse URL
  const url = new URL(req.url, 'http://localhost');
  const asyncEnabled = url.searchParams.get('async') === '1';
  const token = url.searchParams.get('token');
  const clientTag = clientTagOf(url.searchParams, () => randomBytes(9).toString('base64url'));

  let urlPath = url.pathname.slice(1) || 'default';
  if (urlPath.startsWith('ws/')) urlPath = urlPath.slice(3);
  const segments = urlPath.split('/').filter(Boolean);
  const roomId = segments.length > 0 ? segments[segments.length - 1] : 'default';

  // Room ID validation
  if (!isValidRoomId(roomId)) {
    console.log(`[WS] Rejected connection: invalid room ID "${roomId.slice(0, 32)}..."`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Invalid room ID');
    return;
  }

  // Token validation (hashed comparison — never stores plain text)
  const tokenHash = token ? hashToken(token) : null;

  if (roomTokens.has(roomId)) {
    if (roomTokens.get(roomId) !== tokenHash) {
      console.log(`[WS] Rejected connection to room "${roomId.slice(0, 8)}...": invalid token`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Invalid token');
      return;
    }
  } else if (tokenHash) {
    roomTokens.set(roomId, tokenHash);
  }

  // Setup room
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);

  // Room size limit
  if (room.size >= LIMITS.MAX_CLIENTS_PER_ROOM) {
    console.log(`[WS] Rejected connection to room "${roomId.slice(0, 8)}...": room full`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Room full');
    return;
  }

  if (asyncEnabled) asyncRooms.add(roomId);
  room.add(ws);
  roomLastActivity.set(roomId, Date.now());

  // Hand the client, even alone, the buffered messages it has not received
  // (its own left out). Delayed so the client is set up first (key, sync).
  if (asyncRooms.has(roomId)) {
    setTimeout(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const sent = await asyncBuffer.replay(roomId, clientTag, (data) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(data);
        return true;
      });
      if (sent > 0) {
        console.log(`[Buffer] Sent ${sent} buffered messages to a client in room "${roomId.slice(0, 8)}..."`);
      }
    }, 1500);
  }

  const rateLimiter = createRateLimiter();
  const roomIdShort = roomId.slice(0, 8) + '...';

  // Throttled join logging: log first join, then summarize reconnections
  if (room.size >= 2) {
    console.log(`[WS] Client from ${clientIP} joined room "${roomIdShort}" (${room.size} clients${asyncRooms.has(roomId) ? ', async' : ''})`);
    roomReconnects.delete(roomId);
  } else {
    const rc = roomReconnects.get(roomId) || { count: 0, lastLog: 0 };
    rc.count++;
    if (rc.count === 1) {
      console.log(`[WS] Client from ${clientIP} joined room "${roomIdShort}" (1 client${asyncRooms.has(roomId) ? ', async' : ''})`);
      rc.lastLog = Date.now();
    } else if (Date.now() - rc.lastLog > 5 * 60_000) {
      console.log(`[WS] Client from ${clientIP} reconnected to room "${roomIdShort}" (${rc.count} reconnections)`);
      rc.lastLog = Date.now();
    }
    roomReconnects.set(roomId, rc);
  }

  // Keepalive ping/pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Message handling
  ws.on('message', (data) => {
    if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
      console.log(`[WS] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
      ws.close(1009, 'Message too large');
      return;
    }

    if (!rateLimiter.check()) {
      console.log(`[WS] Rate limited client ${clientIP} in room "${roomIdShort}"`);
      return;
    }

    const currentRoom = rooms.get(roomId);
    if (!currentRoom) return;

    roomLastActivity.set(roomId, Date.now());

    let relayed = 0;
    currentRoom.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        // Backpressure: a client too far behind is disconnected, never left without the message
        if (forward(client, data, LIMITS.MAX_BUFFERED_AMOUNT)) relayed++;
      }
    });

    totalMessagesRelayed++;

    if (relayed === 0) {
      // Solo client: echo message back periodically to keep y-websocket's
      // wsLastMessageReceived fresh (prevents 30s reconnect timeout).
      // Messages may be encrypted so we can't inspect type — throttle to
      // one echo every 10s to avoid bandwidth waste.
      const now = Date.now();
      if (ws.readyState === WebSocket.OPEN && (!ws._lastEcho || now - ws._lastEcho > 10_000)) {
        ws.send(data);
        ws._lastEcho = now;
      }
      // Buffer for async rooms
      if (asyncRooms.has(roomId)) {
        asyncBuffer.add(roomId, clientTag, data).catch(err => {
          console.error(`[Buffer] Error adding message:`, err.message);
        });
      }
    }
  });

  // Disconnect handling
  ws.on('close', () => {
    const count = connectionsPerIP.get(clientIP) || 1;
    if (count <= 1) connectionsPerIP.delete(clientIP);
    else connectionsPerIP.set(clientIP, count - 1);

    const currentRoom = rooms.get(roomId);
    if (currentRoom) {
      currentRoom.delete(ws);
      if (currentRoom.size > 0) {
        console.log(`[WS] Client from ${clientIP} left room "${roomIdShort}" (${currentRoom.size} remaining)`);
      }
      if (currentRoom.size === 0) {
        rooms.delete(roomId);
        roomLastActivity.set(roomId, Date.now());
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error in room "${roomIdShort}" from ${clientIP}:`, err.message);
  });
});

// ============================================================================
// KEEPALIVE
// ============================================================================

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, LIMITS.PING_INTERVAL_MS);

wss.on('close', () => clearInterval(pingInterval));

// ============================================================================
// START
// ============================================================================

server.listen(PORT, HOST, () => {
  const ageHours = BUFFER_LIMITS.MAX_MESSAGE_AGE_MS / 3_600_000;
  const ageLabel = ageHours >= 24 ? `${(ageHours / 24).toFixed(0)}d` : `${ageHours}h`;
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║              zeroneurone relay server v${VERSION}`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  WebSocket: ws://${HOST}:${PORT}/<roomId>`.padEnd(63) + '║');
  console.log(`║  Health:    http://${HOST}:${PORT}/health`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  URL params:                                               ║');
  console.log('║  • async=1   Enable async buffering                        ║');
  console.log('║  • token=xxx Room access token (hashed)                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Limits:                                                   ║');
  console.log(`║  • Max message:  ${(LIMITS.MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(0)} MB`.padEnd(63) + '║');
  console.log(`║  • Rate limit:   ${LIMITS.MAX_MESSAGES_PER_WINDOW}/sec`.padEnd(63) + '║');
  console.log(`║  • Backpressure: ${(LIMITS.MAX_BUFFERED_AMOUNT / 1024 / 1024).toFixed(0)} MB/client`.padEnd(63) + '║');
  console.log(`║  • Conn/IP:      ${LIMITS.MAX_CONNECTIONS_PER_IP}`.padEnd(63) + '║');
  console.log(`║  • Clients/room: ${LIMITS.MAX_CLIENTS_PER_ROOM}`.padEnd(63) + '║');
  console.log(`║  • Max rooms:    ${LIMITS.MAX_ROOMS}`.padEnd(63) + '║');
  console.log(`║  • Ping:         ${LIMITS.PING_INTERVAL_MS / 1000}s (timeout ${LIMITS.PONG_TIMEOUT_MS / 1000}s)`.padEnd(63) + '║');
  console.log(`║  • Buffer/room:  ${(BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM / 1024 / 1024).toFixed(0)} MB, ${BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM} msgs, ${ageLabel}`.padEnd(63) + '║');
  console.log(`║  • Total buffer: ${(BUFFER_LIMITS.MAX_TOTAL_BUFFER_SIZE / 1024 / 1024 / 1024).toFixed(0)} GB`.padEnd(63) + '║');
  console.log(`║  • Storage:      ${redisClient ? 'Redis (persistent)' : 'Memory (ephemeral)'}`.padEnd(63) + '║');
  console.log(`║  • Trust proxy:  ${TRUST_PROXY ? 'yes' : 'no'}`.padEnd(63) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Relay] ${signal} received, shutting down...`);

  clearInterval(pingInterval);
  clearInterval(cleanupInterval);

  // Close all WebSocket connections with a clean code
  const closePromises = [];
  for (const [, room] of rooms) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        closePromises.push(new Promise((resolve) => {
          client.on('close', resolve);
          client.close(1001, 'Server shutting down');
          setTimeout(resolve, 2000);
        }));
      }
    }
  }

  if (closePromises.length > 0) {
    console.log(`[Relay] Closing ${closePromises.length} WebSocket connections...`);
    await Promise.all(closePromises);
  }

  rooms.clear();
  connectionsPerIP.clear();
  asyncBuffer.clear();
  roomReconnects.clear();
  asyncRooms.clear();
  roomTokens.clear();
  roomLastActivity.clear();

  // Close Redis connection
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Relay] Redis disconnected');
    } catch {
      // Ignore
    }
  }

  server.close(() => {
    console.log('[Relay] Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('[Relay] Forcing exit...');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
