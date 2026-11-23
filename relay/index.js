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
import { createAsyncBuffer } from './asyncBuffer.js';
import { loadEnvFile, relayConfig } from './config.js';
import { RELAY_FEATURES } from './forward.js';
import { createRoomHub } from './room.js';
import { createSseRoutes } from './sse.js';

loadEnvFile();
const { PORT, HOST, REDIS_URL, TRUST_PROXY, ALLOWED_ORIGIN, LIMITS, BUFFER_LIMITS, REFUSE_WEBSOCKET } = relayConfig();

const VERSION = '2.95.2';
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
// HELPERS
// ============================================================================

function getClientIP(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ============================================================================
// BUFFER STORAGE (Memory or Redis, see asyncBuffer.js)
// ============================================================================

const asyncBuffer = createAsyncBuffer({ limits: BUFFER_LIMITS, redis: redisClient });

const hub = createRoomHub({ LIMITS, BUFFER_LIMITS, asyncBuffer });
const sse = createSseRoutes({ hub, LIMITS, getClientIP });

function cleanupBuffers() {
  if (redisClient) return; // Redis handles TTL
  hub.cleanup();
}

const cleanupInterval = setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// HTTP SERVER (health + metrics endpoint)
// ============================================================================

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Relay-Features, X-Relay-Time');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/api/health') {
    res.setHeader('X-Relay-Features', RELAY_FEATURES);
    // Its clock: a writer signs with it, whatever the time on its device (access.js)
    res.setHeader('X-Relay-Time', String(Math.floor(Date.now() / 1000)));
    const { messagesRelayed, connectionsServed, ...counts } = hub.stats();
    const metrics = {
      status: 'ok',
      version: VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      ...counts,
      messagesRelayed,
      connectionsServed,
      buffer: asyncBuffer.stats(),
      storage: redisClient ? 'redis' : 'memory',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
    return;
  }

  // HTTP fallback for networks that block WebSocket (sse.js)
  if (sse.handle(req, res)) return;

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
  // Tests only: a network that blocks WebSocket, to exercise the fallback
  verifyClient: () => !REFUSE_WEBSOCKET,
});

wss.on('connection', (ws, req) => {
  if (!hub.join(ws, new URL(req.url, 'http://localhost'), getClientIP(req), 'WS')) return;

  // Keepalive ping/pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => hub.receive(ws, data));
  ws.on('close', () => hub.leave(ws));
  ws.on('error', (err) => {
    console.error(`[WS] Error in room "${ws.roomId.slice(0, 8)}..." from ${ws.clientIP}:`, err.message);
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

  // Close every connection with a clean code (HTTP fallback streams too)
  const closePromises = [];
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      closePromises.push(new Promise((resolve) => {
        client.on('close', resolve);
        setTimeout(resolve, 2000);
      }));
    }
  }
  hub.closeAll(1001, 'Server shutting down');
  if (closePromises.length > 0) {
    console.log(`[Relay] Closing ${closePromises.length} WebSocket connections...`);
    await Promise.all(closePromises);
  }
  asyncBuffer.clear();

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
