/**
 * What a room does for its clients, through a real relay: both servers
 * (relay/index.js and server/index.js) share relay/room.js.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SERVERS, startRelay, joinWs, refusalOf, texts, wait, categorized, targeted, signedRoom } from './harness.js';

describe.each(SERVERS)('room through %s', (script) => {
  let relay;
  beforeAll(async () => { relay = await startRelay(script); }, 15_000);
  afterAll(() => relay?.stop());

  it('relays a message to the other clients of the room only', async () => {
    const a = await joinWs(relay.ws, 'room-broadcast?client=aaaaaaaa');
    const b = await joinWs(relay.ws, 'room-broadcast?client=bbbbbbbb');
    const elsewhere = await joinWs(relay.ws, 'room-other?client=cccccccc');
    await wait(100);
    a.send(Buffer.from('hello'));
    await wait(200);
    expect(texts(b)).toEqual(['hello']);
    expect(texts(a)).toEqual([]);
    expect(texts(elsewhere)).toEqual([]);
    for (const c of [a, b, elsewhere]) c.close();
  });

  it('delivers a message for one client to it alone', async () => {
    const a = await joinWs(relay.ws, 'room-target?client=desktop1');
    const phone = await joinWs(relay.ws, 'room-target?client=phone001');
    const other = await joinWs(relay.ws, 'room-target?client=other001');
    await wait(100);
    a.send(targeted('phone001', 'photo'));
    await wait(200);
    expect(texts(phone)).toEqual(['photo']);
    expect(texts(other)).toEqual([]);
    for (const c of [a, phone, other]) c.close();
  });

  it('refuses a client with another token than the room\'s', async () => {
    const first = await joinWs(relay.ws, 'room-token?token=secret-a');
    const intruder = await joinWs(relay.ws, 'room-token?token=secret-b');
    expect(await refusalOf(intruder)).toEqual({ code: 1008, reason: 'Invalid token' });
    first.close();
  });

  it('refuses an invalid room id', async () => {
    const c = await joinWs(relay.ws, 'bad%20room');
    expect(await refusalOf(c)).toEqual({ code: 1008, reason: 'Invalid room ID' });
  });

  it('passes a reader\'s presence, never its changes; a writer\'s changes pass', async () => {
    const { room, reader, writer } = signedRoom();
    const w = await joinWs(relay.ws, `${room}?client=writer01&${writer()}`);
    const r = await joinWs(relay.ws, `${room}?client=reader01&${reader}`);
    expect(w.closed).toBeNull();
    expect(r.closed).toBeNull();
    await wait(100);
    r.send(categorized(3, 'reader-change'));
    r.send(categorized(1, 'reader-presence'));
    w.send(categorized(3, 'writer-change'));
    await wait(200);
    expect(texts(w).map((t) => t.slice(5))).toEqual(['reader-presence']);
    expect(texts(r).map((t) => t.slice(5))).toEqual(['writer-change']);
    for (const c of [w, r]) c.close();
  });

  it('refuses a write key that does not match the signed room', async () => {
    const { room } = signedRoom();
    const other = signedRoom();
    const c = await joinWs(relay.ws, `${room}?${other.reader}`);
    expect(await refusalOf(c)).toEqual({ code: 1008, reason: 'Write proof refused' });
  });

  it('replays to a client what was sent while it was away (async room)', async () => {
    const a = await joinWs(relay.ws, 'room-async?async=1&client=asyncAAA');
    await wait(100);
    a.send(Buffer.from('while-alone'));
    await wait(200);
    a.close();
    await wait(100);
    const b = await joinWs(relay.ws, 'room-async?async=1&client=asyncBBB');
    await wait(1900);
    expect(texts(b)).toContain('while-alone');
    b.close();
  }, 10_000);
});
