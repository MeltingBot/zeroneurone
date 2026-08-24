// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';

// fileService statically imports pdfjs-dist, which needs canvas APIs we do not
// have here and do not exercise. See lot P1 for making that import dynamic.
vi.mock('./fileService', () => ({
  fileService: {
    getAssetsByDossier: vi.fn().mockResolvedValue([]),
    getFileBlob: vi.fn().mockResolvedValue(null),
  },
}));

const { isSupportedBackupVersion } = await import('./backupService');

describe('isSupportedBackupVersion', () => {
  it('accepts the current format and older majors', () => {
    expect(isSupportedBackupVersion('1.0.0')).toBe(true);
    expect(isSupportedBackupVersion('1.4.2')).toBe(true);
    expect(isSupportedBackupVersion('0.9.0')).toBe(true);
  });

  it('refuses a backup written by a newer major', () => {
    expect(isSupportedBackupVersion('2.0.0')).toBe(false);
    expect(isSupportedBackupVersion('10.0.0')).toBe(false);
  });

  it('refuses an unreadable version string', () => {
    expect(isSupportedBackupVersion('')).toBe(false);
    expect(isSupportedBackupVersion('abc')).toBe(false);
    expect(isSupportedBackupVersion('v1')).toBe(false);
  });
});
