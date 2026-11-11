/**
 * The files document of a shared dossier: the bytes of its attachments,
 * apart from the main document so that a phone (which syncs only the main
 * one) does not download every file to open a dossier.
 *
 * Same format as the main document's `assets` map (metadata + chunks,
 * assetSync.ts), on a room derived from the dossier's (`<room>.files`), same
 * encryption key, same async buffering by the relay: computers sync it
 * whole, so files reach a computer that was off when they were added, as
 * before. The main document keeps each attachment's metadata and thumbnail.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { EncryptedIndexeddbPersistence } from './encryption/encryptedIndexeddbPersistence';
import { createEncryptedWebSocketClass } from './encryptedWebSocket';
import { deriveAccessToken } from './cryptoService';
import { filesDatabaseName } from './yjs/ydocName';
import type { WriteAccess } from './writeAccess';

export interface FilesSync {
  doc: Y.Doc;
  close(): Promise<void>;
}

/** The files room of a dossier room */
export const filesRoomId = (roomId: string) => `${roomId}.files`;

export async function openFilesSync(options: {
  serverUrl: string;
  dossierId: string;
  roomId: string;
  encryptionKey: string;
  asyncEnabled: boolean;
  /** At-rest key of the computer, when its local data is encrypted */
  dek: Uint8Array | null;
  clientTag?: string;
  /** Write key of a signed room (read-only sharing) */
  access?: WriteAccess | null;
}): Promise<FilesSync> {
  const doc = new Y.Doc();
  const persistence = new EncryptedIndexeddbPersistence(filesDatabaseName(options.dossierId), doc, options.dek ?? undefined);
  await persistence.whenSynced;

  const room = filesRoomId(options.roomId);
  const params = [
    options.asyncEnabled ? 'async=1' : null,
    `token=${encodeURIComponent(await deriveAccessToken(options.encryptionKey, room))}`,
    options.clientTag ? `client=${encodeURIComponent(options.clientTag)}` : null,
  ].filter(Boolean).join('&');
  const provider = new WebsocketProvider(options.serverUrl, `${room}?${params}`, doc, {
    // A wrong key is reported by the main document's connection
    WebSocketPolyfill: createEncryptedWebSocketClass(options.encryptionKey, () => provider.disconnect(), options.access),
    maxBackoffTime: 30000,
    resyncInterval: -1,
  });
  // No presence in this room: the dossier's room carries it
  provider.awareness.setLocalState(null);

  return {
    doc,
    async close() {
      provider.disconnect();
      provider.destroy();
      try {
        await persistence.compact().catch(() => undefined);
        await persistence.destroy();
      } finally {
        doc.destroy();
      }
    },
  };
}
