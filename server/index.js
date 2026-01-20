/**
 * Production server for zeroneurone
 *
 * Combines:
 * - Static file serving for the React app
 * - WebSocket relay for E2E encrypted Yjs collaboration
 *
 * Single port deployment - all traffic through one endpoint.
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - HOST: Server host (default: 0.0.0.0)
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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
  MAX_MESSAGE_SIZE: 16 * 1024 * 1024,    // 16 MB max per message (for large media)

  // Rate limiting (relaxed for media sync)
  RATE_WINDOW_MS: 1000,                  // 1 second window
  MAX_MESSAGES_PER_WINDOW: 500,          // Max messages per window per client

  // Connection limits
  MAX_CONNECTIONS_PER_IP: 10,            // Max concurrent connections per IP
  MAX_CLIENTS_PER_ROOM: 50,              // Max clients in a room
  MAX_ROOMS: 1000,                       // Max concurrent rooms

  // Room ID validation
  MAX_ROOM_ID_LENGTH: 128,               // Max room ID length
  ROOM_ID_PATTERN: /^[a-zA-Z0-9_-]+$/,   // Allowed characters
};

// Track connections per IP
const connectionsPerIP = new Map();

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
// WEBSOCKET RELAY SERVER WITH DoS PROTECTION
// ============================================================================

// Map of roomId -> Set<WebSocket>
const rooms = new Map();

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
        // New window
        messageCount = 1;
        windowStart = now;
        return true;
      }

      messageCount++;
      return messageCount <= LIMITS.MAX_MESSAGES_PER_WINDOW;
    }
  };
}

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

    // Extract room from URL path: /roomId or /ws/roomId
    let roomId = req.url?.slice(1) || 'default';

    // Support /ws/ prefix for flexibility
    if (roomId.startsWith('ws/')) {
      roomId = roomId.slice(3);
    }

    // Sanitize room ID
    roomId = roomId.split('?')[0] || 'default';

    // ========== ROOM ID VALIDATION ==========
    if (!isValidRoomId(roomId)) {
      console.log(`[WS] Rejected connection: invalid room ID "${roomId.slice(0, 32)}..."`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Invalid room ID');
      return;
    }

    // Add client to room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const room = rooms.get(roomId);

    // ========== ROOM SIZE LIMIT ==========
    if (room.size >= LIMITS.MAX_CLIENTS_PER_ROOM) {
      console.log(`[WS] Rejected connection to room "${roomId}": room full`);
      connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
      ws.close(1008, 'Room full');
      return;
    }

    room.add(ws);

    // Create rate limiter for this client
    const rateLimiter = createRateLimiter();

    console.log(`[WS] Client from ${clientIP} joined room "${roomId}" (${room.size} client${room.size > 1 ? 's' : ''})`);

    // Relay messages to all other clients in same room
    ws.on('message', (data) => {
      // ========== MESSAGE SIZE LIMIT ==========
      if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
        console.log(`[WS] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
        ws.close(1009, 'Message too large');
        return;
      }

      // ========== RATE LIMITING ==========
      if (!rateLimiter.check()) {
        console.log(`[WS] Rate limited client ${clientIP} in room "${roomId}"`);
        // Don't close connection, just drop the message
        return;
      }

      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;

      currentRoom.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

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
        console.log(`[WS] Client from ${clientIP} left room "${roomId}" (${currentRoom.size} remaining)`);

        // Clean up empty rooms
        if (currentRoom.size === 0) {
          rooms.delete(roomId);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error in room "${roomId}" from ${clientIP}:`, err.message);
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

  // Health check endpoint
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      rooms: rooms.size,
      clients: Array.from(rooms.values()).reduce((sum, room) => sum + room.size, 0),
    }));
    return;
  }

  // Serve static files
  serveStatic(req, res);
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({
  server,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
});
setupWebSocketRelay(wss);

// Start server
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                     zeroneurone                            ║');
  console.log('║            Cognitive amplification tool                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running at http://${HOST}:${PORT}`.padEnd(63) + '║');
  console.log('║                                                            ║');
  console.log('║  • Web app:      /                                         ║');
  console.log('║  • WebSocket:    ws://host:port/<roomId>                   ║');
  console.log('║  • Health:       /health                                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Security limits:                                          ║');
  console.log(`║  • Max message:  ${(LIMITS.MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(0)} MB`.padEnd(63) + '║');
  console.log(`║  • Rate limit:   ${LIMITS.MAX_MESSAGES_PER_WINDOW}/sec`.padEnd(63) + '║');
  console.log(`║  • Max conn/IP:  ${LIMITS.MAX_CONNECTIONS_PER_IP}`.padEnd(63) + '║');
  console.log(`║  • Max room:     ${LIMITS.MAX_CLIENTS_PER_ROOM} clients`.padEnd(63) + '║');
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
