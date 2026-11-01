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
    expect(isSupportedBackupVersion('2.0.0')).toBe(true);
    expect(isSupportedBackupVersion('1.0.0')).toBe(true);
    expect(isSupportedBackupVersion('1.4.2')).toBe(true);
    expect(isSupportedBackupVersion('0.9.0')).toBe(true);
  });

  it('refuses a backup written by a newer major', () => {
    expect(isSupportedBackupVersion('3.0.0')).toBe(false);
    expect(isSupportedBackupVersion('10.0.0')).toBe(false);
  });

  it('refuses an unreadable version string', () => {
    expect(isSupportedBackupVersion('')).toBe(false);
    expect(isSupportedBackupVersion('abc')).toBe(false);
    expect(isSupportedBackupVersion('v1')).toBe(false);
  });
});

describe('importAll, format 1.x', () => {
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

describe('exportAll and importAll, format 2.x', () => {
  const now = new Date();

  async function seedClosedDossier(id: string) {
    await db.dossiers.add({
      id, name: `Dossier ${id}`, description: 'desc', startDate: null, creator: '', tags: ['t'], properties: [],
      createdAt: now, updatedAt: now, viewport: { x: 0, y: 0, zoom: 1 },
      settings: {} as never, closedAt: now, closureHistory: [], retentionDays: 30, retentionPolicy: 'readonly',
    } as never);
    const element = (eid: string, extra: object = {}) => ({
      id: eid, dossierId: id, label: eid, notes: '', tags: [], properties: [], confidence: null, source: '',
      date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
      visual: { color: '#fff', borderColor: '#000', shape: 'rectangle', size: 'medium', icon: null, image: null },
      assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
      createdAt: now, updatedAt: now, ...extra,
    });
    await db.elements.bulkAdd([
      element(`${id}-g`, { isGroup: true, childIds: [`${id}-a`] }),
      element(`${id}-a`, { parentGroupId: `${id}-g` }),
      element(`${id}-b`),
    ] as never[]);
    await db.links.add({
      id: `${id}-l`, dossierId: id, fromId: `${id}-a`, toId: `${id}-b`, label: 'lien', notes: '', tags: [],
      properties: [], confidence: null, source: '', date: null, dateRange: null, directed: true,
      visual: { color: '#000', style: 'solid', thickness: 2 }, createdAt: now, updatedAt: now,
    } as never);
    await db.canvasTabs.add({
      id: `${id}-tab`, dossierId: id, name: 'Onglet', order: 0, memberElementIds: [`${id}-a`],
      excludedElementIds: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now,
    } as never);
    await db.comments.add({
      id: `${id}-c`, dossierId: id, targetId: `${id}-a`, targetType: 'element', content: 'commentaire',
      authorName: 'Moi', authorColor: '#000', resolved: false, createdAt: now, updatedAt: now,
    } as never);
    await db.savedQueries.add({
      id: `${id}-q`, dossierId: id, name: 'Requête', query: 'label = "a"', createdAt: now, updatedAt: now,
    } as never);
  }

  it('keeps tabs, groups, comments, saved queries, closure and retention', async () => {
    await seedClosedDossier('src');
    const blob = await backupService.exportAll();
    const before = new Set(await db.dossiers.toCollection().primaryKeys());

    const result = await backupService.importAll(new File([blob], 'backup.zip'));
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);

    const restored = (await db.dossiers.toArray()).filter((d) => !before.has(d.id) && d.name === 'Dossier src');
    expect(restored).toHaveLength(1);
    const d = restored[0];
    expect(d.closedAt).toBeInstanceOf(Date);
    expect(d.retentionDays).toBe(30);
    expect(d.retentionPolicy).toBe('readonly');
    expect(d.tags).toEqual(['t']);

    const elements = await db.elements.where({ dossierId: d.id }).toArray();
    expect(elements).toHaveLength(3);
    const group = elements.find((e) => e.isGroup)!;
    const member = elements.find((e) => e.label === 'src-a')!;
    expect(member.parentGroupId).toBe(group.id);
    expect(await db.links.where({ dossierId: d.id }).count()).toBe(1);

    const tabs = await db.canvasTabs.where({ dossierId: d.id }).toArray();
    expect(tabs.map((t) => t.name)).toEqual(['Onglet']);
    expect(tabs[0].memberElementIds).toEqual([member.id]);
    expect((await db.comments.where({ dossierId: d.id }).toArray()).map((c) => c.content)).toEqual(['commentaire']);
    expect((await db.savedQueries.where({ dossierId: d.id }).toArray()).map((q) => q.name)).toEqual(['Requête']);
  });
});
