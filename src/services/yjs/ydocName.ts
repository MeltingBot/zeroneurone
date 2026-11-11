/** IndexedDB database holding a dossier's Y.Doc */
const YDOC_DB_PREFIX = 'zeroneurone-ydoc-';

export const ydocDatabaseName = (dossierId: string) => `${YDOC_DB_PREFIX}${dossierId}`;

/**
 * The mobile companion's own copy of a dossier. Apart from the desktop's even
 * in the same browser: the desktop's maintenance (purge, integrity, at-rest
 * encryption) and the companion's "Forget" never touch the other's copy. The
 * prefix does not start with the desktop's, so its scans skip these.
 */
const COMPANION_YDOC_DB_PREFIX = 'zeroneurone-companion-ydoc-';

export const companionYdocDatabaseName = (dossierId: string) => `${COMPANION_YDOC_DB_PREFIX}${dossierId}`;

/**
 * A shared dossier's files document on a computer (filesSync.ts): the bytes
 * of its attachments, apart from the main document.
 */
export const filesDatabaseName = (dossierId: string) => `zeroneurone-files-${dossierId}`;

export const isYdocDatabaseName = (name: string | undefined): name is string => !!name?.startsWith(YDOC_DB_PREFIX);

export const dossierIdOfYdocDatabase = (name: string) => name.slice(YDOC_DB_PREFIX.length);

/**
 * Delete an IndexedDB database. When another connection still holds it, the
 * browser reports "blocked" and deletes it as soon as that connection closes:
 * wait for that, up to `blockedTimeoutMs`.
 */
export function deleteIdbDatabase(name: string, blockedTimeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => { if (timer) clearTimeout(timer); resolve(); };
    request.onerror = () => { if (timer) clearTimeout(timer); reject(request.error); };
    request.onblocked = () => {
      timer = setTimeout(() => reject(new Error('Y.js database still in use')), blockedTimeoutMs);
    };
  });
}

/** Delete the dossier's Y.js database (the desktop's copy) */
export function deleteYDocDatabase(dossierId: string, blockedTimeoutMs = 5000): Promise<void> {
  return deleteIdbDatabase(ydocDatabaseName(dossierId), blockedTimeoutMs);
}
