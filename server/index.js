/**
 * Production server for zeroneurone
 *
 * Combines:
 * - Static file serving for the React app
 * - WebSocket relay for E2E encrypted Yjs collaboration (with async buffer)
 *
 * Single port deployment - all traffic through one endpoint.
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - HOST: Server host (default: 0.0.0.0)
 * - REDIS_URL: Redis connection URL for persistent buffer storage (optional)
 *              Example: redis://localhost:6379
 *              If not set, uses in-memory storage (lost on restart)
 *
 * WebSocket URL parameters:
 * - async=1: Enable async buffering (messages stored when alone in room)
 * - token=xxx: Access token for room (HMAC-based, prevents random access)
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Optional Redis support
let redis = null;
let redisClient = null;
const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    redis = await import('redis');
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    // Only register error handler AFTER successful connection (for runtime errors)
    redisClient.on('error', (err) => console.error('[Redis] Runtime error:', err.message));
    console.log('[Redis] Connected to', REDIS_URL);
  } catch (err) {
    console.warn('[Redis] Failed to connect, falling back to in-memory storage:', err.message);
    redisClient = null;
  }
}
import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// SECURITY LIMITS (DoS Protection)
// ============================================================================
const LIMITS = {
  // Message limits
  MAX_MESSAGE_SIZE: 100 * 1024 * 1024,   // 100 MB max per message (for large media in base64)

  // Rate limiting (relaxed for media sync)
  RATE_WINDOW_MS: 1000,                  // 1 second window
  MAX_MESSAGES_PER_WINDOW: 500,          // Max messages per window per client

  // Connection limits
  MAX_CONNECTIONS_PER_IP: 10,            // Max concurrent connections per IP
  MAX_CLIENTS_PER_ROOM: 50,              // Max clients in a room
  MAX_ROOMS: 1000,                       // Max concurrent rooms

  // Room ID validation
  MAX_ROOM_ID_LENGTH: 128,               // Max room ID length
  ROOM_ID_PATTERN: /^[a-zA-Z0-9._-]+$/,  // Allowed characters (includes . for domains)
};

// ============================================================================
// BUFFER LIMITS (Async mode)
// ============================================================================
const BUFFER_LIMITS = {
  MAX_BUFFER_SIZE_PER_ROOM: 50 * 1024 * 1024,  // 50 MB per room
  MAX_MESSAGES_PER_ROOM: 10000,                 // Max messages in buffer
  MAX_MESSAGE_AGE_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
  MAX_ROOMS_WITH_BUFFER: 1000,                  // Max rooms with active buffer
  MAX_TOTAL_BUFFER_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB total (prod server)
};

// ============================================================================
// STATE
// ============================================================================
const connectionsPerIP = new Map();      // IP -> count
const rooms = new Map();                 // roomId -> Set<WebSocket>
const asyncRooms = new Set();            // Rooms with async enabled
const roomTokens = new Map();            // roomId -> token (first client sets it)
const buffers = new Map();               // roomId -> Array<{data, timestamp}>
const bufferStats = new Map();           // roomId -> { size, count }
let totalBufferSize = 0;

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

// ============================================================================
// STATIC FILE SERVER
// ============================================================================

function serveStatic(req, res) {
  // Parse URL and remove query string
  let urlPath = req.url.split('?')[0];

  // Security: prevent directory traversal
  if (urlPath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Default to index.html for root
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = join(DIST_DIR, urlPath);

  // Check if file exists
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback: serve index.html for client-side routing
    const indexPath = join(DIST_DIR, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      createReadStream(indexPath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Determine MIME type
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Cache headers: long cache for hashed assets, no-cache for HTML
  const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2?)$/i.test(filePath);
  const cacheControl = isHashed
    ? 'public, max-age=31536000, immutable'
    : ext === '.html'
    ? 'no-cache'
    : 'public, max-age=3600';

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Cache-Control': cacheControl,
  });

  createReadStream(filePath).pipe(res);
}

// ============================================================================
// BUFFER MANAGEMENT
// ============================================================================

/**
 * Get client IP from request, handling proxies
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Validate room ID
 */
function isValidRoomId(roomId) {
  if (!roomId || roomId.length > LIMITS.MAX_ROOM_ID_LENGTH) {
    return false;
  }
  return LIMITS.ROOM_ID_PATTERN.test(roomId);
}

/**
 * Rate limiter for a client
 */
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

/**
 * Check if we can add a message to the buffer (memory mode only)
 */
function canAddToBufferMemory(roomId, messageSize) {
  const stats = bufferStats.get(roomId) || { size: 0, count: 0 };

  if (stats.size + messageSize > BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM) {
    return false;
  }
  if (stats.count >= BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM) {
    return false;
  }
  if (totalBufferSize + messageSize > BUFFER_LIMITS.MAX_TOTAL_BUFFER_SIZE) {
    return false;
  }
  if (!bufferStats.has(roomId) && bufferStats.size >= BUFFER_LIMITS.MAX_ROOMS_WITH_BUFFER) {
    return false;
  }
  return true;
}

/**
 * Add message to buffer
 */
async function addToBuffer(roomId, data) {
  const messageSize = data.length;
  const roomIdShort = roomId.slice(0, 8) + '...';

  if (redisClient) {
    // Redis mode: store as base64 in a list with TTL
    try {
      const key = `buffer:${roomId}`;
      const message = JSON.stringify({
        data: Buffer.from(data).toString('base64'),
        timestamp: Date.now()
      });
      await redisClient.rPush(key, message);
      // Set TTL on the key (7 days)
      await redisClient.expire(key, Math.floor(BUFFER_LIMITS.MAX_MESSAGE_AGE_MS / 1000));

      // Check list length and trim if needed
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
  } else {
    // Memory mode
    if (!canAddToBufferMemory(roomId, messageSize)) {
      console.log(`[Buffer] Quota exceeded for room "${roomIdShort}"`);
      return false;
    }

    if (!buffers.has(roomId)) {
      buffers.set(roomId, []);
    }
    buffers.get(roomId).push({ data, timestamp: Date.now() });

    // Update stats
    const stats = bufferStats.get(roomId) || { size: 0, count: 0 };
    stats.size += messageSize;
    stats.count += 1;
    bufferStats.set(roomId, stats);
    totalBufferSize += messageSize;

    return true;
  }
}

/**
 * Send buffer to client and clear it
 */
async function flushBuffer(roomId, ws) {
  if (redisClient) {
    // Redis mode
    try {
      const key = `buffer:${roomId}`;
      const messages = await redisClient.lRange(key, 0, -1);

      if (!messages || messages.length === 0) return 0;

      let sent = 0;
      for (const msgStr of messages) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            const msg = JSON.parse(msgStr);
            const data = Buffer.from(msg.data, 'base64');
            ws.send(data);
            sent++;
          } catch (e) {
            console.error(`[Buffer/Redis] Error parsing message:`, e.message);
          }
        }
      }

      // Clear the buffer after sending
      await redisClient.del(key);
      return sent;
    } catch (err) {
      console.error(`[Buffer/Redis] Error flushing buffer:`, err.message);
      return 0;
    }
  } else {
    // Memory mode
    const buffer = buffers.get(roomId);
    if (!buffer || buffer.length === 0) return 0;

    let sent = 0;
    for (const msg of buffer) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg.data);
        sent++;
      }
    }

    // Clear buffer and stats
    const stats = bufferStats.get(roomId);
    if (stats) {
      totalBufferSize -= stats.size;
    }
    buffers.delete(roomId);
    bufferStats.delete(roomId);

    return sent;
  }
}

/**
 * Check if buffer exists for a room
 */
async function hasBuffer(roomId) {
  if (redisClient) {
    try {
      const len = await redisClient.lLen(`buffer:${roomId}`);
      return len > 0;
    } catch {
      return false;
    }
  } else {
    return buffers.has(roomId) && buffers.get(roomId).length > 0;
  }
}

/**
 * Cleanup old messages from buffers (memory mode only, Redis uses TTL)
 */
async function cleanupBuffers() {
  if (redisClient) {
    // Redis handles TTL automatically
    console.log(`[Cleanup/Redis] Redis handles TTL automatically`);
    return;
  }

  const now = Date.now();
  let cleanedRooms = 0;
  let cleanedMessages = 0;

  for (const [roomId, messages] of buffers.entries()) {
    const before = messages.length;
    const filtered = messages.filter(m =>
      now - m.timestamp < BUFFER_LIMITS.MAX_MESSAGE_AGE_MS
    );

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
      // Recalculate stats
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

// Run cleanup every hour
setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// WEBSOCKET RELAY SERVER WITH ASYNC BUFFER
// ============================================================================

function setupWebSocketRelay(wss) {
  wss.on('connection', (ws, req) => {
    const clientIP = getClientIP(req);

    // ========== CONNECTION LIMIT PER IP ==========
    const currentConnections = connectionsPerIP.get(clientIP) || 0;
    if (currentConnections >= LIMITS.MAX_CONNECTIONS_PER_IP) {
      console.log(`[WS] Rejected connection from ${clientIP}: too many connections`);
      ws.close(1008, 'Too many connections');
      return;
    }
    connectionsPerIP.set(clientIP, currentConnections + 1);

    // ========== ROOM LIMIT ==========
    if (rooms.size >= LIMITS.MAX_ROOMS) {
      console.log(`[WS] Rejected connection: too many rooms`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Server at capacity');
      return;
    }

    // ========== PARSE URL ==========
    const url = new URL(req.url, 'http://localhost');
    const asyncEnabled = url.searchParams.get('async') === '1';
    const token = url.searchParams.get('token');

    // Extract room ID from path
    let urlPath = url.pathname.slice(1) || 'default';

    // Support /ws/ prefix for flexibility (legacy)
    if (urlPath.startsWith('ws/')) {
      urlPath = urlPath.slice(3);
    }

    const segments = urlPath.split('/').filter(Boolean);
    const roomId = segments.length > 0 ? segments[segments.length - 1] : 'default';

    // ========== ROOM ID VALIDATION ==========
    if (!isValidRoomId(roomId)) {
      console.log(`[WS] Rejected connection: invalid room ID "${roomId.slice(0, 32)}..."`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Invalid room ID');
      return;
    }

    // ========== TOKEN VALIDATION ==========
    if (roomTokens.has(roomId)) {
      // Room has a token, client must provide matching token
      if (roomTokens.get(roomId) !== token) {
        console.log(`[WS] Rejected connection to room "${roomId.slice(0, 8)}...": invalid token`);
        connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
        ws.close(1008, 'Invalid token');
        return;
      }
    } else if (token) {
      // First client with token sets the room token
      roomTokens.set(roomId, token);
    }

    // ========== SETUP ROOM ==========
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const room = rooms.get(roomId);

    // ========== ROOM SIZE LIMIT ==========
    if (room.size >= LIMITS.MAX_CLIENTS_PER_ROOM) {
      console.log(`[WS] Rejected connection to room "${roomId.slice(0, 8)}...": room full`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Room full');
      return;
    }

    // Track async mode for this room
    if (asyncEnabled) {
      asyncRooms.add(roomId);
    }

    // Add client to room
    room.add(ws);

    // ========== SEND BUFFERED MESSAGES ==========
    // Delay buffer flush to let client fully initialize:
    // - Encryption key setup
    // - y-websocket handlers
    // - Navigation from JoinPage to InvestigationPage
    // - Y.Doc observers configuration
    // Without sufficient delay, messages may arrive before the client is ready to process them
    if (asyncRooms.has(roomId)) {
      setTimeout(async () => {
        // Check if client is still connected before flushing
        if (ws.readyState !== WebSocket.OPEN) return;

        if (await hasBuffer(roomId)) {
          const sent = await flushBuffer(roomId, ws);
          if (sent > 0) {
            console.log(`[Buffer] Sent ${sent} buffered messages to new client in room "${roomId.slice(0, 8)}..."`);
          }
        }
      }, 1500); // 1500ms delay for full client initialization (navigation + observers)
    }

    // Create rate limiter for this client
    const rateLimiter = createRateLimiter();

    const roomIdShort = roomId.slice(0, 8) + '...';
    console.log(`[WS] Client from ${clientIP} joined room "${roomIdShort}" (${room.size} client${room.size > 1 ? 's' : ''}${asyncRooms.has(roomId) ? ', async' : ''})`);

    // ========== MESSAGE HANDLING ==========
    ws.on('message', (data) => {
      // Size limit
      if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
        console.log(`[WS] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
        ws.close(1009, 'Message too large');
        return;
      }

      // Rate limiting
      if (!rateLimiter.check()) {
        console.log(`[WS] Rate limited client ${clientIP} in room "${roomIdShort}"`);
        return;
      }

      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;

      // Relay to other clients
      let relayed = 0;
      currentRoom.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
          relayed++;
        }
      });

      // Buffer messages only when alone in async mode
      // This avoids storing intermediate states during real-time collaboration
      // which can cause sync conflicts when replayed
      if (relayed === 0 && asyncRooms.has(roomId)) {
        addToBuffer(roomId, data).catch(err => {
          console.error(`[Buffer] Error adding message:`, err.message);
        });
      }
    });

    // ========== DISCONNECT HANDLING ==========
    ws.on('close', () => {
      // Decrement IP connection count
      const count = connectionsPerIP.get(clientIP) || 1;
      if (count <= 1) {
        connectionsPerIP.delete(clientIP);
      } else {
        connectionsPerIP.set(clientIP, count - 1);
      }

      const currentRoom = rooms.get(roomId);
      if (currentRoom) {
        currentRoom.delete(ws);
        console.log(`[WS] Client from ${clientIP} left room "${roomIdShort}" (${currentRoom.size} remaining)`);

        // Clean up empty rooms (but keep buffer and token for async)
        if (currentRoom.size === 0) {
          rooms.delete(roomId);
          // Don't delete asyncRooms, roomTokens, or buffers - they persist for async
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error in room "${roomIdShort}" from ${clientIP}:`, err.message);
    });
  });
}

// ============================================================================
// COMBINED SERVER
// ============================================================================

// Create HTTP server
const server = createServer((req, res) => {
  // CORS headers for flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint (minimal info - no stats exposed)
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Serve static files
  serveStatic(req, res);
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({
  server,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
  perMessageDeflate: false, // Disable compression for binary data reliability
});
setupWebSocketRelay(wss);

// Start server
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                   zeroneurone v2                           ║');
  console.log('║            Cognitive amplification tool                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running at http://${HOST}:${PORT}`.padEnd(63) + '║');
  console.log('║                                                            ║');
  console.log('║  • Web app:      /                                         ║');
  console.log('║  • WebSocket:    ws://host:port/<roomId>                   ║');
  console.log('║  • Health:       /health                                   ║');
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');

  // Close all WebSocket connections
  rooms.forEach((room, roomId) => {
    room.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
  });
  rooms.clear();
  connectionsPerIP.clear();
  buffers.clear();
  bufferStats.clear();
  asyncRooms.clear();
  roomTokens.clear();

  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.log('[Server] Forcing exit...');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received');
  process.emit('SIGTERM');
});
