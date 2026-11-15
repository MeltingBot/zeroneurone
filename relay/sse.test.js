/**
 * The HTTP fallback (relay/sse.js): a stream client meets WebSocket clients
 * in the same rooms, with the same rules, on both servers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { framesOf } from './sse.js';
import { SERVERS, startRelay, joinWs, joinSse, refusalOf, texts, wait, categorized, targeted, signedRoom } from './harness.js';

describe('framesOf', () => {
  const frame = (s) => { const b = Buffer.alloc(4); b.writeUInt32BE(s.length); return Buffer.concat([b, Buffer.from(s)]); };
  it('reads messages in order and refuses a truncated body', () => {
    expect(framesOf(Buffer.concat([frame('one'), frame('two')])).map(String)).toEqual(['one', 'two']);
    expect(framesOf(Buffer.alloc(0))).toEqual([]);
    expect(framesOf(frame('one').subarray(0, 5))).toBeNull();
    expect(framesOf(Buffer.from([0, 0, 0, 0]))).toBeNull();
  });
});

describe.each(SERVERS)('HTTP fallback through %s', (script) => {
  let relay;
  beforeAll(async () => { relay = await startRelay(script); }, 15_000);
  afterAll(() => relay?.stop());

  it('is announced by /health', () => {
    expect(relay.health.headers.get('x-relay-features')).toContain('sse');
  });

  it('relays both ways between a stream client and a WebSocket client, in order', async () => {
    const s = await joinSse(relay.http, 'room-mixed?client=sseAAAAA');
    const w = await joinWs(relay.ws, 'room-mixed?client=wsBBBBBB');
    expect(s.sessionId).toBeTruthy();
    await wait(100);
    expect((await s.send('one', 'two')).status).toBe(204);
    expect((await s.send('three')).status).toBe(204);
    w.send(Buffer.from('from-ws'));
    await wait(200);
    expect(texts(w)).toEqual(['one', 'two', 'three']);
    expect(texts(s)).toEqual(['from-ws']);
    s.close();
    w.close();
  });

  it('delivers a message for one client to a stream client', async () => {
    const w = await joinWs(relay.ws, 'room-sse-target?client=desktop1');
    const phone = await joinSse(relay.http, 'room-sse-target?client=phone001');
    const other = await joinSse(relay.http, 'room-sse-target?client=other001');
    await wait(100);
    w.send(targeted('phone001', 'photo'));
    await wait(200);
    expect(texts(phone)).toEqual(['photo']);
    expect(texts(other)).toEqual([]);
    for (const c of [w, phone, other]) c.close();
  });

  it('tells a refusal on the stream, with the code and reason of a WebSocket close', async () => {
    const first = await joinWs(relay.ws, 'room-sse-token?token=secret-a');
    const intruder = await joinSse(relay.http, 'room-sse-token?token=secret-b');
    expect(intruder.sessionId).toBeNull();
    expect(intruder.closed).toEqual({ code: 1008, reason: 'Invalid token' });
    const { room } = signedRoom();
    const wrongKey = await joinSse(relay.http, `${room}?${signedRoom().reader}`);
    expect(wrongKey.closed).toEqual({ code: 1008, reason: 'Write proof refused' });
    first.close();
  });

  it('passes a stream reader\'s presence, never its changes', async () => {
    const { room, reader, writer } = signedRoom();
    const w = await joinWs(relay.ws, `${room}?client=writer01&${writer()}`);
    const r = await joinSse(relay.http, `${room}?client=reader01&${reader}`);
    await wait(100);
    await r.send(categorized(3, 'reader-change'), categorized(1, 'reader-presence'));
    await wait(200);
    expect(texts(w).map((t) => t.slice(5))).toEqual(['reader-presence']);
    w.close();
    r.close();
  });

  it('answers 410 to a session that is gone or unknown', async () => {
    const s = await joinSse(relay.http, 'room-gone?client=goneAAAA');
    s.close();
    await wait(200);
    expect((await s.send('late')).status).toBe(410);
    s.sessionId = 'unknown-session';
    expect((await s.send('forged')).status).toBe(410);
  });

  it('replays the async buffer to a stream client', async () => {
    const a = await joinWs(relay.ws, 'room-sse-async?async=1&client=asyncAAA');
    await wait(100);
    a.send(Buffer.from('while-alone'));
    await wait(200);
    a.close();
    await wait(100);
    const s = await joinSse(relay.http, 'room-sse-async?async=1&client=asyncSSE');
    await wait(1900);
    expect(texts(s)).toContain('while-alone');
    s.close();
  }, 10_000);
});

describe.each(SERVERS)('WebSocket refused through %s (tests only)', (script) => {
  let relay;
  beforeAll(async () => { relay = await startRelay(script, { RELAY_TEST_REFUSE_WS: '1' }); }, 15_000);
  afterAll(() => relay?.stop());

  it('refuses the WebSocket handshake; the HTTP fallback still works', async () => {
    const w = await joinWs(relay.ws, 'room-blocked');
    expect(await refusalOf(w)).not.toBeNull();
    const s = await joinSse(relay.http, 'room-blocked?client=sseAAAAA');
    expect(s.sessionId).toBeTruthy();
    s.close();
  });
});
