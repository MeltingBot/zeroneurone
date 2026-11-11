import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { forward, SLOW_CLIENT_CLOSE, targetOf } from './forward.js';

function client(bufferedAmount) {
  return {
    bufferedAmount, sent: [], closed: [],
    send(data) { this.sent.push(data); },
    close(code, reason) { this.closed.push([code, reason]); },
  };
}

describe('forward with backpressure', () => {
  it('sends while the client keeps up', () => {
    const c = client(1000);
    expect(forward(c, 'update', 4096, () => {})).toBe(true);
    expect(c.sent).toEqual(['update']);
    expect(c.closed).toEqual([]);
  });

  it('disconnects a client too far behind instead of leaving it without the update', () => {
    const c = client(10_000);
    expect(forward(c, 'update', 4096, () => {})).toBe(false);
    expect(forward(c, 'next', 4096, () => {})).toBe(false);
    expect(c.sent).toEqual([]);
    // Closed once, with the code that makes it reconnect and resync
    expect(c.closed).toEqual([[SLOW_CLIENT_CLOSE, 'Too far behind, reconnect']]);
  });
});

const targeted = (tag, payload) => Buffer.concat([Buffer.from([0xff, 0x5a, 0x4e, 0x54, tag.length]), Buffer.from(tag, 'ascii'), Buffer.from(payload)]);

describe('messages for one client', () => {
  it('reads the target tag and the payload, and nothing from an ordinary message', () => {
    expect(targetOf(targeted('phoneTag123', 'secret'))).toEqual({ tag: 'phoneTag123', payload: Buffer.from('secret') });
    expect(targetOf(Buffer.from([0, 1, 2, 3, 4, 5]))).toBeNull();
    expect(targetOf(Buffer.from([0xff, 0x5a, 0x4e, 0x54, 40, 1]))).toBeNull();
  });

  it('reaches the target alone through a real relay; ordinary messages still reach all', async () => {
    const port = 4600 + Math.floor(Math.random() * 300);
    const relay = spawn('node', ['relay/index.js'], { stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
    try {
      const health = async () => { try { return await fetch(`http://127.0.0.1:${port}/health`); } catch { return null; } };
      let res = null;
      for (let i = 0; i < 50 && !res; i++) { res = await health(); if (!res) await new Promise((r) => setTimeout(r, 100)); }
      expect(res.headers.get('x-relay-features')).toContain('targeted');

      const join = (tag) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/room-t?client=${tag}`);
        ws.received = [];
        ws.on('message', (d) => ws.received.push(Buffer.from(d).toString()));
        ws.on('open', () => resolve(ws));
      });
      const desktop = await join('desktopTag01');
      const phone = await join('phoneTag0001');
      const other = await join('otherTag0001');
      await new Promise((r) => setTimeout(r, 200));
      desktop.send(targeted('phoneTag0001', 'photo'));
      desktop.send(Buffer.from('ordinary'));
      await new Promise((r) => setTimeout(r, 300));
      expect(phone.received).toEqual(['photo', 'ordinary']);
      expect(other.received).toEqual(['ordinary']);
      for (const ws of [desktop, phone, other]) ws.close();
    } finally {
      relay.kill();
    }
  });
});
