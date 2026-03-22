/**
 * WebSocket relay server for E2E encrypted Yjs collaboration
 * Supports both real-time sync and async buffering
 *
 * Usage: node relay-server.js [port]
 * Default port: 4444
 *
 * Environment variables:
 * - REDIS_URL: Redis connection URL for persistent buffer storage (optional)
 *              Example: redis://localhost:6379
 *              If not set, uses in-memory storage (lost on restart)
 * - TRUST_PROXY: Set to "1" to trust X-Forwarded-For header (when behind reverse proxy)
 *
 * Room ID formats supported:
 * - Legacy: UUID (e.g., ef2ae2c2-ae85-4a82-bcaf-6435e3a36e15)
 * - New (v1.7+): SHA-256 hash (32 hex chars)
 *
 * URL parameters:
 * - async=1: Enable async buffering (messages stored when alone in room)
 * - token=xxx: Access token for room (HMAC-based, prevents random access)
 *
 * Includes DoS protection:
 * - Message size limits
 * - Rate limiting per client
 * - Connection limits per IP
 * - Room size limits
 * - Buffer quotas
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { createHash } from 'crypto';

const VERSION = '3';
const startedAt = Date.now();
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Optional Redis support
let redis = null;
let redisClient = null;
const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    redis = await import('redis');
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    redisClient.on('error', (err) => console.error('[Redis] Runtime error:', err.message));
    console.log('[Redis] Connected to', REDIS_URL);
  } catch (err) {
    console.warn('[Redis] Failed to connect, falling back to in-memory storage:', err.message);
    redisClient = null;
  }
}

const port = process.argv[2] || 4444;

// ============================================================================
// SECURITY LIMITS (DoS Protection)
// ============================================================================
const LIMITS = {
  MAX_MESSAGE_SIZE: 50 * 1024 * 1024,   // 50 MB max per message
  RATE_WINDOW_MS: 1000,                  // 1 second window
  MAX_MESSAGES_PER_WINDOW: 500,          // Max messages per window per client
  MAX_CONNECTIONS_PER_IP: 10,            // Max concurrent connections per IP
  MAX_CLIENTS_PER_ROOM: 50,             // Max clients in a room
  MAX_ROOMS: 1000,                       // Max concurrent rooms
  MAX_ROOM_ID_LENGTH: 128,
  ROOM_ID_PATTERN: /^[a-zA-Z0-9._-]+$/,
  // Backpressure: pause relay if client buffer exceeds this
  MAX_BUFFERED_AMOUNT: 4 * 1024 * 1024, // 4 MB
};

// ============================================================================
// BUFFER LIMITS (Async mode)
// ============================================================================
const BUFFER_LIMITS = {
  MAX_BUFFER_SIZE_PER_ROOM: 50 * 1024 * 1024,  // 50 MB per room
  MAX_MESSAGES_PER_ROOM: 10000,
  MAX_MESSAGE_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_ROOMS_WITH_BUFFER: 1000,
  MAX_TOTAL_BUFFER_SIZE: 1 * 1024 * 1024 * 1024, // 1 GB total
  // Orphan cleanup: rooms with no connections and no buffer activity
  ORPHAN_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================================================
// STATE
// ============================================================================
const connectionsPerIP = new Map();      // IP -> count
const rooms = new Map();                 // roomId -> Set<WebSocket>
const asyncRooms = new Set();            // Rooms with async enabled
const roomTokens = new Map();            // roomId -> hashed token
const roomLastActivity = new Map();      // roomId -> timestamp (for orphan cleanup)
const buffers = new Map();               // roomId -> Array<{data, timestamp}>
const bufferStats = new Map();           // roomId -> { size, count }
let totalBufferSize = 0;

// Stats counters
let totalMessagesRelayed = 0;
let totalConnectionsServed = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get client IP from request — only trust X-Forwarded-For when behind a known proxy
 */
function getClientIP(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Hash a token for storage (SHA-256, constant-time comparison not needed since we compare hashes)
 */
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
// BUFFER STORAGE (Memory or Redis)
// ============================================================================

function canAddToBufferMemory(roomId, messageSize) {
  const stats = bufferStats.get(roomId) || { size: 0, count: 0 };
  if (stats.size + messageSize > BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM) return false;
  if (stats.count >= BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM) return false;
  if (totalBufferSize + messageSize > BUFFER_LIMITS.MAX_TOTAL_BUFFER_SIZE) return false;
  if (!bufferStats.has(roomId) && bufferStats.size >= BUFFER_LIMITS.MAX_ROOMS_WITH_BUFFER) return false;
  return true;
}

async function addToBuffer(roomId, data) {
  const messageSize = data.length;

  if (redisClient) {
    try {
      const key = `buffer:${roomId}`;
      // Store as raw Buffer (no base64 overhead)
      await redisClient.rPush(key, data);
      await redisClient.expire(key, Math.floor(BUFFER_LIMITS.MAX_MESSAGE_AGE_MS / 1000));

      const len = await redisClient.lLen(key);
      if (len > BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM) {
        await redisClient.lTrim(key, -BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM, -1);
      }
      return true;
    } catch (err) {
      console.error(`[Buffer/Redis] Error adding to buffer:`, err.message);
      return false;
    }
  } else {
    if (!canAddToBufferMemory(roomId, messageSize)) return false;

    if (!buffers.has(roomId)) {
      buffers.set(roomId, []);
    }
    buffers.get(roomId).push({ data, timestamp: Date.now() });

    const stats = bufferStats.get(roomId) || { size: 0, count: 0 };
    stats.size += messageSize;
    stats.count += 1;
    bufferStats.set(roomId, stats);
    totalBufferSize += messageSize;

    return true;
  }
}

/**
 * Send buffer to client — only clear after all messages are sent successfully
 */
async function flushBuffer(roomId, ws) {
  if (redisClient) {
    try {
      const key = `buffer:${roomId}`;
      const messages = await redisClient.lRangeBuffer(key, 0, -1);
      if (!messages || messages.length === 0) return 0;

      let sent = 0;
      for (const buf of messages) {
        if (ws.readyState !== WebSocket.OPEN) break;
        ws.send(buf);
        sent++;
      }

      // Only clear if we sent everything
      if (sent === messages.length) {
        await redisClient.del(key);
      } else if (sent > 0) {
        // Partial send: trim only what was sent
        await redisClient.lTrim(key, sent, -1);
      }
      return sent;
    } catch (err) {
      console.error(`[Buffer/Redis] Error flushing buffer:`, err.message);
      return 0;
    }
  } else {
    const buffer = buffers.get(roomId);
    if (!buffer || buffer.length === 0) return 0;

    let sent = 0;
    for (const msg of buffer) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(msg.data);
      sent++;
    }

    if (sent === buffer.length) {
      // All sent — clear completely
      const stats = bufferStats.get(roomId);
      if (stats) totalBufferSize -= stats.size;
      buffers.delete(roomId);
      bufferStats.delete(roomId);
    } else if (sent > 0) {
      // Partial send — keep unsent messages
      const remaining = buffer.slice(sent);
      buffers.set(roomId, remaining);
      const sentSize = buffer.slice(0, sent).reduce((s, m) => s + m.data.length, 0);
      const stats = bufferStats.get(roomId);
      if (stats) {
        stats.size -= sentSize;
        stats.count -= sent;
        totalBufferSize -= sentSize;
      }
    }
    return sent;
  }
}

async function hasBuffer(roomId) {
  if (redisClient) {
    try {
      return (await redisClient.lLen(`buffer:${roomId}`)) > 0;
    } catch {
      return false;
    }
  }
  return buffers.has(roomId) && buffers.get(roomId).length > 0;
}

/**
 * Cleanup old messages from buffers AND orphaned rooms
 * Orphaned room = no active connections + no buffer + older than ORPHAN_MAX_AGE_MS
 */
async function cleanupBuffers() {
  const now = Date.now();
  let cleanedRooms = 0;
  let cleanedMessages = 0;
  let cleanedOrphans = 0;

  if (!redisClient) {
    // Memory mode: clean old messages
    for (const [roomId, messages] of buffers.entries()) {
      const before = messages.length;
      const filtered = messages.filter(m => now - m.timestamp < BUFFER_LIMITS.MAX_MESSAGE_AGE_MS);

      if (filtered.length === 0) {
        const stats = bufferStats.get(roomId);
        if (stats) totalBufferSize -= stats.size;
        buffers.delete(roomId);
        bufferStats.delete(roomId);
        asyncRooms.delete(roomId);
        roomTokens.delete(roomId);
        roomLastActivity.delete(roomId);
        cleanedRooms++;
      } else if (filtered.length < before) {
        buffers.set(roomId, filtered);
        const newSize = filtered.reduce((sum, m) => sum + m.data.length, 0);
        const oldStats = bufferStats.get(roomId);
        if (oldStats) totalBufferSize -= oldStats.size - newSize;
        bufferStats.set(roomId, { size: newSize, count: filtered.length });
        cleanedMessages += before - filtered.length;
      }
    }
  }

  // Clean orphaned rooms: no connections, no buffer, stale activity
  for (const [roomId, lastActivity] of roomLastActivity.entries()) {
    if (rooms.has(roomId)) continue; // Still has connections
    if (buffers.has(roomId) && buffers.get(roomId).length > 0) continue; // Has buffer data
    if (now - lastActivity < BUFFER_LIMITS.ORPHAN_MAX_AGE_MS) continue; // Too recent

    asyncRooms.delete(roomId);
    roomTokens.delete(roomId);
    roomLastActivity.delete(roomId);
    cleanedOrphans++;
  }

  if (cleanedRooms > 0 || cleanedMessages > 0 || cleanedOrphans > 0) {
    console.log(`[Cleanup] Removed ${cleanedRooms} buffered rooms, ${cleanedMessages} messages, ${cleanedOrphans} orphaned rooms`);
  }
}

// Run cleanup every hour
const cleanupInterval = setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocketServer({
  port,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
});

wss.on('connection', (ws, req) => {
  const clientIP = getClientIP(req);
  totalConnectionsServed++;

  // ========== CONNECTION LIMIT PER IP ==========
  const currentConnections = connectionsPerIP.get(clientIP) || 0;
  if (currentConnections >= LIMITS.MAX_CONNECTIONS_PER_IP) {
    console.log(`[!] Rejected connection from ${clientIP}: too many connections`);
    ws.close(1008, 'Too many connections');
    return;
  }
  connectionsPerIP.set(clientIP, currentConnections + 1);

  // ========== ROOM LIMIT ==========
  if (rooms.size >= LIMITS.MAX_ROOMS) {
    console.log(`[!] Rejected connection: too many rooms`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Server at capacity');
    return;
  }

  // ========== PARSE URL ==========
  const url = new URL(req.url, 'http://localhost');
  const asyncEnabled = url.searchParams.get('async') === '1';
  const token = url.searchParams.get('token');

  let urlPath = url.pathname.slice(1) || 'default';
  const segments = urlPath.split('/').filter(Boolean);
  const roomId = segments.length > 0 ? segments[segments.length - 1] : 'default';

  // ========== ROOM ID VALIDATION ==========
  if (!isValidRoomId(roomId)) {
    console.log(`[!] Rejected connection: invalid room ID "${roomId.slice(0, 32)}..."`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Invalid room ID');
    return;
  }

  // ========== TOKEN VALIDATION (hashed comparison) ==========
  const tokenHash = token ? hashToken(token) : null;

  if (roomTokens.has(roomId)) {
    if (roomTokens.get(roomId) !== tokenHash) {
      console.log(`[!] Rejected connection to room "${roomId.slice(0, 8)}...": invalid token`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Invalid token');
      return;
    }
  } else if (tokenHash) {
    roomTokens.set(roomId, tokenHash);
  }

  // ========== SETUP ROOM ==========
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId);

  // ========== ROOM SIZE LIMIT ==========
  if (room.size >= LIMITS.MAX_CLIENTS_PER_ROOM) {
    console.log(`[!] Rejected connection to room "${roomId.slice(0, 8)}...": room full`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Room full');
    return;
  }

  if (asyncEnabled) {
    asyncRooms.add(roomId);
  }
  room.add(ws);
  roomLastActivity.set(roomId, Date.now());

  // ========== SEND BUFFERED MESSAGES ==========
  if (asyncRooms.has(roomId)) {
    setTimeout(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (await hasBuffer(roomId)) {
        const sent = await flushBuffer(roomId, ws);
        if (sent > 0) {
          console.log(`[Buffer] Sent ${sent} buffered messages to new client in room "${roomId.slice(0, 8)}..."`);
        }
      }
    }, 1500);
  }

  const rateLimiter = createRateLimiter();
  const roomIdShort = roomId.slice(0, 8) + '...';
  console.log(`[+] Client from ${clientIP} joined room "${roomIdShort}" (${room.size} client${room.size > 1 ? 's' : ''}${asyncRooms.has(roomId) ? ', async' : ''})`);

  // ========== MESSAGE HANDLING ==========
  ws.on('message', (data) => {
    if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
      console.log(`[!] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
      ws.close(1009, 'Message too large');
      return;
    }

    if (!rateLimiter.check()) {
      console.log(`[!] Rate limited client ${clientIP} in room "${roomIdShort}"`);
      return;
    }

    const currentRoom = rooms.get(roomId);
    if (!currentRoom) return;

    roomLastActivity.set(roomId, Date.now());

    // Relay to other clients (with backpressure)
    let relayed = 0;
    currentRoom.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        // Skip clients with full send buffer to avoid memory buildup
        if (client.bufferedAmount > LIMITS.MAX_BUFFERED_AMOUNT) return;
        client.send(data);
        relayed++;
      }
    });

    totalMessagesRelayed++;

    // Buffer when alone in async mode
    if (relayed === 0 && asyncRooms.has(roomId)) {
      addToBuffer(roomId, data).catch(err => {
        console.error(`[Buffer] Error adding message:`, err.message);
      });
    }
  });

  // ========== DISCONNECT HANDLING ==========
  ws.on('close', () => {
    const count = connectionsPerIP.get(clientIP) || 1;
    if (count <= 1) {
      connectionsPerIP.delete(clientIP);
    } else {
      connectionsPerIP.set(clientIP, count - 1);
    }

    const currentRoom = rooms.get(roomId);
    if (currentRoom) {
      currentRoom.delete(ws);
      console.log(`[-] Client from ${clientIP} left room "${roomIdShort}" (${currentRoom.size} client${currentRoom.size !== 1 ? 's' : ''} remaining)`);

      if (currentRoom.size === 0) {
        rooms.delete(roomId);
        roomLastActivity.set(roomId, Date.now());
        // Keep asyncRooms, roomTokens, buffers — cleaned by cleanup job
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] WebSocket error in room "${roomIdShort}" from ${clientIP}:`, err.message);
  });
});

// ============================================================================
// HEALTH & METRICS ENDPOINT (HTTP)
// ============================================================================

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
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
      buffer: {
        rooms: bufferStats.size,
        totalSize: totalBufferSize,
        totalMessages: Array.from(bufferStats.values()).reduce((s, st) => s + st.count, 0),
      },
      storage: redisClient ? 'redis' : 'memory',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const httpPort = parseInt(port) + 1;
httpServer.listen(httpPort);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Shutdown] Received ${signal}, closing gracefully...`);

  // Stop accepting new connections
  wss.close();
  httpServer.close();
  clearInterval(cleanupInterval);

  // Close all WebSocket connections with a clean code
  const closePromises = [];
  for (const [, room] of rooms) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        closePromises.push(new Promise((resolve) => {
          client.on('close', resolve);
          client.close(1001, 'Server shutting down');
          // Force-close after 2s if client doesn't respond
          setTimeout(resolve, 2000);
        }));
      }
    }
  }

  if (closePromises.length > 0) {
    console.log(`[Shutdown] Closing ${closePromises.length} WebSocket connections...`);
    await Promise.all(closePromises);
  }

  // Close Redis connection
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Shutdown] Redis disconnected');
    } catch {
      // Ignore
    }
  }

  console.log('[Shutdown] Done');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// STARTUP
// ============================================================================
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log(`║           zeroneurone relay server v${VERSION}`.padEnd(63) + '║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║  WebSocket: ws://localhost:${port}/<roomId>`.padEnd(63) + '║');
console.log(`║  Health:    http://localhost:${httpPort}/health`.padEnd(63) + '║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  URL params:                                               ║');
console.log('║  • async=1   Enable async buffering                        ║');
console.log('║  • token=xxx Room access token                             ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  Limits:                                                   ║');
console.log(`║  • Max message:  ${(LIMITS.MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(0)} MB`.padEnd(63) + '║');
console.log(`║  • Rate limit:   ${LIMITS.MAX_MESSAGES_PER_WINDOW}/sec`.padEnd(63) + '║');
console.log(`║  • Backpressure: ${(LIMITS.MAX_BUFFERED_AMOUNT / 1024 / 1024).toFixed(0)} MB/client`.padEnd(63) + '║');
console.log(`║  • Buffer/room:  ${(BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM / 1024 / 1024).toFixed(0)} MB, ${BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM} msgs, 7 days`.padEnd(63) + '║');
console.log(`║  • Storage:      ${redisClient ? 'Redis (persistent)' : 'Memory (ephemeral)'}`.padEnd(63) + '║');
console.log(`║  • Trust proxy:  ${TRUST_PROXY ? 'yes' : 'no'}`.padEnd(63) + '║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
