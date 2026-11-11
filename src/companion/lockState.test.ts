// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import { seal, setUnlocked, unseal, writeLock, readLock, type LockRecord } from './lockState';
import { listSessions, moveSessions, saveSession } from './sessions';
import { hasCompanionDossiers } from './hasDossiers';

const session = (id: string) => ({ dossierId: id, roomId: 'r', encryptionKey: 'SECRET-KEY-' + id, server: 'wss://x', name: 'Dossier ' + id, joinedAt: '' });
const record = (ids: string[]): LockRecord => ({
  v: 1, state: 'on', credentialId: '', prfSalt: '', encryptedDek: '', dekIv: '', timeoutMin: 5,
  dossierIds: ids, sharePublicKey: {}, sharePrivateKey: '',
});

describe('companion lock state', () => {
  beforeEach(() => { localStorage.clear(); setUnlocked(null, null); });

  it('seals and opens with the same key only', () => {
    const key = nacl.randomBytes(32);
    const sealed = seal('bonjour', key);
    expect(unseal(sealed, key)).toBe('bonjour');
    expect(unseal(sealed, nacl.randomBytes(32))).toBeNull();
  });

  it('keeps the session list sealed while the lock is on, the ids readable', () => {
    const key = nacl.randomBytes(32);
    saveSession(session('a'));
    writeLock(record(['a']));
    setUnlocked(key, null);
    moveSessions([session('a')], key);
    saveSession(session('b'));
    // Nothing of the share keys in plain sight
    expect(JSON.stringify({ ...localStorage })).not.toContain('SECRET-KEY');
    expect(readLock()!.dossierIds.sort()).toEqual(['a', 'b']);
    expect(listSessions().map((s) => s.dossierId).sort()).toEqual(['a', 'b']);
    // Locked: no session readable, the phone still known to hold some
    setUnlocked(null, null);
    expect(listSessions()).toEqual([]);
    expect(hasCompanionDossiers()).toBe(true);
  });
});
