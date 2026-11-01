/**
 * Encryption middleware for Dexie v4 (DBCore API)
 *
 * Encrypts the non-indexed fields of each table before writing to IndexedDB
 * and decrypts them on read. Indexes (UUIDs, timestamps) stay in plaintext
 * so queries keep working.
 *
 * Uses tweetnacl secretbox (XSalsa20-Poly1305) — synchronous, fast, compatible
 * with IndexedDB transactions (no async inside IDB transactions).
 *
 * Usage:
 *   const middleware = createEncryptionMiddleware(dek, encryptedTableNames);
 *   db.use(middleware);
 */

import { secretbox, randomBytes } from 'tweetnacl';
import type { DBCore, DBCoreTable, DBCoreMutateRequest, Middleware } from 'dexie';

// ============================================================================
// ENCRYPTION / DECRYPTION (tweetnacl secretbox)
// ============================================================================

/**
 * Encrypts a JSON value with tweetnacl secretbox.
 * Result layout: [nonce (24 bytes)] + [ciphertext]
 */
function encryptValue(value: unknown, key: Uint8Array): string {
  const nonce = randomBytes(secretbox.nonceLength);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = secretbox(data, nonce, key);

  // nonce + ciphertext in a single Uint8Array
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  // Base64 for IndexedDB storage
  // Note: String.fromCharCode(...combined) would overflow the stack on large payloads.
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

/**
 * Decrypts a value encrypted by encryptValue.
 * Returns null when decryption fails (corrupted or unencrypted data).
 */
function decryptValue(encrypted: string, key: Uint8Array): unknown {
  try {
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const nonce = combined.slice(0, secretbox.nonceLength);
    const ciphertext = combined.slice(secretbox.nonceLength);

    const decrypted = secretbox.open(ciphertext, nonce, key);
    if (!decrypted) return null;

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

// ============================================================================
// ENCRYPTION MARKER
// ============================================================================

// Prefix added to encrypted fields to identify them
// and avoid trying to decrypt plaintext data (migration)
const ENCRYPTED_PREFIX = '__zn_enc__:';

function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

function wrapEncrypted(ciphertext: string): string {
  return ENCRYPTED_PREFIX + ciphertext;
}

function unwrapEncrypted(value: string): string {
  return value.slice(ENCRYPTED_PREFIX.length);
}

// ============================================================================
// FIELDS TO ENCRYPT
// ============================================================================

/**
 * Determines which fields of an object must be encrypted.
 * Encrypts everything except:
 * - fields that are table indexes (passed as excludedFields)
 * - undefined/null fields (nothing to encrypt)
 */
function getEncryptableFields(
  obj: Record<string, unknown>,
  excludedFields: Set<string>
): string[] {
  return Object.keys(obj).filter(
    key => !excludedFields.has(key) && obj[key] !== undefined && obj[key] !== null
  );
}

// ============================================================================
// OBJECT ENCRYPTION
// ============================================================================

function encryptObject(
  obj: Record<string, unknown>,
  key: Uint8Array,
  excludedFields: Set<string>
): Record<string, unknown> {
  const result = { ...obj };
  const fieldsToEncrypt = getEncryptableFields(obj, excludedFields);

  for (const field of fieldsToEncrypt) {
    const value = obj[field];
    if (value !== undefined && value !== null) {
      result[field] = wrapEncrypted(encryptValue(value, key));
    }
  }

  return result;
}

export function decryptObject(
  obj: Record<string, unknown>,
  key: Uint8Array,
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const result = { ...obj };

  for (const field of Object.keys(obj)) {
    let value = obj[field];
    // Loop to undo double encryption (v8 migration artifact:
    // investigations not in DEFAULT_ENCRYPTED_TABLES → raw read,
    // write to dossiers → encrypted again by the middleware)
    while (isEncrypted(value)) {
      const decrypted = decryptValue(unwrapEncrypted(value as string), key);
      if (decrypted === null) break; // keep encrypted on failure
      value = decrypted;
    }
    result[field] = value;
  }

  return result;
}

// ============================================================================
// INDEXED FIELDS (primary key and indexes, excluded from encryption)
// ============================================================================

function extractIndexedFields(schema: { primaryKey: { keyPath: string | string[] | null }; indexes: Array<{ keyPath: string | string[] | null }> }): Set<string> {
  const fields = new Set<string>();

  // Primary key
  const pk = schema.primaryKey.keyPath;
  if (typeof pk === 'string') {
    fields.add(pk);
  } else if (Array.isArray(pk)) {
    pk.forEach(f => fields.add(f));
  }

  // Index
  for (const index of schema.indexes) {
    const kp = index.keyPath;
    if (typeof kp === 'string') {
      fields.add(kp);
    } else if (Array.isArray(kp)) {
      kp.forEach(f => fields.add(f));
    }
  }

  return fields;
}

// ============================================================================
// MIDDLEWARE DEXIE V4
// ============================================================================

/**
 * Creates a DBCore middleware that encrypts/decrypts the non-indexed fields
 * of the given tables.
 *
 * @param dek - Data Encryption Key (Uint8Array 32 bytes, tweetnacl)
 * @param encryptedTables - Names of the tables to encrypt (all when omitted)
 */
export function createEncryptionMiddleware(
  dek: Uint8Array,
  encryptedTables?: Set<string>
): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'ZeroNeuroneEncryption',
    create(down: DBCore): DBCore {
      return {
        ...down,
        table(tableName: string): DBCoreTable {
          const downTable = down.table(tableName);

          // Do not encrypt the internal metadata tables
          // or the unlisted tables
          if (
            tableName === '_encryptionMeta' ||
            (encryptedTables && !encryptedTables.has(tableName))
          ) {
            return downTable;
          }

          const schema = downTable.schema;
          const excludedFields = extractIndexedFields(schema);

          return {
            ...downTable,

            // ----------------------------------------------------------------
            // WRITE: encrypt before storing
            // ----------------------------------------------------------------
            async mutate(req: DBCoreMutateRequest) {
              if (req.type === 'add' || req.type === 'put') {
                const encryptedValues = (req.values as Record<string, unknown>[]).map(
                  value => encryptObject(value as Record<string, unknown>, dek, excludedFields)
                );
                return downTable.mutate({ ...req, values: encryptedValues } as DBCoreMutateRequest);
              }
              return downTable.mutate(req);
            },

            // ----------------------------------------------------------------
            // READ: decrypt after fetching
            // ----------------------------------------------------------------
            async get(req) {
              const result = await downTable.get(req);
              if (!result) return result;
              return decryptObject(result as Record<string, unknown>, dek);
            },

            async getMany(req) {
              const results = await downTable.getMany(req);
              return results.map(r =>
                r ? decryptObject(r as Record<string, unknown>, dek) : r
              );
            },

            async query(req) {
              const response = await downTable.query(req);
              return {
                ...response,
                result: response.result.map(r =>
                  r ? decryptObject(r as Record<string, unknown>, dek) : r
                ),
              };
            },

            async openCursor(req) {
              const cursor = await downTable.openCursor(req);
              if (!cursor) return null;

              // Cursor wrapper that decrypts on the fly.
              // A Proxy intercepts only 'value'
              // and passes every other property through to the original cursor.
              return new Proxy(cursor, {
                get(target, prop) {
                  if (prop === 'value') {
                    const raw = target.value as Record<string, unknown>;
                    return raw ? decryptObject(raw, dek) : raw;
                  }
                  const val = target[prop as keyof typeof target];
                  return typeof val === 'function' ? val.bind(target) : val;
                },
              });
            },
          };
        },
      };
    },
  };
}

// ============================================================================
// TABLES TO ENCRYPT (default configuration)
// ============================================================================

/**
 * Creates an encryption middleware meant for an external Dexie instance
 * (e.g. a plugin). Same algorithm as createEncryptionMiddleware,
 * with an explicit table list.
 *
 * The DEK is never exposed — it stays inside the closure of the
 * returned middleware.
 */
export { createEncryptionMiddleware as createEncryptionMiddlewareForDexie };

/**
 * Tables holding personal data.
 * Technical tables (_encryptionMeta, tagSets) are not encrypted.
 */
export const DEFAULT_ENCRYPTED_TABLES = new Set([
  'dossiers',
  'elements',
  'links',
  'assets',
  'views',
  'reports',
  'canvasTabs',
  'pluginData',
  'comments',
]);
