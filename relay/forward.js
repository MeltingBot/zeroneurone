/**
 * Sending a message on to a client of the room, with backpressure.
 *
 * A client that reads slower than the room writes (a phone on a weak
 * network, a large dossier being joined) piles up data on the relay. The
 * relay used to drop further messages to it past a threshold: Yjs never asks
 * for a lost update again, so the client stayed without it until it happened
 * to reconnect (a phone joining a dossier with 90 MB of photos got a third of
 * them, e2e/companion-scale.bench). Past the threshold the client is now
 * disconnected instead: it reconnects on its own, and the Yjs exchange at
 * connection sends it everything it misses.
 *
 * Used by relay/index.js and server/index.js.
 */

/** Close code for a client too far behind (it reconnects) */
export const SLOW_CLIENT_CLOSE = 4008;

/**
 * Sends `data` to `client`, or disconnects it when more than `limit` bytes
 * already wait for it. Returns whether it was sent.
 */
export function forward(client, data, limit, log = console.log) {
  if (client.bufferedAmount > limit) {
    if (!client.slowClosing) {
      client.slowClosing = true;
      log(`[WS] Client ${Math.round(client.bufferedAmount / 1024 / 1024)} MB behind: disconnected to resync`);
      client.close(SLOW_CLIENT_CLOSE, 'Too far behind, reconnect');
    }
    return false;
  }
  client.send(data);
  return true;
}
