import { isValidAccessKey, isValidWriteLock, type WriteAccess } from '../services/writeAccess';

/**
 * Parsing of a share link, shared by the desktop join page (/join/…) and the
 * mobile companion (/m/…). Both carry the same parts:
 *
 *   /{route}/{roomId}?server=wss://…&async=1#key=…&id={uuid}&name=…
 *
 * A signed room (read-only sharing, writeAccess.ts) adds `wpub` (public write
 * key) and `wlock` (private write key locked by the write code, entered on
 * joining). A `wseed` (private write key in clear) is still read.
 *
 * The key, the dossier UUID and its name sit in the fragment, never sent to
 * the server. Links made before v1.7 put the UUID in the path and the name in
 * the query.
 */

export interface JoinLink {
  /** Path segment: the hashed room id (or the UUID for legacy links) */
  roomId: string;
  dossierId: string;
  encryptionKey: string | null;
  name: string | null;
  server: string | null;
  asyncEnabled: boolean;
  isLegacyFormat: boolean;
  /** Write key of a signed room; without seed: a read link */
  access: WriteAccess | null;
  /** Private write key locked by the write code, when the link has it */
  writeLock: string | null;
}

function accessOf(hashParams: URLSearchParams): WriteAccess | null {
  const publicKey = hashParams.get('wpub');
  if (!isValidAccessKey(publicKey)) return null;
  const seed = hashParams.get('wseed');
  return isValidAccessKey(seed) ? { publicKey, seed } : { publicKey };
}

export function parseJoinLink(pathSegment: string, search: string, hash: string): JoinLink {
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const searchParams = new URLSearchParams(search);
  const fragmentId = hashParams.get('id');
  return {
    roomId: pathSegment,
    dossierId: fragmentId || pathSegment,
    encryptionKey: hashParams.get('key') || null,
    name: hashParams.get('name') || searchParams.get('name') || null,
    server: searchParams.get('server') || null,
    asyncEnabled: searchParams.get('async') === '1',
    isLegacyFormat: !fragmentId,
    access: accessOf(hashParams),
    writeLock: isValidWriteLock(hashParams.get('wlock')) ? hashParams.get('wlock') : null,
  };
}
