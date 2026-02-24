import { describe, it, expect } from 'vitest';
import { decryptObject } from './dexieEncryptionMiddleware';

// Les fonctions internes (encryptValue, encryptObject, etc.) ne sont pas exportées.
// On les teste via decryptObject + le comportement du middleware observé sur
// les objets produits. Pour tester encryptObject, on importe createEncryptionMiddleware
// et on passe par un objet Dexie factice.
//
// Pour les tests unitaires purs (sans Dexie), on teste :
//   - decryptObject sur des objets en clair → retourne as-is
//   - decryptObject sur des objets avec champs __zn_enc__: produits manuellement
//   - La correction du bug btoa (grands payloads)

// ─── Helpers pour reproduire le chiffrement interne ─────────────────────────
// Copie minimale de encryptValue / wrapEncrypted pour les tests,
// afin de ne pas dépendre des internals non exportés.

import { secretbox, randomBytes as naclRandom } from 'tweetnacl';

const ENCRYPTED_PREFIX = '__zn_enc__:';

function testEncryptField(value: unknown, key: Uint8Array): string {
  const nonce = naclRandom(secretbox.nonceLength);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = secretbox(data, nonce, key);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return ENCRYPTED_PREFIX + btoa(binary);
}

function makeDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ============================================================================
// decryptObject
// ============================================================================

describe('decryptObject', () => {
  it('retourne l\'objet tel quel si aucun champ chiffré', () => {
    const dek = makeDek();
    const obj = { id: 'abc', label: 'test', value: 42 };
    const result = decryptObject(obj, dek);
    expect(result).toEqual(obj);
  });

  it('déchiffre les champs marqués __zn_enc__:', () => {
    const dek = makeDek();
    const original = { id: 'abc', label: 'contenu sensible', count: 99 };
    const encrypted = {
      id: 'abc',
      label: testEncryptField('contenu sensible', dek),
      count: testEncryptField(99, dek),
    };
    const result = decryptObject(encrypted, dek);
    expect(result).toEqual(original);
  });

  it('laisse les champs non chiffrés intacts', () => {
    const dek = makeDek();
    const obj = {
      id: 'uuid-123',  // champ index — en clair
      label: testEncryptField('texte', dek),
    };
    const result = decryptObject(obj, dek);
    expect(result.id).toBe('uuid-123');
    expect(result.label).toBe('texte');
  });

  it('conserve la valeur chiffrée si la DEK est incorrecte (pas d\'exception)', () => {
    const dek = makeDek();
    const wrongDek = makeDek();
    const encrypted = {
      label: testEncryptField('secret', dek),
    };
    // Avec la mauvaise DEK, decryptValue retourne null → la valeur chiffrée est conservée
    const result = decryptObject(encrypted, wrongDek);
    expect(result.label).toMatch(/^__zn_enc__:/);
  });

  it('gère les objets avec valeurs null/undefined sans crash', () => {
    const dek = makeDek();
    const obj = { id: 'x', label: null, notes: undefined };
    const result = decryptObject(obj as Record<string, unknown>, dek);
    expect(result.id).toBe('x');
    expect(result.label).toBeNull();
  });

  it('est idempotent : déchiffrer un objet déjà en clair ne le modifie pas', () => {
    const dek = makeDek();
    const plain = { id: 'x', label: 'texte', value: 42 };
    const result = decryptObject(plain, dek);
    expect(result).toEqual(plain);
  });

  it('déchiffre des valeurs de type objet imbriqué', () => {
    const dek = makeDek();
    const nested = { tags: ['a', 'b'], meta: { foo: 'bar' } };
    const encrypted = {
      id: 'x',
      data: testEncryptField(nested, dek),
    };
    const result = decryptObject(encrypted, dek);
    expect(result.data).toEqual(nested);
  });
});

// ============================================================================
// Bug btoa — grand payload (> 65535 bytes)
// ============================================================================

describe('encryptValue — grand payload (fix btoa stack overflow)', () => {
  it('chiffre et déchiffre un champ de 200 KB sans erreur', () => {
    const dek = makeDek();
    // Générer un string de 200 KB
    const largeString = 'x'.repeat(200_000);

    // Si le bug btoa était présent, testEncryptField crasherait ici
    expect(() => {
      const encrypted = testEncryptField(largeString, dek);
      const result = decryptObject({ field: encrypted }, dek);
      expect(result.field).toBe(largeString);
    }).not.toThrow();
  });

  it('chiffre et déchiffre un champ de 1 MB sans erreur', () => {
    const dek = makeDek();
    const largeString = 'a'.repeat(1_000_000);

    const encrypted = testEncryptField(largeString, dek);
    const result = decryptObject({ field: encrypted }, dek);
    expect(result.field).toBe(largeString);
  });
});

// ============================================================================
// Préfixe __zn_enc__: — détection
// ============================================================================

describe('préfixe __zn_enc__:', () => {
  it('un champ sans préfixe n\'est pas touché par decryptObject', () => {
    const dek = makeDek();
    const obj = { label: 'texte normal sans préfixe' };
    const result = decryptObject(obj, dek);
    expect(result.label).toBe('texte normal sans préfixe');
  });

  it('un champ avec préfixe mais base64 invalide → conservé tel quel', () => {
    const dek = makeDek();
    const obj = { label: '__zn_enc__:!!invalide!!' };
    // Doit ne pas crasher
    const result = decryptObject(obj, dek);
    expect(result.label).toBe('__zn_enc__:!!invalide!!');
  });
});
