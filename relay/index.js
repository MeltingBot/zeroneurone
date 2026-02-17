/**
 * zeroneurone relay server - Production standalone
 *
 * WebSocket relay for E2E encrypted Yjs collaboration with async buffering.
 * This is the production relay, designed to run as a standalone container
 * independent from the web application.
 *
 * Usage: node index.js
 *
 * Environment variables:
 * - PORT:      WebSocket + health port (default: 4444)
 * - HOST:      Bind address (default: 0.0.0.0)
 * - REDIS_URL: Redis connection URL for persistent buffer storage (optional)
 *              Example: redis://localhost:6379
 *              If not set, uses in-memory storage (lost on restart)
 *
 * URL parameters:
 * - async=1:   Enable async buffering (messages stored when alone in room)
 * - token=xxx: Access token for room (HMAC-based, prevents random access)
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// ============================================================================
// REDIS (optional)
// ============================================================================

let redisClient = null;
const REDIS_URL = process.env.REDIS_URL;

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

const PORT = process.env.PORT || 4444;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// SECURITY LIMITS (DoS Protection)
// ============================================================================
const LIMITS = {
  MAX_MESSAGE_SIZE: 100 * 1024 * 1024,   // 100 MB max per message
  RATE_WINDOW_MS: 1000,
  MAX_MESSAGES_PER_WINDOW: 500,
  MAX_CONNECTIONS_PER_IP: 10,
  MAX_CLIENTS_PER_ROOM: 50,
  MAX_ROOMS: 1000,
  MAX_ROOM_ID_LENGTH: 128,
  ROOM_ID_PATTERN: /^[a-zA-Z0-9._-]+$/,
};

// ============================================================================
// BUFFER LIMITS (Async mode)
// ============================================================================
const BUFFER_LIMITS = {
  MAX_BUFFER_SIZE_PER_ROOM: 50 * 1024 * 1024,    // 50 MB per room
  MAX_MESSAGES_PER_ROOM: 10000,
  MAX_MESSAGE_AGE_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days
  MAX_ROOMS_WITH_BUFFER: 1000,
  MAX_TOTAL_BUFFER_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB total
};

// ============================================================================
// STATE
// ============================================================================
const connectionsPerIP = new Map();
const rooms = new Map();
const asyncRooms = new Set();
const roomTokens = new Map();
const buffers = new Map();
const bufferStats = new Map();
let totalBufferSize = 0;

// ============================================================================
// HELPERS
// ============================================================================

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
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
  const roomIdShort = roomId.slice(0, 8) + '...';

  if (redisClient) {
    try {
      const key = `buffer:${roomId}`;
      const message = JSON.stringify({
        data: Buffer.from(data).toString('base64'),
        timestamp: Date.now()
      });
      await redisClient.rPush(key, message);
      await redisClient.expire(key, Math.floor(BUFFER_LIMITS.MAX_MESSAGE_AGE_MS / 1000));
      const len = await redisClient.lLen(key);
      if (len > BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM) {
        await redisClient.lTrim(key, -BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM, -1);
        console.log(`[Buffer/Redis] Trimmed room "${roomIdShort}" to ${BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM} messages`);
      }
      return true;
    } catch (err) {
      console.error(`[Buffer/Redis] Error adding to buffer:`, err.message);
      return false;
    }
  }

  if (!canAddToBufferMemory(roomId, messageSize)) {
    console.log(`[Buffer] Quota exceeded for room "${roomIdShort}"`);
    return false;
  }

  if (!buffers.has(roomId)) buffers.set(roomId, []);
  buffers.get(roomId).push({ data, timestamp: Date.now() });

  const stats = bufferStats.get(roomId) || { size: 0, count: 0 };
  stats.size += messageSize;
  stats.count += 1;
  bufferStats.set(roomId, stats);
  totalBufferSize += messageSize;
  return true;
}

async function flushBuffer(roomId, ws) {
  if (redisClient) {
    try {
      const key = `buffer:${roomId}`;
      const messages = await redisClient.lRange(key, 0, -1);
      if (!messages || messages.length === 0) return 0;

      let sent = 0;
      for (const msgStr of messages) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            const msg = JSON.parse(msgStr);
            ws.send(Buffer.from(msg.data, 'base64'));
            sent++;
          } catch (e) {
            console.error(`[Buffer/Redis] Error parsing message:`, e.message);
          }
        }
      }
      await redisClient.del(key);
      return sent;
    } catch (err) {
      console.error(`[Buffer/Redis] Error flushing buffer:`, err.message);
      return 0;
    }
  }

  const buffer = buffers.get(roomId);
  if (!buffer || buffer.length === 0) return 0;

  let sent = 0;
  for (const msg of buffer) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg.data);
      sent++;
    }
  }

  const stats = bufferStats.get(roomId);
  if (stats) totalBufferSize -= stats.size;
  buffers.delete(roomId);
  bufferStats.delete(roomId);
  return sent;
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

async function cleanupBuffers() {
  if (redisClient) return; // Redis handles TTL

  const now = Date.now();
  let cleanedRooms = 0;
  let cleanedMessages = 0;

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

  if (cleanedRooms > 0 || cleanedMessages > 0) {
    console.log(`[Cleanup] Removed ${cleanedRooms} rooms, ${cleanedMessages} messages`);
  }
}

setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// HTTP SERVER (health endpoint only)
// ============================================================================

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
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

  // Token validation
  if (roomTokens.has(roomId)) {
    if (roomTokens.get(roomId) !== token) {
      console.log(`[WS] Rejected connection to room "${roomId.slice(0, 8)}...": invalid token`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Invalid token');
      return;
    }
  } else if (token) {
    roomTokens.set(roomId, token);
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

  // Send buffered messages (delayed for client initialization)
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
  console.log(`[WS] Client from ${clientIP} joined room "${roomIdShort}" (${room.size} client${room.size > 1 ? 's' : ''}${asyncRooms.has(roomId) ? ', async' : ''})`);

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

    let relayed = 0;
    currentRoom.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
        relayed++;
      }
    });

    if (relayed === 0 && asyncRooms.has(roomId)) {
      addToBuffer(roomId, data).catch(err => {
        console.error(`[Buffer] Error adding message:`, err.message);
      });
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
      console.log(`[WS] Client from ${clientIP} left room "${roomIdShort}" (${currentRoom.size} remaining)`);
      if (currentRoom.size === 0) rooms.delete(roomId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error in room "${roomIdShort}" from ${clientIP}:`, err.message);
  });
});

// ============================================================================
// START
// ============================================================================

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              zeroneurone relay server                      ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  WebSocket: ws://${HOST}:${PORT}/<roomId>`.padEnd(63) + '║');
  console.log(`║  Health:    http://${HOST}:${PORT}/health`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  URL params:                                               ║');
  console.log('║  • async=1   Enable async buffering                        ║');
  console.log('║  • token=xxx Room access token                             ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Limits:                                                   ║');
  console.log(`║  • Max message:  ${(LIMITS.MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(0)} MB`.padEnd(63) + '║');
  console.log(`║  • Rate limit:   ${LIMITS.MAX_MESSAGES_PER_WINDOW}/sec`.padEnd(63) + '║');
  console.log(`║  • Buffer/room:  ${(BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM / 1024 / 1024).toFixed(0)} MB, ${BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM} msgs, 7 days`.padEnd(63) + '║');
  console.log(`║  • Storage:      ${redisClient ? 'Redis (persistent)' : 'Memory (ephemeral)'}`.padEnd(63) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', () => {
  console.log('[Relay] SIGTERM received, shutting down...');

  rooms.forEach((room) => {
    room.forEach((ws) => ws.close(1001, 'Server shutting down'));
  });
  rooms.clear();
  connectionsPerIP.clear();
  buffers.clear();
  bufferStats.clear();
  asyncRooms.clear();
  roomTokens.clear();

  server.close(() => {
    console.log('[Relay] Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('[Relay] Forcing exit...');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n[Relay] SIGINT received');
  process.emit('SIGTERM');
});
