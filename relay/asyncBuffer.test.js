import { describe, it, expect } from 'vitest';
import { createAsyncBuffer, clientTagOf } from './asyncBuffer.js';

const LIMITS = {
  MAX_BUFFER_SIZE_PER_ROOM: 1000,
  MAX_MESSAGES_PER_ROOM: 100,
  MAX_MESSAGE_AGE_MS: 60_000,
  MAX_ROOMS_WITH_BUFFER: 10,
  MAX_TOTAL_BUFFER_SIZE: 10_000,
};

const msg = (text) => Buffer.from(text);

/** Replays and returns what `client` received, as strings */
async function received(buffer, client, room = 'room1') {
  const got = [];
  await buffer.replay(room, client, (data) => { got.push(data.toString()); return true; });
  return got;
}

/** The commands the buffer uses, over plain maps */
function fakeRedis() {
  const lists = new Map();
  const hashes = new Map();
  const counters = new Map();
  return {
    async incr(k) { const v = (counters.get(k) ?? 0) + 1; counters.set(k, v); return v; },
    async rPush(k, v) { if (!lists.has(k)) lists.set(k, []); lists.get(k).push(String(v)); },
    async expire() {},
    async lLen(k) { return lists.get(k)?.length ?? 0; },
    async lTrim(k, start) { lists.set(k, lists.get(k).slice(start)); },
    async lRange(k) { return [...(lists.get(k) ?? [])]; },
    async hGet(k, f) { return hashes.get(k)?.get(f) ?? null; },
    async hSet(k, f, v) { if (!hashes.has(k)) hashes.set(k, new Map()); hashes.get(k).set(f, v); },
    async del(k) { lists.delete(k); },
    lists,
  };
}

for (const mode of ['memory', 'redis']) {
  describe(`asyncBuffer (${mode})`, () => {
    const make = () => createAsyncBuffer({ limits: LIMITS, redis: mode === 'redis' ? fakeRedis() : null, log: () => {} });

    it('hands a client coming back alone what was sent while it was away', async () => {
      const buffer = make();
      await buffer.add('room1', 'phone', msg('capture'));
      expect(await received(buffer, 'desktop')).toEqual(['capture']);
    });

    it('never sends a client its own messages, so its reconnection consumes nothing', async () => {
      const buffer = make();
      await buffer.add('room1', 'phone', msg('capture'));
      expect(await received(buffer, 'phone')).toEqual([]);
      // The phone's network dropped and came back: the desktop still gets it
      expect(await received(buffer, 'desktop')).toEqual(['capture']);
    });

    it('sends each message once per client, and keeps it for the others', async () => {
      const buffer = make();
      await buffer.add('room1', 'phone', msg('m1'));
      expect(await received(buffer, 'desktopA')).toEqual(['m1']);
      await buffer.add('room1', 'phone', msg('m2'));
      expect(await received(buffer, 'desktopA')).toEqual(['m2']);
      expect(await received(buffer, 'desktopB')).toEqual(['m1', 'm2']);
    });

    it('keeps what a closed socket could not take for the next connection', async () => {
      const buffer = make();
      await buffer.add('room1', 'phone', msg('m1'));
      await buffer.add('room1', 'phone', msg('m2'));
      let calls = 0;
      await buffer.replay('room1', 'desktop', () => (++calls === 1));
      expect(await received(buffer, 'desktop')).toEqual(['m2']);
    });

    it('keeps rooms apart', async () => {
      const buffer = make();
      await buffer.add('room1', 'phone', msg('one'));
      await buffer.add('room2', 'phone', msg('two'));
      expect(await received(buffer, 'desktop', 'room2')).toEqual(['two']);
    });
  });
}

describe('asyncBuffer (memory limits)', () => {
  it('refuses messages over the room quota', async () => {
    const buffer = createAsyncBuffer({ limits: { ...LIMITS, MAX_BUFFER_SIZE_PER_ROOM: 10 }, log: () => {} });
    expect(await buffer.add('room1', 'a', msg('12345'))).toBe(true);
    expect(await buffer.add('room1', 'a', msg('123456'))).toBe(false);
    expect(buffer.stats().totalMessages).toBe(1);
  });

  it('makes room by dropping delivered messages, never undelivered ones', async () => {
    // Room for one 5-byte message at a time
    const buffer = createAsyncBuffer({ limits: { ...LIMITS, MAX_BUFFER_SIZE_PER_ROOM: 9 }, log: () => {} });
    await buffer.add('room1', 'phone', msg('aaaaa'));
    expect(await received(buffer, 'desktop')).toEqual(['aaaaa']);
    // Full, but the first message reached the desktop: it gives way
    expect(await buffer.add('room1', 'phone', msg('bbbbb'))).toBe(true);
    expect(await buffer.add('room1', 'phone', msg('ccccc'))).toBe(false);
    expect(await received(buffer, 'other')).toEqual(['bbbbb']);
  });

  it('drops messages past their age and reports emptied rooms', async () => {
    const buffer = createAsyncBuffer({ limits: LIMITS, log: () => {} });
    await buffer.add('room1', 'a', msg('old'));
    const { emptied, dropped } = buffer.cleanup(Date.now() + LIMITS.MAX_MESSAGE_AGE_MS + 1);
    expect(emptied).toEqual(['room1']);
    expect(dropped).toBe(1);
    expect(buffer.holds('room1')).toBe(false);
    expect(buffer.stats()).toEqual({ rooms: 0, totalSizeMB: 0, totalMessages: 0 });
  });
});

describe('asyncBuffer (redis, former format)', () => {
  it('hands the entries of the former raw format once, then drops them', async () => {
    const redis = fakeRedis();
    redis.lists.set('buffer:room1', ['legacy']);
    const buffer = createAsyncBuffer({ limits: LIMITS, redis, log: () => {} });
    expect(await received(buffer, 'desktop')).toEqual(['legacy']);
    expect(await received(buffer, 'other')).toEqual([]);
  });
});

describe('clientTagOf', () => {
  it('takes a well-formed tag, else makes one for the connection', () => {
    expect(clientTagOf(new URLSearchParams('client=Abc_def-1234'), () => 'x')).toBe('Abc_def-1234');
    expect(clientTagOf(new URLSearchParams('client=bad tag!'), () => 'rnd')).toBe('conn-rnd');
    expect(clientTagOf(new URLSearchParams(''), () => 'rnd')).toBe('conn-rnd');
  });
});
