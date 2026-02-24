import { describe, it, expect } from 'vitest';
import {
  initializeEncryption,
  unlockEncryption,
  changePassword,
  type EncryptionMeta,
} from './encryptionService';

// ============================================================================
// initializeEncryption
// ============================================================================

describe('initializeEncryption', () => {
  it('retourne une DEK de 32 bytes', async () => {
    const { dek } = await initializeEncryption('motdepasse');
    expect(dek).toBeInstanceOf(Uint8Array);
    expect(dek.byteLength).toBe(32);
  });

  it('retourne un meta version 2 avec les champs requis', async () => {
    const { meta } = await initializeEncryption('motdepasse');
    expect(meta.id).toBe('main');
    expect(meta.version).toBe(2);
    expect(meta.salt).toBeInstanceOf(ArrayBuffer);
    expect(meta.encryptedDEK).toBeInstanceOf(ArrayBuffer);
    expect(meta.dekIV).toBeInstanceOf(ArrayBuffer);
    expect(meta.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('génère un sel différent à chaque appel (pas de DEK prédictible)', async () => {
    const { meta: m1 } = await initializeEncryption('motdepasse');
    const { meta: m2 } = await initializeEncryption('motdepasse');
    const s1 = new Uint8Array(m1.salt);
    const s2 = new Uint8Array(m2.salt);
    expect(s1).not.toEqual(s2);
  });
});

// ============================================================================
// unlockEncryption
// ============================================================================

describe('unlockEncryption', () => {
  it('déchiffre la DEK avec le bon mot de passe', async () => {
    const { meta, dek: originalDek } = await initializeEncryption('secret');
    const { dek } = await unlockEncryption(meta, 'secret');
    expect(dek).toEqual(originalDek);
  });

  it('lève une erreur avec un mauvais mot de passe', async () => {
    const { meta } = await initializeEncryption('secret');
    await expect(unlockEncryption(meta, 'mauvais')).rejects.toThrow('Mot de passe incorrect');
  });

  it('ne retourne pas upgradedMeta pour un meta v2 (déjà à jour)', async () => {
    const { meta } = await initializeEncryption('secret');
    expect(meta.version).toBe(2);
    const { upgradedMeta } = await unlockEncryption(meta, 'secret');
    expect(upgradedMeta).toBeNull();
  });

  it('retourne upgradedMeta pour un meta v1 (legacy 100K itérations)', async () => {
    // Simuler un meta v1 en dérivant avec 100 000 itérations manuellement
    const password = 'ancien-motdepasse';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const dek = crypto.getRandomValues(new Uint8Array(32));

    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const kek = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt.buffer, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedDEK = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dek.buffer);

    const metaV1: EncryptionMeta = {
      id: 'main',
      salt: salt.buffer,
      encryptedDEK,
      dekIV: iv.buffer,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    const { dek: unlocked, upgradedMeta } = await unlockEncryption(metaV1, password);

    // La DEK doit être identique
    expect(unlocked).toEqual(dek);

    // Le meta doit être mis à jour en v2
    expect(upgradedMeta).not.toBeNull();
    expect(upgradedMeta!.version).toBe(2);

    // Le meta upgradé doit être déverrouillable avec le même mot de passe
    const { dek: reUnlocked, upgradedMeta: noUpgrade } = await unlockEncryption(upgradedMeta!, password);
    expect(reUnlocked).toEqual(dek);
    expect(noUpgrade).toBeNull();
  });
});

// ============================================================================
// changePassword
// ============================================================================

describe('changePassword', () => {
  it('permet de déverrouiller avec le nouveau mot de passe', async () => {
    const { meta, dek: originalDek } = await initializeEncryption('ancien');
    const newMeta = await changePassword(meta, 'ancien', 'nouveau');
    const { dek } = await unlockEncryption(newMeta, 'nouveau');
    expect(dek).toEqual(originalDek);
  });

  it('refuse l\'ancien mot de passe après changement', async () => {
    const { meta } = await initializeEncryption('ancien');
    const newMeta = await changePassword(meta, 'ancien', 'nouveau');
    await expect(unlockEncryption(newMeta, 'ancien')).rejects.toThrow('Mot de passe incorrect');
  });

  it('lève une erreur si l\'ancien mot de passe est incorrect', async () => {
    const { meta } = await initializeEncryption('correct');
    await expect(changePassword(meta, 'incorrect', 'nouveau')).rejects.toThrow('Mot de passe incorrect');
  });

  it('écrit toujours en version courante (v2)', async () => {
    const { meta } = await initializeEncryption('ancien');
    const newMeta = await changePassword(meta, 'ancien', 'nouveau');
    expect(newMeta.version).toBe(2);
  });

  it('génère un nouveau sel à chaque changement de mot de passe', async () => {
    const { meta } = await initializeEncryption('mdp');
    const newMeta1 = await changePassword(meta, 'mdp', 'nouveau');
    const newMeta2 = await changePassword(meta, 'mdp', 'nouveau');
    expect(new Uint8Array(newMeta1.salt)).not.toEqual(new Uint8Array(newMeta2.salt));
  });
});

// ============================================================================
// Round-trip complet
// ============================================================================

describe('round-trip init → unlock → changePassword → unlock', () => {
  it('la DEK est cohérente sur tout le cycle', async () => {
    const { meta, dek: originalDek } = await initializeEncryption('pass1');
    const { dek: dek1 } = await unlockEncryption(meta, 'pass1');
    expect(dek1).toEqual(originalDek);

    const newMeta = await changePassword(meta, 'pass1', 'pass2');
    const { dek: dek2 } = await unlockEncryption(newMeta, 'pass2');
    expect(dek2).toEqual(originalDek);
  });
});
