# ZeroNeurone At-Rest Encryption

This document describes the architecture, cryptographic primitives, and lifecycle of ZeroNeurone's at-rest encryption.

## Why At-Rest Encryption

ZeroNeurone stores potentially sensitive dossiers (people, organizations, locations, documents) in IndexedDB and OPFS. These databases are readable by any script of the same origin, and accessible in plaintext via browser DevTools.

At-rest encryption ensures data is unreadable without the password — even if someone has access to the browser profile on the machine.

**What encryption protects:**
- Dossier content (elements, links, assets, reports, views)
- Attached files (OPFS)
- Collaboration Yjs documents (y-indexeddb)
- Plugin-stored data (`pluginData`)

**What encryption does not protect:**
- Data in memory during an active unlocked session
- ZIP exports (separately protected by password if the option is enabled)
- Configuration (`tagSets`, `_encryptionMeta`)

---

## Key Architecture

```
User password
      │
      ▼
PBKDF2-SHA256
600,000 iterations
random 128-bit salt
      │
      ▼
KEK (Key Encryption Key)
AES-256-GCM
      │
      ▼ encrypts
DEK (Data Encryption Key)
256 bits, generated once
      │
      ▼
XSalsa20-Poly1305 (tweetnacl secretbox)
encrypts each non-indexed field
```

### DEK — Data Encryption Key

- Generated once at encryption activation (`crypto.getRandomValues`)
- 256 bits (32 bytes)
- Stored **encrypted** in the `_encryptionMeta` IndexedDB table
- Present in memory only during an unlocked session
- Erased on browser close or session lock (Alt+L)

**Changing the password** = re-encrypting the DEK with the new KEK. Data is never re-encrypted when the password changes.

### KEK — Key Encryption Key

- Derived from the password via **PBKDF2-SHA256**
- 600,000 iterations (NIST SP 800-132 recommendation, 2023) — schema v2
- Random 128-bit salt, generated at activation, stored in plaintext in `_encryptionMeta`
- Used only to encrypt/decrypt the DEK, never for data
- Never retained in memory after unlocking

### PBKDF2 Schema Migrations

| Version | Iterations | Status |
|---------|-----------|--------|
| v1 | 100,000 | Legacy — auto-upgraded on next unlock |
| v2 | 600,000 | Current (NIST SP 800-132, 2023) |

The upgrade is silent: on first unlock of a v1 meta, ZN re-encrypts the DEK with 600,000 iterations and persists the new meta.

---

## Dexie Data Encryption

### DBCore Middleware

Encryption is implemented as a Dexie v4 middleware (the `DBCore` interface). It intercepts all IndexedDB transactions in the processing chain.

**On write (`mutate`):** each non-indexed field of the object is individually encrypted with `secretbox` (XSalsa20-Poly1305). Indexed fields (UUIDs, timestamps) remain in plaintext to allow Dexie queries.

**On read (`get`, `getMany`, `query`, `openCursor`):** each encrypted field is decrypted on the fly. If a field is not encrypted (data created before activation), it is returned as-is — migration is idempotent.

**Storage format:** encrypted values are base64-encoded with the prefix `__zn_enc__:nonce+ciphertext`.

### Field Encryption Algorithm

```
secretbox (tweetnacl)
  = XSalsa20 (stream cipher)
  + Poly1305 (MAC authentication)

For each non-indexed field:
  nonce = 24 random bytes
  ciphertext = XSalsa20-Poly1305(JSON.stringify(value), nonce, DEK)
  stored = base64(nonce + ciphertext)
```

Tweetnacl is used for its **synchronous** nature — IndexedDB transactions do not allow async operations within their scope. Web Crypto API (async) is reserved for key derivation (PBKDF2, AES-GCM).

### Encrypted Tables

| Table | Content | Encrypted |
|-------|---------|-----------|
| `dossiers` | Dossier metadata | Yes |
| `elements` | Graph nodes | Yes |
| `links` | Element relationships | Yes |
| `assets` | Attached file metadata | Yes |
| `views` | Saved views | Yes |
| `reports` | Reports | Yes |
| `canvasTabs` | Canvas tabs | Yes |
| `pluginData` | Plugin data | Yes |
| `_encryptionMeta` | Salt + encrypted DEK | No (technical data) |
| `tagSets` | Tag type configuration | No (not sensitive) |

---

## OPFS File Encryption

Attached files (binary assets) stored in OPFS are encrypted separately using **AES-256-GCM** (Web Crypto API).

```
For each file:
  IV = 12 random bytes
  ciphertext = AES-256-GCM(binary_content, IV, DEK)
  stored = magic_header(4 bytes) + IV + ciphertext
```

The magic header allows detecting whether a file is already encrypted (idempotent migration).

---

## Yjs Document Encryption (y-indexeddb)

Each dossier has an IndexedDB database `zeroneurone-ydoc-{id}` containing Yjs updates for real-time collaboration. These databases are encrypted during migration, update by update, through their own encryption mechanism (a separate layer from the Dexie middleware).

---

## Lifecycle

### Enabling Encryption

```
User sets a password
  → DEK generation (random)
  → PBKDF2(password, salt) → KEK
  → AES-GCM.encrypt(DEK, KEK) → encrypted DEK
  → Store _encryptionMeta in Dexie
  → Dexie middleware installed (db.use())
  → Migration: bulkPut of all existing records
    (middleware encrypts on write)
  → OPFS + y-indexeddb migration
  → window.location.reload()
```

The reload is mandatory: Dexie must reopen the connection **after** the middleware is installed from the very start. Without a reload, transactions may have opened without the middleware.

### Startup (encryption active)

```
EncryptionGate reads _encryptionMeta via native IndexedDB
  (not via Dexie — avoids opening the connection without middleware)
  → Shows PasswordModal
  → User enters password
  → PBKDF2(password, salt) → KEK
  → AES-GCM.decrypt(encrypted DEK, KEK) → DEK
  → db.applyEncryption(DEK) — middleware installed
  → Dexie opens with middleware
  → App accessible
```

### Session Lock (Alt+L)

```
useEncryptionStore.lock()
  → DEK erased from memory
  → isLocked = true
  → PasswordModal displayed
  → Dexie inaccessible until unlocked
```

Locking does not close the Dexie connection but blocks all new requests via `isReady = false`.

### Password Change

```
Old password verification
  → PBKDF2(new_password, new_salt) → KEK2
  → AES-GCM.encrypt(DEK_in_memory, KEK2) → encrypted DEK2
  → Update _encryptionMeta
  (data is NOT re-encrypted)
```

### Disabling Encryption

```
Password verification
  → Read all data via Dexie (decrypted)
  → Rewrite via native IndexedDB (bypass middleware)
    (Dexie v4 has no unuse() — middleware cannot be removed)
  → OPFS + y-indexeddb migration to plaintext
  → Delete _encryptionMeta
  → window.location.reload()
```

---

## Security Properties

| Property | Value |
|----------|-------|
| Data algorithm | XSalsa20-Poly1305 (tweetnacl secretbox) |
| File algorithm | AES-256-GCM |
| Key derivation | PBKDF2-SHA256, 600,000 iterations |
| DEK size | 256 bits |
| PBKDF2 salt size | 128 bits |
| XSalsa20 nonce size | 192 bits (24 bytes) |
| AES-GCM IV size | 96 bits (12 bytes) |
| Authentication | Yes (Poly1305 + GCM) |
| Forward secrecy | No (fixed DEK per activation) |
| Raw DEK storage | Never (neither disk nor localStorage) |

**Brute-force resistance:** 600,000 PBKDF2 iterations ≈ 600 ms per attempt on modern CPU → ~1.5 attempts/second → ~1.3×10⁹ years for 8 random characters (95-char set).

---

## What Encryption Does Not Do

- **No protection against an attacker with an open session** — the DEK is in memory; content is readable in DevTools.
- **No index protection** — UUIDs and timestamps are in plaintext to allow queries. An attacker knowing the DB schema can count elements, see dates.
- **No `tagSets` encryption** — user-defined tag types are not considered sensitive.
- **No forward secrecy** — if the password is compromised, all historical data can be decrypted (the DEK does not change).
- **No protection against a malicious extension** — browser extensions of the same origin have access to IndexedDB.

---

## Encrypted ZIP Export

ZIP export has an independent encryption option: the ZIP contents are password-encrypted (AES-256-CTR via JSZip). This encryption is orthogonal to at-rest encryption: an export from an encrypted instance produces an encrypted ZIP containing plaintext data (decrypted for export).
