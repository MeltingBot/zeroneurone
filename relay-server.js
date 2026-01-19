/**
 * Simple WebSocket relay server for E2E encrypted Yjs collaboration
 *
 * Unlike y-websocket-server, this server doesn't decode messages.
 * It just relays binary data between clients in the same room.
 *
 * Usage: node relay-server.js [port]
 * Default port: 4444
 *
 * Includes DoS protection:
 * - Message size limits
 * - Rate limiting per client
 * - Connection limits per IP
 * - Room size limits
 */

import { WebSocketServer, WebSocket } from 'ws';

const port = process.argv[2] || 4444;

// ============================================================================
// SECURITY LIMITS (DoS Protection)
// ============================================================================
const LIMITS = {
  // Message limits
  MAX_MESSAGE_SIZE: 5 * 1024 * 1024,    // 5 MB max per message

  // Rate limiting
  RATE_WINDOW_MS: 1000,                  // 1 second window
  MAX_MESSAGES_PER_WINDOW: 100,          // Max messages per window per client

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

const wss = new WebSocketServer({
  port,
  maxPayload: LIMITS.MAX_MESSAGE_SIZE,
});

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

wss.on('connection', (ws, req) => {
  const clientIP = getClientIP(req);

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

  // Extract room from URL path: /roomId
  let roomId = req.url?.slice(1) || 'default';
  roomId = roomId.split('?')[0] || 'default';

  // ========== ROOM ID VALIDATION ==========
  if (!isValidRoomId(roomId)) {
    console.log(`[!] Rejected connection: invalid room ID "${roomId.slice(0, 32)}..."`);
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
    console.log(`[!] Rejected connection to room "${roomId}": room full`);
    connectionsPerIP.set(clientIP, connectionsPerIP.get(clientIP) - 1);
    ws.close(1008, 'Room full');
    return;
  }

  room.add(ws);

  // Create rate limiter for this client
  const rateLimiter = createRateLimiter();

  console.log(`[+] Client from ${clientIP} joined room "${roomId}" (${room.size} client${room.size > 1 ? 's' : ''})`);

  // Relay messages to all other clients in same room
  ws.on('message', (data) => {
    // ========== MESSAGE SIZE LIMIT ==========
    if (data.length > LIMITS.MAX_MESSAGE_SIZE) {
      console.log(`[!] Dropped oversized message from ${clientIP}: ${data.length} bytes`);
      ws.close(1009, 'Message too large');
      return;
    }

    // ========== RATE LIMITING ==========
    if (!rateLimiter.check()) {
      console.log(`[!] Rate limited client ${clientIP} in room "${roomId}"`);
      // Don't close connection, just drop the message
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

    // Uncomment for verbose logging:
    // console.log(`[${roomId}] Relayed ${data.length} bytes to ${relayed} client(s)`);
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
      console.log(`[-] Client from ${clientIP} left room "${roomId}" (${currentRoom.size} client${currentRoom.size !== 1 ? 's' : ''} remaining)`);

      // Clean up empty rooms
      if (currentRoom.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] WebSocket error in room "${roomId}" from ${clientIP}:`, err.message);
  });
});

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║             zeroneurone relay server                       ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║  Running on ws://localhost:${port}`.padEnd(63) + '║');
console.log('║  Rooms from URL: ws://localhost:' + port + '/<roomId>'.padEnd(30) + '║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  Security limits:                                          ║');
console.log(`║  • Max message:  ${(LIMITS.MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(0)} MB`.padEnd(63) + '║');
console.log(`║  • Rate limit:   ${LIMITS.MAX_MESSAGES_PER_WINDOW}/sec`.padEnd(63) + '║');
console.log(`║  • Max conn/IP:  ${LIMITS.MAX_CONNECTIONS_PER_IP}`.padEnd(63) + '║');
console.log(`║  • Max room:     ${LIMITS.MAX_CLIENTS_PER_ROOM} clients`.padEnd(63) + '║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
