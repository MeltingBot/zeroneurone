import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBlobStore, handleBlobRequest } from './blobStore.js';

const LIMITS = { MAX_BLOB_SIZE: 1000, MAX_ROOM_SIZE: 2500, MAX_TOTAL_SIZE: 4000, TTL_MS: 10 * 24 * 3600 * 1000 };

let dir;
let store;
let server;
let base;

async function start() {
  store = createBlobStore({ dir, limits: LIMITS, log: () => {} });
  await store.init();
  server = createServer(async (req, res) => {
    if (!(await handleBlobRequest(req, res, store))) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}

const put = (room, id, bytes, token = 'tok') => fetch(`${base}/blob/${room}/${id}`, { method: 'PUT', body: bytes, headers: { 'X-Room-Token': token } });
const get = (room, id, token = 'tok') => fetch(`${base}/blob/${room}/${id}`, { headers: { 'X-Room-Token': token } });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'zn-blob-'));
  await start();
});
afterEach(() => new Promise((resolve) => server.close(resolve)));

describe('relay blob store', () => {
  it('keeps a deposited file and hands it back as is', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    expect((await put('room1', 'asset-1', bytes)).status).toBe(201);
    const res = await get('room1', 'asset-1');
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect((await fetch(`${base}/blob/room1/asset-1`, { method: 'HEAD', headers: { 'X-Room-Token': 'tok' } })).headers.get('content-length')).toBe('4');
    expect((await get('room1', 'nope')).status).toBe(404);
  });

  it('opens a room only with its token, set by the first deposit', async () => {
    await put('room1', 'a', new Uint8Array([1]));
    expect((await get('room1', 'a', 'other')).status).toBe(403);
    expect((await put('room1', 'b', new Uint8Array([1]), 'other')).status).toBe(403);
    expect((await fetch(`${base}/blob/room1/a`)).status).toBe(401);
    // Reading a room nobody deposited in does not claim it
    expect((await get('room2', 'a', 'thief')).status).toBe(403);
    expect((await put('room2', 'a', new Uint8Array([1]), 'owner')).status).toBe(201);
  });

  it('refuses past the file, room and total limits', async () => {
    expect((await put('room1', 'big', new Uint8Array(1001))).status).toBe(413);
    expect((await put('room1', 'a', new Uint8Array(1000))).status).toBe(201);
    expect((await put('room1', 'b', new Uint8Array(1000))).status).toBe(201);
    expect((await put('room1', 'c', new Uint8Array(1000))).status).toBe(507);
    // Deposited again: replaces, does not add up
    expect((await put('room1', 'b', new Uint8Array(1000))).status).toBe(201);
    expect(store.stats()).toEqual({ rooms: 1, files: 2, totalMB: 0 });
    expect((await put('room2', 'a', new Uint8Array(1000), 'x')).status).toBe(201);
    expect((await put('room3', 'a', new Uint8Array(1000), 'y')).status).toBe(201);
    expect((await put('room4', 'a', new Uint8Array(1000), 'z')).status).toBe(507);
    expect((await fetch(`${base}/blob/room1/..%2Fx`, { method: 'PUT', body: 'x', headers: { 'X-Room-Token': 'tok' } })).status).toBe(400);
  });

  it('erases files past their age, and finds the others again after a restart', async () => {
    await put('room1', 'old', new Uint8Array([1]));
    await put('room1', 'new', new Uint8Array([2]));
    await store.backdate('room1', 'old', Date.now() - LIMITS.TTL_MS - 1000);
    expect(await store.cleanup()).toBe(1);
    expect((await get('room1', 'old')).status).toBe(404);
    await new Promise((resolve) => server.close(resolve));
    await start();
    expect(new Uint8Array(await (await get('room1', 'new')).arrayBuffer())).toEqual(new Uint8Array([2]));
  });
});
