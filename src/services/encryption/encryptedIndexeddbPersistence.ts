/**
 * EncryptedIndexeddbPersistence — Fork de y-indexeddb avec chiffrement at-rest
 *
 * Chiffre chaque update Yjs (Uint8Array) avant stockage dans IndexedDB,
 * et déchiffre à la lecture. Même API que IndexeddbPersistence de y-indexeddb.
 *
 * Si aucune clé n'est fournie, se comporte exactement comme y-indexeddb standard.
 *
 * Algorithme : tweetnacl secretbox (XSalsa20-Poly1305)
 * Format stocké : [nonce (24 bytes)] + [ciphertext]
 */

import * as Y from 'yjs';
import * as idb from 'lib0/indexeddb';
import * as promise from 'lib0/promise';
import { Observable } from 'lib0/observable';
import { secretbox, randomBytes } from 'tweetnacl';

const CUSTOM_STORE_NAME = 'custom';
const UPDATES_STORE_NAME = 'updates';

export const PREFERRED_TRIM_SIZE = 500;

// ============================================================================
// CHIFFREMENT / DÉCHIFFREMENT DES UPDATES YJS
// ============================================================================

/**
 * Chiffre un update Yjs (Uint8Array) avec tweetnacl secretbox.
 * Format : [nonce (24 bytes)] + [ciphertext]
 */
function encryptUpdate(update: Uint8Array, key: Uint8Array): Uint8Array {
  const nonce = randomBytes(secretbox.nonceLength);
  const encrypted = secretbox(update, nonce, key);

  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce, 0);
  combined.set(encrypted, nonce.length);
  return combined;
}

/**
 * Déchiffre un update Yjs chiffré par encryptUpdate.
 * Retourne null si le déchiffrement échoue (données corrompues ou en clair).
 */
function decryptUpdate(data: Uint8Array, key: Uint8Array): Uint8Array | null {
  try {
    if (data.length <= secretbox.nonceLength) return null;
    const nonce = data.slice(0, secretbox.nonceLength);
    const ciphertext = data.slice(secretbox.nonceLength);
    return secretbox.open(ciphertext, nonce, key);
  } catch {
    return null;
  }
}

// ============================================================================
// DÉTECTION DES DONNÉES CHIFFRÉES
// ============================================================================

// Marqueur magique : premier byte des données chiffrées
// XSalsa20 produit des bytes aléatoires, on utilise un marqueur dans l'update
// Pour distinguer les updates chiffrés des updates en clair (migration)
const MAGIC_BYTE = 0xE2; // arbitraire, peu probable en tête d'un update Yjs valide

function isEncryptedUpdate(data: Uint8Array): boolean {
  return data.length > 1 && data[0] === MAGIC_BYTE && data[1] === MAGIC_BYTE;
}

function wrapEncryptedUpdate(encrypted: Uint8Array): Uint8Array {
  const wrapped = new Uint8Array(2 + encrypted.length);
  wrapped[0] = MAGIC_BYTE;
  wrapped[1] = MAGIC_BYTE;
  wrapped.set(encrypted, 2);
  return wrapped;
}

function unwrapEncryptedUpdate(wrapped: Uint8Array): Uint8Array {
  return wrapped.slice(2);
}

// ============================================================================
// FETCH / STORE AVEC CHIFFREMENT
// ============================================================================

type BeforeCallback = (updatesStore: IDBObjectStore) => void;
type AfterCallback = (updatesStore: IDBObjectStore) => void;

function fetchUpdatesEncrypted(
  persistence: EncryptedIndexeddbPersistence,
  beforeApplyUpdatesCallback: BeforeCallback = () => {},
  afterApplyUpdatesCallback: AfterCallback = () => {}
): Promise<IDBObjectStore> {
  const [updatesStore] = idb.transact(
    persistence.db as IDBDatabase,
    [UPDATES_STORE_NAME]
  );

  return idb.getAll(updatesStore, idb.createIDBKeyRangeLowerBound(persistence._dbref, false))
    .then((rawUpdates: Uint8Array[]) => {
      if (!persistence._destroyed) {
        beforeApplyUpdatesCallback(updatesStore);

        Y.transact(persistence.doc, () => {
          rawUpdates.forEach(raw => {
            let update: Uint8Array | null = raw;

            // Déchiffrer si nécessaire
            if (persistence._encryptionKey && isEncryptedUpdate(raw)) {
              update = decryptUpdate(unwrapEncryptedUpdate(raw), persistence._encryptionKey);
            }

            if (update) {
              Y.applyUpdate(persistence.doc, update);
            }
          });
        }, persistence, false);

        afterApplyUpdatesCallback(updatesStore);
      }
    })
    .then(() => idb.getLastKey(updatesStore).then((lastKey: number) => {
      persistence._dbref = lastKey + 1;
    }))
    .then(() => idb.count(updatesStore).then((cnt: number) => {
      persistence._dbsize = cnt;
    }))
    .then(() => updatesStore);
}

function storeStateEncrypted(
  persistence: EncryptedIndexeddbPersistence,
  forceStore = true
): Promise<void> {
  return fetchUpdatesEncrypted(persistence).then(updatesStore => {
    if (forceStore || persistence._dbsize >= PREFERRED_TRIM_SIZE) {
      // Compresser en un seul snapshot
      let snapshot = Y.encodeStateAsUpdate(persistence.doc);

      // Chiffrer le snapshot si clé disponible
      if (persistence._encryptionKey) {
        const encrypted = encryptUpdate(snapshot, persistence._encryptionKey);
        snapshot = wrapEncryptedUpdate(encrypted);
      }

      idb.addAutoKey(updatesStore, snapshot as unknown as ArrayBuffer)
        .then(() => idb.del(updatesStore, idb.createIDBKeyRangeUpperBound(persistence._dbref, true)))
        .then(() => idb.count(updatesStore).then((cnt: number) => {
          persistence._dbsize = cnt;
        }));
    }
  });
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class EncryptedIndexeddbPersistence extends Observable<string> {
  readonly doc: Y.Doc;
  readonly name: string;
  /** Clé de chiffrement (32 bytes). Null = mode non chiffré (compatible y-indexeddb) */
  readonly _encryptionKey: Uint8Array | null;

  _dbref: number = 0;
  _dbsize: number = 0;
  _destroyed: boolean = false;
  db: IDBDatabase | null = null;
  synced: boolean = false;

  readonly whenSynced: Promise<EncryptedIndexeddbPersistence>;

  private _db: Promise<IDBDatabase>;
  private _storeTimeout: number = 1000;
  private _storeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _storeUpdate: (update: Uint8Array, origin: unknown) => void;

  constructor(name: string, doc: Y.Doc, encryptionKey?: Uint8Array) {
    super();

    this.doc = doc;
    this.name = name;
    this._encryptionKey = encryptionKey || null;

    this._db = idb.openDB(name, (db: IDBDatabase) =>
      idb.createStores(db, [
        [UPDATES_STORE_NAME, { autoIncrement: true }],
        [CUSTOM_STORE_NAME],
      ])
    );

    this.whenSynced = promise.create(
      (resolve: (value: EncryptedIndexeddbPersistence) => void) =>
        this.on('synced', () => resolve(this))
    );

    this._db.then(db => {
      this.db = db;

      const beforeApplyUpdatesCallback = (updatesStore: IDBObjectStore) => {
        // Stocker l'état courant avant d'appliquer les updates de la DB
        let currentState = Y.encodeStateAsUpdate(doc);
        if (this._encryptionKey) {
          const encrypted = encryptUpdate(currentState, this._encryptionKey);
          currentState = wrapEncryptedUpdate(encrypted);
        }
        idb.addAutoKey(updatesStore, currentState as unknown as ArrayBuffer);
      };

      const afterApplyUpdatesCallback = () => {
        if (this._destroyed) return;
        this.synced = true;
        this.emit('synced', [this]);
      };

      fetchUpdatesEncrypted(this, beforeApplyUpdatesCallback, afterApplyUpdatesCallback);
    });

    this._storeUpdate = (update: Uint8Array, origin: unknown) => {
      if (this.db && origin !== this) {
        const [updatesStore] = idb.transact(
          this.db as IDBDatabase,
          [UPDATES_STORE_NAME]
        );

        // Chiffrer l'update avant stockage
        let dataToStore = update;
        if (this._encryptionKey) {
          const encrypted = encryptUpdate(update, this._encryptionKey);
          dataToStore = wrapEncryptedUpdate(encrypted);
        }

        idb.addAutoKey(updatesStore, dataToStore as unknown as ArrayBuffer);

        if (++this._dbsize >= PREFERRED_TRIM_SIZE) {
          if (this._storeTimeoutId !== null) {
            clearTimeout(this._storeTimeoutId);
          }
          this._storeTimeoutId = setTimeout(() => {
            storeStateEncrypted(this, false);
            this._storeTimeoutId = null;
          }, this._storeTimeout);
        }
      }
    };

    doc.on('update', this._storeUpdate);
    this.destroy = this.destroy.bind(this);
    doc.on('destroy', this.destroy);
  }

  destroy(): Promise<void> {
    if (this._storeTimeoutId) {
      clearTimeout(this._storeTimeoutId);
    }
    this.doc.off('update', this._storeUpdate);
    this.doc.off('destroy', this.destroy);
    this._destroyed = true;
    return this._db.then(db => {
      db.close();
    });
  }

  clearData(): Promise<void> {
    return this.destroy().then(() => {
      idb.deleteDB(this.name);
    });
  }

  get(key: string | number | ArrayBuffer | Date): Promise<unknown> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [CUSTOM_STORE_NAME], 'readonly');
      return idb.get(custom, key);
    });
  }

  set(
    key: string | number | ArrayBuffer | Date,
    value: string | number | ArrayBuffer | Date
  ): Promise<unknown> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [CUSTOM_STORE_NAME]);
      return idb.put(custom, value, key);
    });
  }

  del(key: string | number | ArrayBuffer | Date): Promise<void> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [CUSTOM_STORE_NAME]);
      return idb.del(custom, key);
    });
  }
}

// ============================================================================
// MIGRATION : base en clair → base chiffrée
// ============================================================================

/**
 * Migre une base y-indexeddb existante en clair vers un format chiffré.
 * Lit tous les updates, les supprime, et les réécrit chiffrés.
 *
 * @param dbName - Nom de la base IndexedDB (ex: "zeroneurone-ydoc-{uuid}")
 * @param encryptionKey - Clé de chiffrement (32 bytes)
 */
export async function migrateToEncrypted(
  dbName: string,
  encryptionKey: Uint8Array
): Promise<void> {
  const db = await idb.openDB(dbName, (db: IDBDatabase) =>
    idb.createStores(db, [
      [UPDATES_STORE_NAME, { autoIncrement: true }],
      [CUSTOM_STORE_NAME],
    ])
  );

  return new Promise((resolve, reject) => {
    const tx = db.transaction([UPDATES_STORE_NAME], 'readwrite');
    const store = tx.objectStore(UPDATES_STORE_NAME);

    const getReq = store.getAll();
    getReq.onsuccess = () => {
      const updates: Uint8Array[] = getReq.result;

      // Supprimer tous les updates existants
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        // Ré-écrire chiffrés
        for (const update of updates) {
          // Ne pas re-chiffrer si déjà chiffré
          if (!isEncryptedUpdate(update)) {
            const encrypted = encryptUpdate(update, encryptionKey);
            store.add(wrapEncryptedUpdate(encrypted));
          } else {
            store.add(update);
          }
        }
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Migre une base chiffrée vers un format en clair (désactivation du chiffrement).
 */
export async function migrateToPlaintext(
  dbName: string,
  encryptionKey: Uint8Array
): Promise<void> {
  const db = await idb.openDB(dbName, (db: IDBDatabase) =>
    idb.createStores(db, [
      [UPDATES_STORE_NAME, { autoIncrement: true }],
      [CUSTOM_STORE_NAME],
    ])
  );

  return new Promise((resolve, reject) => {
    const tx = db.transaction([UPDATES_STORE_NAME], 'readwrite');
    const store = tx.objectStore(UPDATES_STORE_NAME);

    const getReq = store.getAll();
    getReq.onsuccess = () => {
      const updates: Uint8Array[] = getReq.result;

      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const update of updates) {
          if (isEncryptedUpdate(update)) {
            const decrypted = decryptUpdate(unwrapEncryptedUpdate(update), encryptionKey);
            if (decrypted) {
              store.add(decrypted);
            }
          } else {
            store.add(update);
          }
        }
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
