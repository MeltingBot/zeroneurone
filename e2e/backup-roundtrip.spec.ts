import { test, expect } from '@playwright/test';

test('backup round trip keeps rows and files', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts');
    const { fileService } = await import('/src/services/fileService.ts');
    const { backupService } = await import('/src/services/backupService.ts');
    const now = new Date();
    const did = crypto.randomUUID();
    await db.dossiers.add({ id: did, name: 'RT', description: '', createdAt: now, updatedAt: now } as never);
    const asset = await fileService.saveAsset(did as never, new File(['hello file'], 'a.txt', { type: 'text/plain' }));
    const e1 = crypto.randomUUID(), e2 = crypto.randomUUID();
    await db.elements.bulkAdd([
      { id: e1, dossierId: did, label: 'A', notes: '', tags: [], properties: [], assetIds: [asset.id], position: { x: 0, y: 0 }, parentGroupId: null, childIds: [], createdAt: now, updatedAt: now },
      { id: e2, dossierId: did, label: 'B', notes: '', tags: [], properties: [], assetIds: [], position: { x: 9, y: 0 }, parentGroupId: null, childIds: [], createdAt: now, updatedAt: now },
    ] as never);
    await db.links.add({ id: crypto.randomUUID(), dossierId: did, fromId: e1, toId: e2, label: 'L', createdAt: now, updatedAt: now } as never);
    await db.reports.add({ id: crypto.randomUUID(), dossierId: did, title: 'R', sections: [{ id: 's', title: 'S', order: 0, content: `voir [[A|${e1}]]`, elementIds: [e1] }], createdAt: now, updatedAt: now } as never);
    const blob = await backupService.exportAll();
    const res = await backupService.importAll(new File([blob], 'b.zip'));
    const copies = (await db.dossiers.toArray()).filter((d) => d.name === 'RT' && d.id !== did);
    const nid = copies[0]?.id;
    const els = await db.elements.where({ dossierId: nid }).toArray();
    const a = els.find((e) => e.label === 'A')!;
    const assets = await db.assets.where({ dossierId: nid }).toArray();
    const fileBlob = assets[0] ? await fileService.getAssetFile(assets[0]) : null;
    const rep = await db.reports.where({ dossierId: nid }).first();
    return {
      res, copies: copies.length, els: els.length,
      links: await db.links.where({ dossierId: nid }).count(),
      assetLinked: a?.assetIds?.[0] === assets[0]?.id,
      fileText: fileBlob ? await fileBlob.text() : null,
      reportRemapped: rep?.sections[0].content === `voir [[A|${a.id}]]` && rep?.sections[0].elementIds[0] === a.id,
    };
  });
  expect(out.res.success).toBe(true);
  expect(out.copies).toBe(1);
  expect(out.els).toBe(2);
  expect(out.links).toBe(1);
  expect(out.assetLinked).toBe(true);
  expect(out.fileText).toBe('hello file');
  expect(out.reportRemapped).toBe(true);
});
