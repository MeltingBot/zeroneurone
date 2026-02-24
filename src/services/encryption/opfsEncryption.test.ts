import { describe, it, expect } from 'vitest';
import { encryptOpfsBuffer, decryptOpfsBuffer, isOpfsEncrypted } from './opfsEncryption';

function makeDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function makeBuffer(size: number): ArrayBuffer {
  const buf = new ArrayBuffer(size);
  const view = new Uint8Array(buf);
  // crypto.getRandomValues est limité à 65 536 bytes par appel en Node
  const CHUNK = 65_536;
  for (let offset = 0; offset < size; offset += CHUNK) {
    crypto.getRandomValues(view.subarray(offset, Math.min(offset + CHUNK, size)));
  }
  return buf;
}

// ============================================================================
// isOpfsEncrypted
// ============================================================================

describe('isOpfsEncrypted', () => {
  it('retourne false pour un buffer vide', () => {
    expect(isOpfsEncrypted(new ArrayBuffer(0))).toBe(false);
  });

  it('retourne false pour un buffer trop court (< 14 bytes)', () => {
    expect(isOpfsEncrypted(new ArrayBuffer(10))).toBe(false);
  });

  it('retourne false pour un buffer en clair', () => {
    const buf = makeBuffer(100);
    // S'assurer que les 2 premiers bytes ne sont pas 0xE3 0xE3 (quasi-impossible)
    new Uint8Array(buf)[0] = 0x00;
    new Uint8Array(buf)[1] = 0x00;
    expect(isOpfsEncrypted(buf)).toBe(false);
  });

  it('retourne true pour un buffer chiffré (magic bytes 0xE3 0xE3)', async () => {
    const dek = makeDek();
    const plain = makeBuffer(100);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    expect(isOpfsEncrypted(encrypted)).toBe(true);
  });
});

// ============================================================================
// encryptOpfsBuffer / decryptOpfsBuffer
// ============================================================================

describe('encryptOpfsBuffer + decryptOpfsBuffer', () => {
  it('round-trip : déchiffrement retourne le plaintext original', async () => {
    const dek = makeDek();
    const plain = makeBuffer(256);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    const decrypted = await decryptOpfsBuffer(dek, encrypted);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plain));
  });

  it('le buffer chiffré est plus grand que le plaintext (magic + iv + tag)', async () => {
    const dek = makeDek();
    const plain = makeBuffer(100);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    // 2 (magic) + 12 (iv) + 16 (AES-GCM tag) = 30 bytes de overhead
    expect(encrypted.byteLength).toBe(plain.byteLength + 2 + 12 + 16);
  });

  it('deux chiffrements du même plaintext produisent des résultats différents (IV aléatoire)', async () => {
    const dek = makeDek();
    const plain = makeBuffer(64);
    const e1 = await encryptOpfsBuffer(dek, plain);
    const e2 = await encryptOpfsBuffer(dek, plain);
    expect(new Uint8Array(e1)).not.toEqual(new Uint8Array(e2));
  });

  it('déchiffrement échoue avec une DEK incorrecte', async () => {
    const dek = makeDek();
    const wrongDek = makeDek();
    const plain = makeBuffer(64);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    await expect(decryptOpfsBuffer(wrongDek, encrypted)).rejects.toThrow();
  });

  it('décryptOpfsBuffer lève une erreur sur un buffer sans magic header', async () => {
    const dek = makeDek();
    const plain = makeBuffer(100);
    await expect(decryptOpfsBuffer(dek, plain)).rejects.toThrow('magic header');
  });

  it('fonctionne sur un buffer vide', async () => {
    const dek = makeDek();
    const plain = new ArrayBuffer(0);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    const decrypted = await decryptOpfsBuffer(dek, encrypted);
    expect(decrypted.byteLength).toBe(0);
  });

  it('fonctionne sur un grand fichier (500 KB)', async () => {
    const dek = makeDek();
    const plain = makeBuffer(500 * 1024);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    const decrypted = await decryptOpfsBuffer(dek, encrypted);
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plain));
  }, 15_000);
});

// ============================================================================
// Idempotence / migration
// ============================================================================

describe('idempotence migration', () => {
  it('isOpfsEncrypted + skip si déjà chiffré (pattern migrationService)', async () => {
    const dek = makeDek();
    const plain = makeBuffer(64);
    const encrypted = await encryptOpfsBuffer(dek, plain);

    // Simuler le check dans migrateOpfsToEncrypted
    if (isOpfsEncrypted(encrypted)) {
      // Skip — déjà chiffré
      expect(true).toBe(true);
    } else {
      throw new Error('Aurait dû être détecté comme chiffré');
    }
  });

  it('isOpfsEncrypted retourne false sur le plaintext déchiffré', async () => {
    const dek = makeDek();
    const plain = makeBuffer(64);
    const encrypted = await encryptOpfsBuffer(dek, plain);
    const decrypted = await decryptOpfsBuffer(dek, encrypted);
    new Uint8Array(decrypted)[0] = 0x00; // S'assurer que pas de magic bytes
    expect(isOpfsEncrypted(decrypted)).toBe(false);
  });
});
