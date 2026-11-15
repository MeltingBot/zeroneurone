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
 * - TRUST_PROXY: Set to "1" to trust X-Forwarded-For (only behind a reverse
 *                proxy that sets it). Leave unset when exposed directly, or the
 *                per-IP connection limit can be bypassed at will.
 *
 * WebSocket URL parameters:
 * - async=1: Enable async buffering (messages stored when alone in room)
 * - token=xxx: Access token for room (HMAC-based, prevents random access)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
// Shared with the relay image (Dockerfile.combined copies it alongside)
import { createAsyncBuffer } from '../relay/asyncBuffer.js';
import { loadEnvFile, relayConfig } from '../relay/config.js';
import { RELAY_FEATURES } from '../relay/forward.js';
import { createRoomHub } from '../relay/room.js';
import { createSseRoutes } from '../relay/sse.js';

// Settings from the environment or a .env file (relay/config.js, every one
// listed in relay/.env.example); this server keeps its own defaults
loadEnvFile();
const { PORT, HOST, REDIS_URL, TRUST_PROXY, ALLOWED_ORIGIN, LIMITS, BUFFER_LIMITS, REFUSE_WEBSOCKET } = relayConfig({
  PORT: 3000,
  MAX_CONNECTIONS_PER_IP: 10,
  BUFFER_MAX_MSGS: 10_000,
  BUFFER_AGE_HOURS: 7 * 24,
});

// Optional Redis support
let redis = null;
let redisClient = null;

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

// TRUST_PROXY: "1" only when a reverse proxy in front of this server sets
// X-Forwarded-For. Off by default: see getClientIP.

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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
 * Get client IP from request — only trust X-Forwarded-For behind a known proxy.
 *
 * Without this gate the header is attacker-supplied: a fresh value on each
 * handshake defeats MAX_CONNECTIONS_PER_IP entirely, and connectionsPerIP grows
 * an unbounded number of keys. Mirrors getClientIP in relay-server.js.
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

// ============================================================================
// BUFFER STORAGE (Memory or Redis, see relay/asyncBuffer.js)
// ============================================================================

const asyncBuffer = createAsyncBuffer({ limits: BUFFER_LIMITS, redis: redisClient });

// Rooms shared by WebSocket and the HTTP fallback (relay/room.js, relay/sse.js)
const hub = createRoomHub({ LIMITS, BUFFER_LIMITS, asyncBuffer });
const sse = createSseRoutes({ hub, LIMITS, getClientIP });

/** Old buffered messages, orphaned rooms (memory mode only, Redis uses TTL) */
function cleanupBuffers() {
  if (redisClient) return;
  hub.cleanup();
}

// Run cleanup every hour
setInterval(cleanupBuffers, 60 * 60 * 1000);

// ============================================================================
// WEBSOCKET RELAY SERVER WITH ASYNC BUFFER
// ============================================================================

function setupWebSocketRelay(wss) {
  wss.on('connection', (ws, req) => {
    if (!hub.join(ws, new URL(req.url, 'http://localhost'), getClientIP(req), 'WS')) return;
    ws.on('message', (data) => hub.receive(ws, data));
    ws.on('close', () => hub.leave(ws));
    ws.on('error', (err) => {
      console.error(`[WS] Error in room "${ws.roomId.slice(0, 8)}..." from ${ws.clientIP}:`, err.message);
    });
  });
}

// ============================================================================
// COMBINED SERVER
// ============================================================================

// Create HTTP server
const server = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Relay-Features, X-Relay-Time');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint (minimal info - no stats exposed)
  if (req.url === '/health' || req.url === '/api/health') {
    res.setHeader('X-Relay-Features', RELAY_FEATURES);
    // Its clock: a writer signs with it, whatever the time on its device (access.js)
    res.setHeader('X-Relay-Time', String(Math.floor(Date.now() / 1000)));
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // HTTP fallback for networks that block WebSocket (relay/sse.js)
  if (sse.handle(req, res)) return;

  // Serve static files
  serveStatic(req, res);
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({
  server,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
  perMessageDeflate: false, // Disable compression for binary data reliability
  // Tests only: a network that blocks WebSocket, to exercise the fallback
  verifyClient: () => !REFUSE_WEBSOCKET,
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
  console.log(`║  • Buffer/room:  ${(BUFFER_LIMITS.MAX_BUFFER_SIZE_PER_ROOM / 1024 / 1024).toFixed(0)} MB, ${BUFFER_LIMITS.MAX_MESSAGES_PER_ROOM} msgs, ${Math.round(BUFFER_LIMITS.MAX_MESSAGE_AGE_MS / 3600000)} h`.padEnd(63) + '║');
  console.log(`║  • Storage:      ${redisClient ? 'Redis (persistent)' : 'Memory (ephemeral)'}`.padEnd(63) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');

  // Close every connection (HTTP fallback streams too)
  hub.closeAll(1001, 'Server shutting down');
  asyncBuffer.clear();

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
