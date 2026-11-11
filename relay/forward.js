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

// ----------------------------------------------------------------------------
// Messages for one client
// ----------------------------------------------------------------------------

/**
 * A message for one client of the room (an attachment sent to the phone that
 * asked for it): `ZNT` magic, the target's client tag, then the encrypted
 * payload. The relay delivers the payload to that client alone, never buffers
 * it, and drops it when the client is gone. The tag is the opaque per-room
 * one the client gives in its URL (`client=`): nothing new about it is
 * learned. Announced by /health (X-Relay-Features: targeted): a client never
 * sends one to a relay that does not announce it.
 */
export const RELAY_FEATURES = 'targeted';
const MAGIC = [0xff, 0x5a, 0x4e, 0x54];

/** The target tag and payload of a message for one client, or null */
export function targetOf(data) {
  if (data.length < MAGIC.length + 2) return null;
  for (let i = 0; i < MAGIC.length; i++) if (data[i] !== MAGIC[i]) return null;
  const length = data[MAGIC.length];
  const start = MAGIC.length + 1;
  if (length === 0 || data.length < start + length) return null;
  return {
    tag: Buffer.from(data.subarray(start, start + length)).toString('ascii'),
    payload: data.subarray(start + length),
  };
}

/** Delivers a message for one client to it alone. Returns whether it was sent. */
export function forwardToTarget(room, from, target, limit, open) {
  let sent = false;
  room.forEach((client) => {
    if (client !== from && client.clientTag === target.tag && client.readyState === open) {
      sent = forward(client, target.payload, limit) || sent;
    }
  });
  return sent;
}
