/**
 * Middleware de chiffrement pour Dexie v4 (DBCore API)
 *
 * Chiffre les champs non-indexés de chaque table avant l'écriture dans IndexedDB
 * et les déchiffre à la lecture. Les index (UUIDs, timestamps) restent en clair
 * pour permettre les requêtes.
 *
 * Utilise tweetnacl secretbox (XSalsa20-Poly1305) — synchrone, rapide, compatible
 * avec les transactions IndexedDB (pas d'async dans les transactions IDB).
 *
 * Usage :
 *   const middleware = createEncryptionMiddleware(dek, encryptedTableNames);
 *   db.use(middleware);
 */

import { secretbox, randomBytes } from 'tweetnacl';
import type { DBCore, DBCoreTable, DBCoreMutateRequest, Middleware } from 'dexie';

// ============================================================================
// CHIFFREMENT / DÉCHIFFREMENT (tweetnacl secretbox)
// ============================================================================

/**
 * Chiffre un objet JSON avec tweetnacl secretbox.
 * Format du résultat : [nonce (24 bytes)] + [ciphertext]
 */
function encryptValue(value: unknown, key: Uint8Array): string {
  const nonce = randomBytes(secretbox.nonceLength);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = secretbox(data, nonce, key);

  // Stocker nonce + ciphertext dans un seul Uint8Array
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  // Encoder en base64 pour le stockage IndexedDB
  // Note : String.fromCharCode(...combined) planterait (stack overflow) sur de grands payloads.
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

/**
 * Déchiffre une valeur chiffrée par encryptValue.
 * Retourne null si le déchiffrement échoue (données corrompues ou non chiffrées).
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
// MARQUEUR DE CHIFFREMENT
// ============================================================================

// Préfixe ajouté aux champs chiffrés pour les identifier facilement
// et éviter de tenter de déchiffrer des données en clair (migration)
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
// DÉTECTION DES CHAMPS À CHIFFRER
// ============================================================================

/**
 * Détermine quels champs d'un objet doivent être chiffrés.
 * Chiffre tout sauf :
 * - Les champs qui sont des index de la table (passés en excludedFields)
 * - Les champs undefined/null (inutile de chiffrer)
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
// CHIFFREMENT D'UN OBJET
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
    const value = obj[field];
    if (isEncrypted(value)) {
      const decrypted = decryptValue(unwrapEncrypted(value as string), key);
      result[field] = decrypted !== null ? decrypted : value; // garder chiffré si échec
    }
  }

  return result;
}

// ============================================================================
// EXTRACTION DES CHAMPS INDEXÉS (excluant la clé primaire et les index)
// ============================================================================

function extractIndexedFields(schema: { primaryKey: { keyPath: string | string[] | null }; indexes: Array<{ keyPath: string | string[] | null }> }): Set<string> {
  const fields = new Set<string>();

  // Clé primaire
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
 * Crée un middleware DBCore qui chiffre/déchiffre les champs non-indexés
 * des tables spécifiées.
 *
 * @param dek - Data Encryption Key (Uint8Array 32 bytes, tweetnacl)
 * @param encryptedTables - Noms des tables à chiffrer (toutes si non spécifié)
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

          // Ne pas chiffrer les tables de métadonnées internes
          // ou les tables non listées
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
            // ÉCRITURE : chiffrer avant de stocker
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
            // LECTURE : déchiffrer après récupération
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

              // Wrapper sur le curseur pour déchiffrer à la volée.
              // On utilise un Proxy pour intercepter uniquement 'value'
              // et laisser toutes les autres propriétés passer au curseur original.
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
// TABLES À CHIFFRER (configuration par défaut)
// ============================================================================

/**
 * Crée un middleware de chiffrement destiné à être appliqué sur une instance
 * Dexie externe (ex. un plugin). Même algorithme que createEncryptionMiddleware,
 * avec une liste de tables explicite.
 *
 * La DEK ne transite pas en clair — elle est encapsulée dans la closure du
 * middleware retourné.
 */
export { createEncryptionMiddleware as createEncryptionMiddlewareForDexie };

/**
 * Tables qui contiennent des données à caractère personnel.
 * Les tables techniques (_encryptionMeta, tagSets) ne sont pas chiffrées.
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
]);
