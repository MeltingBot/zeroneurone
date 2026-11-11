import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnvFile, relayConfig } from './config.js';

const KEYS = ['BACKPRESSURE_MB', 'BUFFER_AGE_HOURS', 'MAX_ROOMS', 'BUFFER_MAX_ROOMS', 'RATE_LIMIT', 'ENV_FILE', 'PORT'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('relay config', () => {
  it('uses the defaults, then the caller own ones, then the environment', () => {
    for (const k of KEYS) delete process.env[k];
    expect(relayConfig().LIMITS.MAX_BUFFERED_AMOUNT).toBe(256 * 1024 * 1024);
    expect(relayConfig({ BUFFER_AGE_HOURS: 168 }).BUFFER_LIMITS.MAX_MESSAGE_AGE_MS).toBe(168 * 3600 * 1000);
    process.env.BACKPRESSURE_MB = '64';
    process.env.BUFFER_AGE_HOURS = '12';
    const config = relayConfig({ BUFFER_AGE_HOURS: 168 });
    expect(config.LIMITS.MAX_BUFFERED_AMOUNT).toBe(64 * 1024 * 1024);
    expect(config.BUFFER_LIMITS.MAX_MESSAGE_AGE_MS).toBe(12 * 3600 * 1000);
  });

  it('keeps the default for a value that is not a number', () => {
    process.env.RATE_LIMIT = 'beaucoup';
    expect(relayConfig().LIMITS.MAX_MESSAGES_PER_WINDOW).toBe(1500);
  });

  it('gives buffered rooms the room limit unless set apart', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.MAX_ROOMS = '20';
    expect(relayConfig().BUFFER_LIMITS.MAX_ROOMS_WITH_BUFFER).toBe(20);
    process.env.BUFFER_MAX_ROOMS = '5';
    expect(relayConfig().BUFFER_LIMITS.MAX_ROOMS_WITH_BUFFER).toBe(5);
  });

  it('reads a .env file without overriding the environment', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'zn-relay-')), '.env');
    writeFileSync(file, 'BACKPRESSURE_MB=32\nPORT=9999\n');
    for (const k of KEYS) delete process.env[k];
    process.env.PORT = '5555';
    process.env.ENV_FILE = file;
    loadEnvFile();
    const config = relayConfig();
    expect(config.LIMITS.MAX_BUFFERED_AMOUNT).toBe(32 * 1024 * 1024);
    expect(config.PORT).toBe(5555);
  });
});
