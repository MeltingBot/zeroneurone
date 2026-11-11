/**
 * Encrypted file deposit of the relay: attachments fetched on demand.
 *
 * A client deposits an attachment encrypted with the dossier's key (the
 * relay only ever sees bytes it cannot read) and the others fetch it when
 * they open it. Files are kept BLOB_TTL_DAYS after their last deposit, then
 * erased; a computer holding the attachment deposits it again on request.
 *
 *   PUT  /blob/<roomId>/<blobId>   body: the encrypted bytes
 *   GET  /blob/<roomId>/<blobId>
 *   HEAD /blob/<roomId>/<blobId>
 *
 * Access: the room's access token (derived from the dossier key, as for the
 * WebSocket) in the X-Room-Token header, never in the URL (logs). The first
 * deposit of a room sets it: only its hash is kept, next to the files.
 *
 * Disk layout: <dir>/<roomId>/<blobId>, and <dir>/<roomId>/.token.
 * Used by relay/index.js and server/index.js.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const TOKEN_FILE = '.token';
const ROUTE = /^\/blob\/([^/]+)\/([^/?]+)$/;

const hash = (token) => createHash('sha256').update(token).digest('hex');

/**
 * @param {{ dir: string, limits: { MAX_BLOB_SIZE: number, MAX_ROOM_SIZE: number, MAX_TOTAL_SIZE: number, TTL_MS: number }, log?: (m: string) => void }} options
 */
export function createBlobStore({ dir, limits, log = console.log }) {
  /** roomId → Map<blobId, size>, rebuilt from the disk at start */
  const index = new Map();
  let total = 0;

  const roomSize = (roomId) => [...(index.get(roomId)?.values() ?? [])].reduce((a, b) => a + b, 0);

  async function init() {
    await mkdir(dir, { recursive: true });
    for (const roomId of await readdir(dir)) {
      if (!ID_PATTERN.test(roomId)) continue;
      const files = new Map();
      for (const name of await readdir(join(dir, roomId)).catch(() => [])) {
        if (name === TOKEN_FILE || !ID_PATTERN.test(name)) continue;
        const info = await stat(join(dir, roomId, name)).catch(() => null);
        if (info?.isFile()) {
          files.set(name, info.size);
          total += info.size;
        }
      }
      index.set(roomId, files);
    }
  }

  /** Whether `token` opens the room; the first deposit (`create`) sets it */
  async function authorize(roomId, token, create) {
    if (!token) return false;
    const file = join(dir, roomId, TOKEN_FILE);
    const known = await readFile(file, 'utf8').catch(() => null);
    if (known !== null) return known.trim() === hash(token);
    if (!create) return false;
    await mkdir(join(dir, roomId), { recursive: true });
    await writeFile(file, hash(token), { flag: 'wx' }).catch(() => undefined);
    return (await readFile(file, 'utf8')).trim() === hash(token);
  }

  /**
   * Keeps `body` (an async iterable of Buffers) as `blobId`; refuses past the
   * size limits. Returns an HTTP status.
   */
  async function put(roomId, blobId, body, declaredSize) {
    const previous = index.get(roomId)?.get(blobId) ?? 0;
    const fits = (size) => size <= limits.MAX_BLOB_SIZE
      && roomSize(roomId) - previous + size <= limits.MAX_ROOM_SIZE
      && total - previous + size <= limits.MAX_TOTAL_SIZE;
    if (declaredSize !== null && declaredSize > limits.MAX_BLOB_SIZE) return 413;
    if (declaredSize !== null && !fits(declaredSize)) return 507;

    await mkdir(join(dir, roomId), { recursive: true });
    const temp = join(dir, roomId, `.${blobId}.${randomBytes(6).toString('hex')}`);
    const handle = await open(temp, 'w');
    let size = 0;
    let status = 201;
    try {
      for await (const chunk of body) {
        size += chunk.length;
        if (size > limits.MAX_BLOB_SIZE) { status = 413; break; }
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (status === 201 && !fits(size)) status = 507;
    if (status !== 201) {
      await rm(temp, { force: true });
      return status;
    }
    await rename(temp, join(dir, roomId, blobId));
    if (!index.has(roomId)) index.set(roomId, new Map());
    index.get(roomId).set(blobId, size);
    total += size - previous;
    return 201;
  }

  function size(roomId, blobId) {
    return index.get(roomId)?.get(blobId) ?? null;
  }

  function read(roomId, blobId) {
    return createReadStream(join(dir, roomId, blobId));
  }

  /** Erases files past their age, and rooms left without any. Returns how many went. */
  async function cleanup(now = Date.now()) {
    let removed = 0;
    for (const [roomId, files] of index) {
      for (const blobId of [...files.keys()]) {
        const info = await stat(join(dir, roomId, blobId)).catch(() => null);
        if (info && now - info.mtimeMs < limits.TTL_MS) continue;
        await rm(join(dir, roomId, blobId), { force: true });
        total -= files.get(blobId);
        files.delete(blobId);
        removed++;
      }
      if (files.size === 0) {
        await rm(join(dir, roomId), { recursive: true, force: true });
        index.delete(roomId);
      }
    }
    if (removed > 0) log(`[Blob] ${removed} file(s) past their age erased`);
    return removed;
  }

  /** For tests: makes a file look deposited at `when` */
  async function backdate(roomId, blobId, when) {
    const date = new Date(when);
    await utimes(join(dir, roomId, blobId), date, date);
  }

  function stats() {
    let files = 0;
    for (const f of index.values()) files += f.size;
    return { rooms: index.size, files, totalMB: +(total / 1024 / 1024).toFixed(2) };
  }

  return { init, authorize, put, size, read, cleanup, stats, backdate };
}

/** CORS headers a page needs to deposit and fetch files */
export const BLOB_CORS = {
  'Access-Control-Allow-Methods': 'GET, PUT, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Room-Token',
  'Access-Control-Expose-Headers': 'Content-Length',
};

/**
 * Serves /blob/… requests. Returns false for any other path (left to the
 * caller). CORS preflight is the caller's (it sets BLOB_CORS).
 */
export async function handleBlobRequest(req, res, store) {
  const match = ROUTE.exec(new URL(req.url, 'http://localhost').pathname);
  if (!match) return false;
  const [, roomId, blobId] = match;
  const end = (status) => { res.writeHead(status); res.end(); };
  if (!ID_PATTERN.test(roomId) || !ID_PATTERN.test(blobId) || blobId === TOKEN_FILE) { end(400); return true; }
  const token = req.headers['x-room-token'];
  if (typeof token !== 'string' || !token) { end(401); return true; }

  try {
    if (req.method === 'PUT') {
      if (!(await store.authorize(roomId, token, true))) { end(403); return true; }
      const declared = req.headers['content-length'] ? Number(req.headers['content-length']) : null;
      end(await store.put(roomId, blobId, req, Number.isFinite(declared) ? declared : null));
      return true;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!(await store.authorize(roomId, token, false))) { end(403); return true; }
      const size = store.size(roomId, blobId);
      if (size === null) { end(404); return true; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') { res.end(); return true; }
      store.read(roomId, blobId).on('error', () => res.destroy()).pipe(res);
      return true;
    }
    end(405);
  } catch (err) {
    console.warn('[Blob] request failed:', err.message);
    if (!res.headersSent) end(500);
  }
  return true;
}
