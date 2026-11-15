/**
 * Test helpers: a real relay (relay/index.js or server/index.js) on a free
 * port, ws clients that record what they get, signed-room keys.
 * Used by relay/*.test.js only, never shipped.
 */

import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WebSocket } from 'ws';
import { roomIdForKey, writeProofMessage } from './access.js';

export const SERVERS = ['relay/index.js', 'server/index.js'];

let nextPort = 4900 + Math.floor(Math.random() * 500);

/** Starts `script` and waits for its /health; `stop()` kills it */
export async function startRelay(script, env = {}) {
  const port = nextPort++;
  const child = spawn('node', [script], {
    stdio: 'ignore',
    env: { ...process.env, ENV_FILE: '/nonexistent', PORT: String(port), HOST: '127.0.0.1', ...env },
  });
  const http = `http://127.0.0.1:${port}`;
  let health = null;
  for (let i = 0; i < 80 && !health; i++) {
    try { health = await fetch(`${http}/health`); } catch { await wait(100); }
  }
  if (!health) { child.kill(); throw new Error(`${script} did not start`); }
  return { port, http, ws: `ws://127.0.0.1:${port}`, health, stop: () => child.kill() };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Connects a ws client to `path` (room and query). Resolves once open, or
 * with the close code and reason when the relay refuses it.
 */
export function joinWs(base, path) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base}/${path}`);
    ws.received = [];
    ws.closed = null;
    ws.on('message', (d) => ws.received.push(Buffer.from(d)));
    ws.on('open', () => resolve(ws));
    ws.on('close', (code, reason) => {
      ws.closed = { code, reason: reason.toString() };
      resolve(ws);
    });
    ws.on('error', () => {});
  });
}

/** The close of a client the relay refuses (it opens, then is closed) */
export async function refusalOf(client, ms = 1000) {
  for (let t = 0; t < ms && !client.closed; t += 20) await wait(20);
  return client.closed;
}

/** What a client received, as strings */
export const texts = (client) => client.received.map((b) => Buffer.from(b).toString());

/** A message of a signed room with its category (relay/access.js) */
export const categorized = (category, body) => Buffer.concat([Buffer.from([0xff, 0x5a, 0x4e, 0x43, category]), Buffer.from(body)]);

/** A message for one client (relay/forward.js) */
export const targeted = (tag, payload) => Buffer.concat([Buffer.from([0xff, 0x5a, 0x4e, 0x54, tag.length]), Buffer.from(tag, 'ascii'), Buffer.from(payload)]);

/** A signed room and the URL parameters of a reader and of a writer */
export function signedRoom() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const room = roomIdForKey(raw);
  const wpub = Buffer.from(raw).toString('base64url');
  const writer = () => {
    const wts = Math.floor(Date.now() / 1000);
    const wsig = sign(null, Buffer.from(writeProofMessage(room, wts)), privateKey).toString('base64url');
    return `wpub=${wpub}&wts=${wts}&wsig=${wsig}`;
  };
  return { room, reader: `wpub=${wpub}`, writer };
}

/**
 * Connects an HTTP fallback client (relay/sse.js) to `path`: reads its
 * stream, `send(data)` posts one message. Resolves once open, or with the
 * close the relay announced.
 */
export function joinSse(http, path) {
  const [room, query = ''] = path.split('?');
  const client = { received: [], closed: null, sessionId: null, abort: new AbortController() };
  client.send = (...messages) => {
    const body = Buffer.concat(messages.flatMap((m) => {
      const data = Buffer.from(m);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      return [length, data];
    }));
    return fetch(`${http}/sse/${room}/${client.sessionId}`, {
      method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' },
    });
  };
  client.close = () => client.abort.abort();
  return new Promise((resolve) => {
    fetch(`${http}/sse/${room}?${query}`, { signal: client.abort.signal }).then(async (res) => {
      const decoder = new TextDecoder();
      let pending = '';
      for await (const chunk of res.body) {
        pending += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const block = pending.slice(0, end);
          pending = pending.slice(end + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (data === undefined) continue;
          if (event === 'session') { client.sessionId = data; resolve(client); }
          else if (event === 'close') { client.closed = JSON.parse(data); resolve(client); }
          else client.received.push(Buffer.from(data, 'base64'));
        }
      }
      if (!client.closed) client.closed = { code: 1006, reason: '' };
      resolve(client);
    }).catch(() => {
      if (!client.closed) client.closed = { code: 1006, reason: '' };
      resolve(client);
    });
  });
}
