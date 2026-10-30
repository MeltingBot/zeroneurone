/** IndexedDB database holding a dossier's Y.Doc */
const YDOC_DB_PREFIX = 'zeroneurone-ydoc-';

export const ydocDatabaseName = (dossierId: string) => `${YDOC_DB_PREFIX}${dossierId}`;

export const isYdocDatabaseName = (name: string | undefined): name is string => !!name?.startsWith(YDOC_DB_PREFIX);

export const dossierIdOfYdocDatabase = (name: string) => name.slice(YDOC_DB_PREFIX.length);
