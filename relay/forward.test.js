import { describe, it, expect } from 'vitest';
import { forward, SLOW_CLIENT_CLOSE } from './forward.js';

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
