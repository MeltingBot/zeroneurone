import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setupCleanEnvironment } from './fixtures/test-utils';

// The browser side of embedded images: canvas, zlib of the browser, media files
test('an element image goes into the .anx as an embedded icon and comes back as its media', async ({ page }) => {
  await setupCleanEnvironment(page);
  const result = await page.evaluate(async () => {
    // A 300 × 150 image: red left half, blue right half
    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 150;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 150, 150);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(150, 0, 150, 150);
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

    const { imageToAnxImage } = await import('/src/services/anxImages.ts');
    const { buildANXExport } = await import('/src/services/exportANX.ts');
    const { importANX } = await import('/src/services/importANX.ts');
    const { db } = await import('/src/db/database.ts');
    const image = (await imageToAnxImage(png))!;
    const element = {
      id: 'e1', dossierId: 'src', label: 'Véhicule', notes: '', tags: ['Voiture'], properties: [], confidence: null,
      source: '', date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false, geo: null, events: [],
      visual: { color: '#ffffff', borderColor: '#333333', shape: 'circle', size: 'medium', icon: null, image: null },
      assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [], createdAt: new Date(), updatedAt: new Date(),
    };
    const anx = buildANXExport({ id: 'src', name: 'x', description: '' } as never, [element as never], [], new Map([['e1', image]]));

    await db.dossiers.put({ id: 'dst', name: 'Cible', description: '', settings: {}, createdAt: new Date(), updatedAt: new Date() } as never);
    const imported = await importANX(anx, 'dst' as never);
    const [el] = await db.elements.where({ dossierId: 'dst' }).toArray();
    const asset = el ? await db.assets.get(el.assetIds[0]) : undefined;
    // The media read back: square, at most 128 px, red then blue
    let pixels: number[][] = [];
    if (asset) {
      const { fileService } = await import('/src/services/fileService.ts');
      const bitmap = await createImageBitmap(await fileService.getAssetFile(asset));
      const c = document.createElement('canvas');
      c.width = bitmap.width; c.height = bitmap.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => Array.from(cx.getImageData(x, y, 1, 1).data);
      pixels = [[bitmap.width, bitmap.height], at(20, 64), at(108, 64), at(64, 5)];
    }
    return { name: image.name, embedded: anx.includes(`${image.name},Screen,Icon`), assets: imported.assetsImported, mime: asset?.mimeType, pixels };
  });
  expect(result.embedded).toBe(true);
  expect(result.assets).toBe(1);
  expect(result.mime).toBe('image/png');
  const [[w, h], left, right, top] = result.pixels;
  expect([w, h]).toEqual([128, 128]);
  expect(left.slice(0, 3)).toEqual([255, 0, 0]);
  expect(right.slice(0, 3)).toEqual([0, 0, 255]);
  // The padding of a non-square image is transparent (magenta in i2)
  expect(top[3]).toBe(0);
});

test('the export reads the image of each element (appearance, else first attached), and skips other files', async ({ page }) => {
  await setupCleanEnvironment(page);
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 40);
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const { fileService } = await import('/src/services/fileService.ts');
    const { exportService } = await import('/src/services/exportService.ts');
    const pdf = await fileService.saveAsset('d' as never, new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' }));
    const photo = await fileService.saveAsset('d' as never, new File([png], 'photo.png', { type: 'image/png' }));
    const el = (id: string, assetIds: string[], image: string | null = null) => ({ id, assetIds, visual: { image } });
    const images = await (exportService as unknown as { anxImages: (e: unknown[], a: unknown[]) => Promise<Map<string, { name: string }>> })
      .anxImages([el('a', [pdf.id, photo.id]), el('b', [pdf.id]), el('c', [photo.id]), el('d', [pdf.id], photo.id)], [pdf, photo]);
    return { keys: [...images.keys()], sameName: images.get('a')?.name === images.get('c')?.name };
  });
  // d: its image is that of its appearance, not among its attached files
  expect(result.keys).toEqual(['a', 'c', 'd']);
  expect(result.sameName).toBe(true);
});

test('the Export window puts the element images into the .anx', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'personnes.csv', mimeType: 'text/csv', buffer: Buffer.from('type,label\nelement,Sophie Arnaud\nelement,Marc Lemaire', 'utf-8'),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15000 });
  // A photo attached to one of them
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 60; canvas.height = 80;
    canvas.getContext('2d')!.fillRect(0, 0, 60, 80);
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const { fileService } = await import('/src/services/fileService.ts');
    const s = useDossierStore.getState();
    const sophie = s.elements.find((e) => e.label === 'Sophie Arnaud')!;
    const asset = await fileService.saveAsset(s.currentDossier!.id, new File([png], 'sophie.png', { type: 'image/png' }));
    await s.updateElement(sophie.id, { assetIds: [asset.id] });
  });

  const exportAnx = async (withImages: boolean) => {
    await page.getByTitle('Export', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Graph' }).click();
    await dialog.getByText("ANX (i2 Analyst's Notebook)").click();
    const images = dialog.getByLabel('Element images');
    if (withImages) await expect(images).toBeChecked();
    else await images.uncheck();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    await expect(dialog).toBeHidden();
    return readFileSync((await download.path())!, 'utf8');
  };
  const xml = await exportAnx(true);
  expect(xml.match(/<CustomImage /g) ?? []).toHaveLength(1);
  expect(xml.match(/OverrideTypeIcon="true"/g) ?? []).toHaveLength(1);
  // The option unticked: no image
  expect(await exportAnx(false)).not.toContain('CustomImage');
});
