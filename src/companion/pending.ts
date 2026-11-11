/**
 * What the phone wrote and may not have delivered yet.
 *
 * y-websocket only sends edits made while the socket is open, and the relay
 * keeps no copy of the dossier: an edit made offline reaches the desktop only
 * if both are online together and the desktop asks for it. So before its
 * first unconfirmed write the companion records the Y.Doc state vector; once
 * connected, it sends everything written since (the relay buffers it, the
 * room being async) and forgets the record.
 *
 * Kept in localStorage per dossier, so it survives a reload or a closed tab.
 */

import * as Y from 'yjs';

interface PendingRecord {
  /** State vector before the first unconfirmed write (base64) */
  sv: string;
  /** Ids of the elements and comments written since */
  ids: string[];
  /** A write happened, or the socket dropped, while offline: resend on connect */
  needsResend: boolean;
}

const keyOf = (dossierId: string) => `zeroneurone-companion-pending:${dossierId}`;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function readPending(dossierId: string): PendingRecord | null {
  try {
    const raw = localStorage.getItem(keyOf(dossierId));
    return raw ? (JSON.parse(raw) as PendingRecord) : null;
  } catch {
    return null;
  }
}

function writePending(dossierId: string, record: PendingRecord | null): void {
  try {
    if (record) localStorage.setItem(keyOf(dossierId), JSON.stringify(record));
    else localStorage.removeItem(keyOf(dossierId));
  } catch {
    // Storage unavailable: delivery then relies on staying connected
  }
}

/** Call BEFORE writing `id` into the Y.Doc */
export function beginWrite(dossierId: string, ydoc: Y.Doc, id: string, connected: boolean): void {
  const record = readPending(dossierId) ?? {
    sv: toBase64(Y.encodeStateVector(ydoc)),
    ids: [],
    needsResend: false,
  };
  if (!record.ids.includes(id)) record.ids.push(id);
  if (!connected) record.needsResend = true;
  writePending(dossierId, record);
}

/** The socket dropped: whatever is pending may have been cut off mid-send */
export function markDisconnected(dossierId: string): void {
  const record = readPending(dossierId);
  if (record && !record.needsResend) writePending(dossierId, { ...record, needsResend: true });
}

/** Everything written since the record, to send on connect (null when nothing to resend) */
export function updateToResend(dossierId: string, ydoc: Y.Doc): Uint8Array | null {
  const record = readPending(dossierId);
  if (!record?.needsResend) return null;
  return Y.encodeStateAsUpdate(ydoc, fromBase64(record.sv));
}

export function clearPending(dossierId: string): void {
  writePending(dossierId, null);
}

export function pendingCount(dossierId: string): number {
  return readPending(dossierId)?.ids.length ?? 0;
}
