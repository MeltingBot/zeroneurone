/**
 * Simple WebSocket relay server for E2E encrypted Yjs collaboration
 *
 * Unlike y-websocket-server, this server doesn't decode messages.
 * It just relays binary data between clients in the same room.
 *
 * Usage: node relay-server.js [port]
 * Default port: 4444
 */

import { WebSocketServer, WebSocket } from 'ws';

const port = process.argv[2] || 4444;
const wss = new WebSocketServer({ port });

// Map of roomId -> Set<WebSocket>
const rooms = new Map();

wss.on('connection', (ws, req) => {
  // Extract room from URL path: /roomId
  const roomId = req.url?.slice(1) || 'default';

  // Add client to room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId);
  room.add(ws);

  console.log(`[+] Client joined room "${roomId}" (${room.size} client${room.size > 1 ? 's' : ''})`);

  // Relay messages to all other clients in same room
  ws.on('message', (data) => {
    const room = rooms.get(roomId);
    if (!room) return;

    let relayed = 0;
    room.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
        relayed++;
      }
    });

    // Uncomment for verbose logging:
    // console.log(`[${roomId}] Relayed ${data.length} bytes to ${relayed} client(s)`);
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (room) {
      room.delete(ws);
      console.log(`[-] Client left room "${roomId}" (${room.size} client${room.size !== 1 ? 's' : ''} remaining)`);

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] WebSocket error in room "${roomId}":`, err.message);
  });
});

console.log(`Relay server running on ws://localhost:${port}`);
console.log('Rooms are created from URL path: ws://localhost:' + port + '/<roomId>');
