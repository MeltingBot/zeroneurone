/**
 * The companion's own QR scanner where the browser has no BarcodeDetector
 * (Safari on iPhone; Chromium on Linux too, which makes it testable): jsQR
 * reads the camera. The camera is faked with a video of a share link's QR code.
 */
import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import qrcode from 'qrcode-generator';

test('the scanner reads a share link without BarcodeDetector', async ({ baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const link = `${origin}/m/scannedroom?server=ws%3A%2F%2Flocalhost%3A4444&async=1#key=abc&id=dossier-scan`;

  // A short video of the link's QR code for the fake camera, written as Y4M
  // (raw frames: the QR's light and dark modules drawn in the luma plane)
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const side = 640;
  const modules = qr.getModuleCount();
  const cell = Math.floor(side / (modules + 8));
  const margin = Math.floor((side - cell * modules) / 2);
  const luma = Buffer.alloc(side * side, 235);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const row = Math.floor((y - margin) / cell);
      const col = Math.floor((x - margin) / cell);
      if (row >= 0 && col >= 0 && row < modules && col < modules && qr.isDark(row, col)) luma[y * side + x] = 16;
    }
  }
  const chroma = Buffer.alloc((side / 2) * (side / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma]);
  const dir = mkdtempSync(join(tmpdir(), 'zn-qr-'));
  const video = join(dir, 'qr.y4m');
  writeFileSync(video, Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${side} H${side} F10:1 Ip A1:1 C420jpeg\n`),
    ...Array.from({ length: 10 }, () => frame),
  ]));

  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const context = await browser.newContext({ permissions: ['camera'] });
    // No BarcodeDetector, as on Safari
    await context.addInitScript(() => { delete (window as { BarcodeDetector?: unknown }).BarcodeDetector; });
    const page = await context.newPage();
    await page.goto(`${origin}/m/`);
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(page).toHaveURL(/\/m\/scannedroom\?/, { timeout: 20_000 });
  } finally {
    await browser.close();
  }
});
