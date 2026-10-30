// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';

// fileService statically imports pdfjs-dist, which needs canvas APIs we do not
// have here and do not exercise. See lot P1 for making that import dynamic.
vi.mock('./fileService', () => ({
  fileService: {
    getAssetsByDossier: vi.fn().mockResolvedValue([]),
    getFileBlob: vi.fn().mockResolvedValue(null),
    saveAsset: vi.fn(),
    deleteDossierAssets: vi.fn().mockResolvedValue(undefined),
  },
}));

const { isSupportedBackupVersion, backupService } = await import('./backupService');
const { db } = await import('../db/database');
const { fileService } = await import('./fileService');
const JSZip = (await import('jszip')).default;

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

describe('importAll', () => {
  async function backupFile(): Promise<File> {
    const now = new Date().toISOString();
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify({
      version: '1.0.0',
      exportedAt: now,
      dossiers: [{ id: 'd1', name: 'Dossier', description: '', createdAt: now, updatedAt: now }],
      elements: [
        { id: 'e1', dossierId: 'd1', label: 'A', assetIds: [], createdAt: now, updatedAt: now },
        { id: 'e2', dossierId: 'd1', label: 'B', assetIds: [], createdAt: now, updatedAt: now },
      ],
      links: [{ id: 'l1', dossierId: 'd1', fromId: 'e1', toId: 'e2', createdAt: now, updatedAt: now }],
      assets: [],
      views: [],
      reports: [{ id: 'r1', dossierId: 'd1', title: 'R', sections: [], createdAt: now, updatedAt: now }],
      tagSets: [],
    }));
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'backup.zip');
  }

  it('restores every row of the backup', async () => {
    const before = await db.elements.count();
    const result = await backupService.importAll(await backupFile());
    expect(result.success).toBe(true);
    expect(result.elements).toBe(2);
    expect(result.links).toBe(1);
    expect(await db.elements.count()).toBe(before + 2);
  });

  it('writes nothing when one table fails, and removes the stored files', async () => {
    const counts = async () => [await db.dossiers.count(), await db.elements.count(), await db.links.count()];
    const before = await counts();
    const spy = vi.spyOn(db.reports, 'bulkAdd').mockRejectedValueOnce(new Error('quota'));
    try {
      const result = await backupService.importAll(await backupFile());
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('quota');
      expect(await counts()).toEqual(before);
      expect(fileService.deleteDossierAssets).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
