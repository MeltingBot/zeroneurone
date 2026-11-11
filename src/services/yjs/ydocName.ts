/** IndexedDB database holding a dossier's Y.Doc */
const YDOC_DB_PREFIX = 'zeroneurone-ydoc-';

export const ydocDatabaseName = (dossierId: string) => `${YDOC_DB_PREFIX}${dossierId}`;

export const isYdocDatabaseName = (name: string | undefined): name is string => !!name?.startsWith(YDOC_DB_PREFIX);

export const dossierIdOfYdocDatabase = (name: string) => name.slice(YDOC_DB_PREFIX.length);

/**
 * Delete the dossier's Y.js database. When another connection still holds it,
 * the browser reports "blocked" and deletes it as soon as that connection
 * closes: wait for that, up to `blockedTimeoutMs`.
 */
export function deleteYDocDatabase(dossierId: string, blockedTimeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const request = indexedDB.deleteDatabase(ydocDatabaseName(dossierId));
    request.onsuccess = () => { if (timer) clearTimeout(timer); resolve(); };
    request.onerror = () => { if (timer) clearTimeout(timer); reject(request.error); };
    request.onblocked = () => {
      timer = setTimeout(() => reject(new Error('Y.js database still in use')), blockedTimeoutMs);
    };
  });
}
