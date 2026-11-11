/**
 * Async buffer of the relay: what a client sends while alone in an async
 * room, kept for the clients that come later.
 *
 * Every buffered message gets a sequence number and the tag of the client
 * that sent it. For each client the buffer remembers the last number it
 * handed over. A client that connects, alone or not, receives every message
 * it has not received yet, except its own; messages stay until they age out
 * or the room's quota is reached. A full room makes room by dropping its
 * oldest messages already handed to a client other than their sender; a
 * message nobody received yet is never dropped for a newer one.
 *
 * Before, the buffer was replayed only when a second client joined someone
 * already there, and then deleted: a computer coming back alone got nothing,
 * and a phone reconnecting alone after a network drop received its own
 * messages, which deleted them before anyone else could.
 *
 * Client tags come from the client (`client` URL parameter): an opaque value
 * the app derives per room, so the relay cannot link one device's rooms. A
 * client without one gets a tag for its connection only (older apps): it then
 * receives the whole buffer each time, its own messages included, which
 * Yjs applies without effect.
 *
 * Used by relay/index.js (relay image) and server/index.js (combined image).
 */

/**
 * @typedef {{ seq: number, sender: string, ts: number, data: Buffer }} Entry
 * @typedef {{ entries: Entry[], nextSeq: number, size: number, cursors: Map<string, number>, warned: boolean }} MemoryRoom
 * @typedef {{
 *   MAX_BUFFER_SIZE_PER_ROOM: number,
 *   MAX_MESSAGES_PER_ROOM: number,
 *   MAX_MESSAGE_AGE_MS: number,
 *   MAX_ROOMS_WITH_BUFFER: number,
 *   MAX_TOTAL_BUFFER_SIZE: number,
 * }} BufferLimits
 */

const TAG_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** The client's tag from its URL, or one for this connection only */
export function clientTagOf(searchParams, randomTag) {
  const tag = searchParams.get('client');
  return tag && TAG_PATTERN.test(tag) ? tag : `conn-${randomTag()}`;
}

/**
 * @param {{ limits: BufferLimits, redis?: any, log?: (msg: string) => void }} options
 */
export function createAsyncBuffer({ limits, redis = null, log = console.log }) {
  /** @type {Map<string, MemoryRoom>} */
  const memory = new Map();
  let totalSize = 0;

  const short = (roomId) => `${roomId.slice(0, 8)}...`;
  const ttlSeconds = () => Math.max(1, Math.floor(limits.MAX_MESSAGE_AGE_MS / 1000));
  const keys = (roomId) => ({
    log: `zbuf:${roomId}`,
    seq: `zbuf:${roomId}:seq`,
    cursors: `zbuf:${roomId}:cur`,
    legacy: `buffer:${roomId}`,
  });

  // --------------------------------------------------------------------------
  // Memory
  // --------------------------------------------------------------------------

  function memoryRoom(roomId) {
    let room = memory.get(roomId);
    if (!room) {
      room = { entries: [], nextSeq: 1, size: 0, cursors: new Map(), warned: false };
      memory.set(roomId, room);
    }
    return room;
  }

  function canAddMemory(roomId, size) {
    const room = memory.get(roomId);
    if (!room && memory.size >= limits.MAX_ROOMS_WITH_BUFFER) return false;
    if (room && room.size + size > limits.MAX_BUFFER_SIZE_PER_ROOM) return false;
    if (room && room.entries.length >= limits.MAX_MESSAGES_PER_ROOM) return false;
    return totalSize + size <= limits.MAX_TOTAL_BUFFER_SIZE;
  }

  /** Frees room for `size` bytes with messages already delivered to someone else */
  function evictDelivered(roomId, size) {
    const room = memory.get(roomId);
    if (!room) return;
    const delivered = (entry) => {
      for (const [client, seq] of room.cursors) {
        if (client !== entry.sender && seq >= entry.seq) return true;
      }
      return false;
    };
    const fits = () => room.size + size <= limits.MAX_BUFFER_SIZE_PER_ROOM
      && room.entries.length < limits.MAX_MESSAGES_PER_ROOM
      && totalSize + size <= limits.MAX_TOTAL_BUFFER_SIZE;
    const kept = [];
    for (const entry of room.entries) {
      if (!fits() && delivered(entry)) {
        room.size -= entry.data.length;
        totalSize -= entry.data.length;
        continue;
      }
      kept.push(entry);
    }
    room.entries = kept;
  }

  function dropMemoryRoom(roomId) {
    const room = memory.get(roomId);
    if (!room) return;
    totalSize -= room.size;
    memory.delete(roomId);
  }

  // --------------------------------------------------------------------------
  // API
  // --------------------------------------------------------------------------

  /** Buffers a message `sender` sent while alone. Returns false when refused (quota). */
  async function add(roomId, sender, data) {
    if (redis) {
      const k = keys(roomId);
      try {
        const seq = await redis.incr(k.seq);
        const entry = JSON.stringify({ q: seq, s: sender, t: Date.now(), d: Buffer.from(data).toString('base64') });
        await redis.rPush(k.log, entry);
        const ttl = ttlSeconds();
        await Promise.all([redis.expire(k.log, ttl), redis.expire(k.seq, ttl), redis.expire(k.cursors, ttl)]);
        const length = await redis.lLen(k.log);
        if (length > limits.MAX_MESSAGES_PER_ROOM) {
          await redis.lTrim(k.log, -limits.MAX_MESSAGES_PER_ROOM, -1);
          log(`[Buffer/Redis] Trimmed room "${short(roomId)}" to ${limits.MAX_MESSAGES_PER_ROOM} messages`);
        }
        return true;
      } catch (err) {
        log(`[Buffer/Redis] Error adding to buffer: ${err.message}`);
        return false;
      }
    }

    const size = data.length;
    if (!canAddMemory(roomId, size)) evictDelivered(roomId, size);
    if (!canAddMemory(roomId, size)) {
      const room = memory.get(roomId);
      if (room && !room.warned) {
        log(`[Buffer] Quota exceeded for room "${short(roomId)}" (${(room.size / 1024 / 1024).toFixed(1)} MB, ${room.entries.length} msgs) — further drops silenced`);
        room.warned = true;
      }
      return false;
    }
    const room = memoryRoom(roomId);
    room.entries.push({ seq: room.nextSeq++, sender, ts: Date.now(), data });
    room.size += size;
    totalSize += size;
    return true;
  }

  /**
   * Hands `client` what it has not received yet, its own messages left out.
   * `send(data)` returns false when the socket can no longer take it: the
   * rest is then kept for its next connection. Returns the number sent.
   */
  async function replay(roomId, client, send) {
    if (redis) {
      const k = keys(roomId);
      try {
        let sent = 0;
        // Entries of the former format (raw data, no sender): handed once, then gone
        const legacy = await redis.lRange(k.legacy, 0, -1);
        if (legacy && legacy.length > 0) {
          for (const raw of legacy) {
            if (!send(Buffer.isBuffer(raw) ? raw : Buffer.from(raw))) return sent;
            sent++;
          }
          await redis.del(k.legacy);
        }
        const cursor = Number((await redis.hGet(k.cursors, client)) ?? 0);
        const entries = await redis.lRange(k.log, 0, -1);
        let last = cursor;
        for (const text of entries ?? []) {
          let entry;
          try { entry = JSON.parse(text); } catch { continue; }
          if (entry.q <= cursor) continue;
          if (entry.s !== client) {
            if (!send(Buffer.from(entry.d, 'base64'))) break;
            sent++;
          }
          last = entry.q;
        }
        if (last > cursor) {
          await redis.hSet(k.cursors, client, String(last));
          await redis.expire(k.cursors, ttlSeconds());
        }
        return sent;
      } catch (err) {
        log(`[Buffer/Redis] Error replaying buffer: ${err.message}`);
        return 0;
      }
    }

    const room = memory.get(roomId);
    if (!room) return 0;
    const cursor = room.cursors.get(client) ?? 0;
    let last = cursor;
    let sent = 0;
    for (const entry of room.entries) {
      if (entry.seq <= cursor) continue;
      if (entry.sender !== client) {
        if (!send(entry.data)) break;
        sent++;
      }
      last = entry.seq;
    }
    if (last > cursor) room.cursors.set(client, last);
    return sent;
  }

  /** Whether the room has buffered messages in memory (orphan cleanup) */
  function holds(roomId) {
    return (memory.get(roomId)?.entries.length ?? 0) > 0;
  }

  /**
   * Drops messages older than the age limit (memory; Redis keys expire on
   * their own). Returns the rooms left without any message, and the count of
   * messages dropped.
   */
  function cleanup(now = Date.now()) {
    const emptied = [];
    let dropped = 0;
    for (const [roomId, room] of memory) {
      const kept = room.entries.filter((e) => now - e.ts < limits.MAX_MESSAGE_AGE_MS);
      if (kept.length === room.entries.length) continue;
      dropped += room.entries.length - kept.length;
      if (kept.length === 0) {
        dropMemoryRoom(roomId);
        emptied.push(roomId);
        continue;
      }
      const keptSize = kept.reduce((sum, e) => sum + e.data.length, 0);
      totalSize -= room.size - keptSize;
      room.size = keptSize;
      room.entries = kept;
      room.warned = false;
    }
    return { emptied, dropped };
  }

  function stats() {
    let messages = 0;
    for (const room of memory.values()) messages += room.entries.length;
    return { rooms: memory.size, totalSizeMB: +(totalSize / 1024 / 1024).toFixed(2), totalMessages: messages };
  }

  function clear() {
    memory.clear();
    totalSize = 0;
  }

  return { add, replay, holds, cleanup, stats, clear };
}
