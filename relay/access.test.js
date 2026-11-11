import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WebSocket } from 'ws';
import { accessOf, CATEGORY, categoryOf, readerMayRelay, roomIdForKey, writeProofMessage, WRITE_PROOF_MAX_AGE_S } from './access.js';

function writeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { raw, privateKey, room: roomIdForKey(raw), wpub: raw.toString('base64url') };
}

function params(key, room, { proof = false, ts = Math.floor(Date.now() / 1000), signer = key.privateKey } = {}) {
  const p = new URLSearchParams({ wpub: key.wpub });
  if (proof) {
    p.set('wts', String(ts));
    p.set('wsig', sign(null, Buffer.from(writeProofMessage(room, ts)), signer).toString('base64url'));
  }
  return p;
}

const withCategory = (category, payload) => Buffer.concat([Buffer.from([0xff, 0x5a, 0x4e, 0x43, category]), Buffer.from(payload)]);
const targeted = (tag, payload) => Buffer.concat([Buffer.from([0xff, 0x5a, 0x4e, 0x54, tag.length]), Buffer.from(tag, 'ascii'), payload]);

describe('who may change a dossier', () => {
  it('leaves rooms that are not signed as before: everyone writes', () => {
    expect(accessOf('room-abc', new URLSearchParams())).toEqual({ writer: true });
  });

  it('takes a link without the write key for a reader, with it for a writer', () => {
    const key = writeKey();
    expect(accessOf(key.room, params(key, key.room))).toEqual({ writer: false });
    expect(accessOf(key.room, params(key, key.room, { proof: true }))).toEqual({ writer: true });
    // The files room: its own proof
    const files = `${key.room}.files`;
    expect(accessOf(files, params(key, files))).toEqual({ writer: false });
    expect(accessOf(files, params(key, files, { proof: true }))).toEqual({ writer: true });
    expect(accessOf(files, params(key, key.room, { proof: true })).refused).toBeTruthy();
  });

  it('refuses another key, a proof by another key, and an old proof', () => {
    const key = writeKey();
    const other = writeKey();
    expect(accessOf(key.room, params(other, key.room)).refused).toBeTruthy();
    expect(accessOf(key.room, new URLSearchParams()).refused).toBeTruthy();
    expect(accessOf(key.room, params(key, key.room, { proof: true, signer: other.privateKey })).refused).toBeTruthy();
    const old = Math.floor(Date.now() / 1000) - WRITE_PROOF_MAX_AGE_S - 5;
    expect(accessOf(key.room, params(key, key.room, { proof: true, ts: old })).refused).toBeTruthy();
  });

  it('reads the category; a reader passes presence and requests only', () => {
    expect(categoryOf(withCategory(CATEGORY.data, 'x'))).toBe(CATEGORY.data);
    expect(categoryOf(Buffer.from([0xe2, 0xe2, 1]))).toBeNull();
    expect(readerMayRelay(withCategory(CATEGORY.presence, 'x'))).toBe(true);
    expect(readerMayRelay(withCategory(CATEGORY.request, 'x'))).toBe(true);
    expect(readerMayRelay(withCategory(CATEGORY.data, 'x'))).toBe(false);
    expect(readerMayRelay(Buffer.from([0xe2, 0xe2, 1]))).toBe(false);
  });
});

describe('a real relay with a reader', () => {
  it('passes the writer\'s changes to the reader, and nothing but presence and requests the other way', async () => {
    const port = 6100 + Math.floor(Math.random() * 300);
    const relay = spawn('node', ['relay/index.js'], { stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
    try {
      const health = async () => { try { return await fetch(`http://127.0.0.1:${port}/health`); } catch { return null; } };
      let res = null;
      for (let i = 0; i < 50 && !res; i++) { res = await health(); if (!res) await new Promise((r) => setTimeout(r, 100)); }
      expect(res.headers.get('x-relay-features')).toContain('readonly');

      const key = writeKey();
      const connect = (tag, p) => new Promise((resolve) => {
        p.set('client', tag);
        const ws = new WebSocket(`ws://127.0.0.1:${port}/${key.room}?${p}`);
        ws.received = [];
        ws.closedWith = null;
        ws.on('message', (d) => ws.received.push(Buffer.from(d).toString('latin1')));
        ws.on('close', (code) => { ws.closedWith = code; resolve(ws); });
        ws.on('open', () => resolve(ws));
      });
      const writer = await connect('writerTag001', params(key, key.room, { proof: true }));
      const reader = await connect('readerTag001', params(key, key.room));
      const otherWriter = await connect('writerTag002', params(key, key.room, { proof: true }));
      await new Promise((r) => setTimeout(r, 200));

      writer.send(withCategory(CATEGORY.data, 'change'));
      reader.send(withCategory(CATEGORY.data, 'forged'));
      reader.send(withCategory(CATEGORY.presence, 'here'));
      reader.send(withCategory(CATEGORY.request, 'sync?'));
      reader.send(Buffer.from([0xe2, 0xe2, 7]));
      reader.send(targeted('writerTag001', withCategory(CATEGORY.data, 'chunk')));
      await new Promise((r) => setTimeout(r, 300));

      const text = (ws) => ws.received.map((m) => m.slice(5));
      expect(text(reader)).toEqual(['change']);
      expect(text(otherWriter)).toEqual(['change', 'here', 'sync?']);
      expect(text(writer)).toEqual(['here', 'sync?']);

      // A forged key is turned away
      const intruder = await connect('intruderTag1', params(writeKey(), key.room));
      await new Promise((r) => setTimeout(r, 200));
      expect(intruder.closedWith).toBe(1008);
      for (const ws of [writer, reader, otherWriter]) ws.close();
    } finally {
      relay.kill();
    }
  });
});
