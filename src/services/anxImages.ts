/*
 * This project is not affiliated with IBM, i2 Group, N. Harris Computer
 * Corporation, or any other vendor. "i2", "i2 Analyst's Notebook", and "ANB"
 * are trademarks of their respective owners (nominative use).
 *
 * Ce projet n'est affilié ni à IBM, ni à i2 Group, ni à N. Harris Computer
 * Corporation, ni à aucun autre éditeur. « i2 », « i2 Analyst's Notebook » et
 * « ANB » sont des marques de leurs propriétaires respectifs (usage nominatif).
 */

/**
 * Images of elements carried in an .anx as embedded custom icons.
 *
 * ANB renders a <CustomImage> of a <CustomImageCollection> on open, with no
 * install: a full 24-bit BMP, zlib-compressed and base64-encoded, at most 128
 * pixels, square, magenta (255, 0, 255) standing for transparency; a 32-bit or
 * too large BMP shows as a black box. An entity shows it through
 * IconStyle/@OverrideTypeIcon and @TypeIconName. The format and these limits
 * are those documented and used by anxwritter (MIT,
 * https://github.com/gustavo-gkmi/anxwritter); the code here is written anew.
 *
 * No dependency: the BMP is written and read by hand, zlib is the browser's
 * CompressionStream ("deflate" is the zlib format), the canvas resizes.
 */

/** Largest side of an embedded image: a byte budget for ANB */
export const ANX_IMAGE_MAX = 128;
const MAGENTA = [255, 0, 255] as const;

/** An embedded image: base64 of the zlib-compressed BMP, the BMP's length, its icon name */
export interface AnxImage {
  data: string;
  length: number;
  /**
   * Name of the icon, from the image's own content (SHA-256). ANB copies
   * embedded icons into its icon library under their name: a name per
   * content means a later chart never shows another chart's image.
   */
  name: string;
}

// ── BMP ─────────────────────────────────────────────────────────

/**
 * A 24-bit BMP of RGBA pixels (rows top first). A pixel transparent for
 * more than half becomes magenta, ANB's transparent colour; a pixel that is
 * magenta itself is nudged off it, so that it stays visible.
 */
export function rgbaToBmp24(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const bmp = new Uint8Array(54 + pixelBytes);
  const view = new DataView(bmp.buffer);
  bmp[0] = 0x42; bmp[1] = 0x4d; // "BM"
  view.setUint32(2, bmp.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: rows bottom first
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
      if (rgba[i + 3] < 128) [r, g, b] = MAGENTA;
      else if (r === 255 && g === 0 && b === 255) [r, b] = [254, 254];
      bmp[row + x * 3] = b;
      bmp[row + x * 3 + 1] = g;
      bmp[row + x * 3 + 2] = r;
    }
  }
  return bmp;
}

/**
 * RGBA pixels (rows top first) of an 8-, 24- or 32-bit uncompressed BMP;
 * magenta becomes transparent. Null when the file is no such BMP.
 */
export function bmpToRgba(bmp: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } | null {
  if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) return null;
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  const offset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width <= 0 || height === 0 || width > 4096 || height > 4096) return null;
  if (![8, 24, 32].includes(bpp) || !(compression === 0 || (bpp === 32 && compression === 3))) return null;
  const palette: number[][] = [];
  if (bpp === 8) {
    const count = view.getUint32(46, true) || 256;
    for (let p = 0; p < count; p++) {
      const at = 14 + dibSize + p * 4;
      if (at + 3 > bmp.length) return null;
      palette.push([bmp[at + 2], bmp[at + 1], bmp[at]]);
    }
  }
  const rowSize = Math.ceil((width * bpp) / 32) * 4;
  if (offset + rowSize * height > bmp.length) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number;
      if (bpp === 8) [r, g, b] = palette[bmp[row + x]] ?? [0, 0, 0];
      else {
        const at = row + x * (bpp / 8);
        [b, g, r] = [bmp[at], bmp[at + 1], bmp[at + 2]];
      }
      const i = (y * width + x) * 4;
      const transparent = r === 255 && g === 0 && b === 255;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = transparent ? 0 : 255;
    }
  }
  return { width, height, rgba };
}

// ── zlib + base64 ───────────────────────────────────────────────

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A BMP as ANB embeds it: zlib-compressed, base64-encoded, named after its content */
export async function bmpToAnxImage(bmp: Uint8Array): Promise<AnxImage> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bmp)));
  const hex = Array.from(digest.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  return { data: toBase64(await pipe(bmp, new CompressionStream('deflate'))), length: bmp.length, name: `ZN_${hex}` };
}

/** The BMP of an embedded image; null when it cannot be read */
export async function anxImageToBmp(data: string): Promise<Uint8Array | null> {
  try {
    const binary = atob(data.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return await pipe(bytes, new DecompressionStream('deflate'));
  } catch {
    return null;
  }
}

// ── Images of the browser ───────────────────────────────────────

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * An image file (JPEG, PNG, WebP…) as an embedded image: reduced (never
 * enlarged) to at most 128 pixels, centred on a square, transparent edges in
 * magenta. Null when the browser cannot decode it.
 */
export async function imageToAnxImage(file: Blob): Promise<AnxImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, ANX_IMAGE_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const side = Math.max(w, h);
  const ctx = canvasOf(side, side).getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, Math.floor((side - w) / 2), Math.floor((side - h) / 2), w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, side, side);
  return bmpToAnxImage(rgbaToBmp24(data, side, side));
}

/** An embedded image as a PNG file (magenta transparent); null when it cannot be read */
export async function anxImageToPng(data: string): Promise<Blob | null> {
  const bmp = await anxImageToBmp(data);
  const pixels = bmp ? bmpToRgba(bmp) : null;
  if (!pixels) return null;
  const canvas = canvasOf(pixels.width, pixels.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(pixels.rgba, pixels.width, pixels.height), 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
