/**
 * Settings of the relay, all from the environment. Shared by the standalone
 * relay (relay/index.js) and the combined image's server (server/index.js),
 * each with its own defaults for what differs between them.
 *
 * A `.env` file is read first when there is one (path in ENV_FILE, else
 * `.env` in the working directory): variables already set in the environment
 * win over it, so docker compose's `environment:` keeps the last word.
 * Every variable, with its default, is listed in relay/.env.example.
 */

import { existsSync } from 'node:fs';

/** Reads the .env file, if any, without overriding variables already set */
export function loadEnvFile() {
  const path = process.env.ENV_FILE || '.env';
  if (!existsSync(path)) return;
  const before = { ...process.env };
  process.loadEnvFile(path);
  Object.assign(process.env, before);
}

/** Defaults of the standalone relay */
export const RELAY_DEFAULTS = {
  PORT: 4444,
  MAX_MESSAGE_SIZE_MB: 100,
  RATE_WINDOW_MS: 1000,
  RATE_LIMIT: 1500,
  MAX_CONNECTIONS_PER_IP: 50,
  MAX_CLIENTS_PER_ROOM: 50,
  MAX_ROOMS: 1000,
  MAX_ROOM_ID_LENGTH: 128,
  PING_INTERVAL_S: 30,
  PONG_TIMEOUT_MS: 10_000,
  // Above the largest message (MAX_MESSAGE_SIZE_MB) plus a room's async
  // buffer, so that joining a large dossier does not trip it
  BACKPRESSURE_MB: 256,
  BUFFER_SIZE_MB: 50,
  BUFFER_MAX_MSGS: 100_000,
  BUFFER_AGE_HOURS: 48,
  BUFFER_TOTAL_GB: 10,
  BUFFER_ORPHAN_HOURS: 24,
};

function number(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.warn(`[Config] ${key}="${raw}" is not a positive number: ${fallback} kept`);
    return fallback;
  }
  return value;
}

/**
 * The relay's settings: the environment over `defaults`.
 * @param {Partial<typeof RELAY_DEFAULTS>} [defaults]
 */
export function relayConfig(defaults = {}) {
  const d = { ...RELAY_DEFAULTS, ...defaults };
  const n = (key) => number(key, d[key]);
  const MB = 1024 * 1024;
  return {
    PORT: n('PORT'),
    HOST: process.env.HOST || '0.0.0.0',
    REDIS_URL: process.env.REDIS_URL || null,
    TRUST_PROXY: process.env.TRUST_PROXY === '1',
    /** Origin allowed to read /health and /metrics from a page (CORS) */
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
    LIMITS: {
      MAX_MESSAGE_SIZE: n('MAX_MESSAGE_SIZE_MB') * MB,
      RATE_WINDOW_MS: n('RATE_WINDOW_MS'),
      MAX_MESSAGES_PER_WINDOW: n('RATE_LIMIT'),
      MAX_CONNECTIONS_PER_IP: n('MAX_CONNECTIONS_PER_IP'),
      MAX_CLIENTS_PER_ROOM: n('MAX_CLIENTS_PER_ROOM'),
      MAX_ROOMS: n('MAX_ROOMS'),
      MAX_ROOM_ID_LENGTH: n('MAX_ROOM_ID_LENGTH'),
      // Not a setting: what a room id may contain
      ROOM_ID_PATTERN: /^[a-zA-Z0-9._-]+$/,
      PING_INTERVAL_MS: n('PING_INTERVAL_S') * 1000,
      PONG_TIMEOUT_MS: n('PONG_TIMEOUT_MS'),
      MAX_BUFFERED_AMOUNT: n('BACKPRESSURE_MB') * MB,
    },
    BUFFER_LIMITS: {
      MAX_BUFFER_SIZE_PER_ROOM: n('BUFFER_SIZE_MB') * MB,
      MAX_MESSAGES_PER_ROOM: n('BUFFER_MAX_MSGS'),
      MAX_MESSAGE_AGE_MS: n('BUFFER_AGE_HOURS') * 3600 * 1000,
      // As many as rooms, unless set apart
      MAX_ROOMS_WITH_BUFFER: number('BUFFER_MAX_ROOMS', n('MAX_ROOMS')),
      MAX_TOTAL_BUFFER_SIZE: n('BUFFER_TOTAL_GB') * 1024 * MB,
      ORPHAN_MAX_AGE_MS: n('BUFFER_ORPHAN_HOURS') * 3600 * 1000,
    },
  };
}
