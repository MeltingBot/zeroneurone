/**
 * Which transport reaches a relay: WebSocket, or its HTTP fallback when the
 * network blocks WebSocket (sseSocket.ts). The fallback, once found
 * necessary, is remembered per relay for a day so the next connections skip
 * the failed WebSocket attempt; WebSocket is tried again after that.
 */

import type { RelayTransport } from './encryptedWebSocket';

const KEY_PREFIX = 'zn-collab-transport:';
export const REMEMBER_MS = 24 * 60 * 60 * 1000;

/** The transport to start with for `serverUrl` */
export function rememberedTransport(serverUrl: string, now = Date.now()): RelayTransport {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + serverUrl);
    if (!raw) return 'ws';
    const { transport, until } = JSON.parse(raw) as { transport?: string; until?: number };
    if (transport === 'sse' && typeof until === 'number' && until > now) return 'sse';
    localStorage.removeItem(KEY_PREFIX + serverUrl);
  } catch { /* storage unavailable: WebSocket first */ }
  return 'ws';
}

/** Remembers the fallback for `serverUrl` (`sse`), or forgets it (`ws`) */
export function rememberTransport(serverUrl: string, transport: RelayTransport, now = Date.now()): void {
  try {
    if (transport === 'sse') {
      localStorage.setItem(KEY_PREFIX + serverUrl, JSON.stringify({ transport, until: now + REMEMBER_MS }));
    } else {
      localStorage.removeItem(KEY_PREFIX + serverUrl);
    }
  } catch { /* storage unavailable: only this session knows */ }
}
