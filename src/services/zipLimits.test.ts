import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readZipEntryBuffer, readZipEntryText, ZipEntryTooLargeError } from './zipLimits';

async function archive(files: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return JSZip.loadAsync(bytes);
}

describe('zipLimits', () => {
  it('reads an entry within its limit', async () => {
    const zip = await archive({ 'dossier.json': '{"é":"ok"}' });
    expect(await readZipEntryText(zip.file('dossier.json')!, 1024)).toBe('{"é":"ok"}');
    const buffer = await readZipEntryBuffer(zip.file('dossier.json')!, 1024);
    expect(buffer.byteLength).toBe(new TextEncoder().encode('{"é":"ok"}').length);
  });

  it('stops decompressing an entry that exceeds its limit', async () => {
    // 4 MB of zeros compresses to a few KB: a small ZIP bomb
    const zip = await archive({ 'dossier.json': '0'.repeat(4 * 1024 * 1024) });
    await expect(readZipEntryText(zip.file('dossier.json')!, 64 * 1024)).rejects.toBeInstanceOf(ZipEntryTooLargeError);
  });

  it('accepts an entry exactly at its limit', async () => {
    const zip = await archive({ 'a.txt': 'x'.repeat(1000) });
    expect((await readZipEntryText(zip.file('a.txt')!, 1000)).length).toBe(1000);
  });
});
