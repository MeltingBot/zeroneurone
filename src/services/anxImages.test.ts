import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { rgbaToBmp24, bmpToRgba, bmpToAnxImage, anxImageToBmp, dibToBmp } from './anxImages';

// 3 × 2 pixels: red, green, transparent / blue, magenta, white
const RGBA = new Uint8ClampedArray([
  255, 0, 0, 255, 0, 255, 0, 255, 10, 20, 30, 0,
  0, 0, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255,
]);

describe('BMP', () => {
  const bmp = rgbaToBmp24(RGBA, 3, 2);

  it('writes a 24-bit BMP, rows padded to 4 bytes', () => {
    expect([bmp[0], bmp[1]]).toEqual([0x42, 0x4d]);
    const view = new DataView(bmp.buffer);
    expect(view.getUint16(28, true)).toBe(24);
    expect(bmp.length).toBe(54 + 12 * 2); // 3 px × 3 bytes = 9, padded to 12
  });

  it('reads back the pixels: transparency as magenta, magenta itself kept visible', () => {
    const back = bmpToRgba(bmp)!;
    expect([back.width, back.height]).toEqual([3, 2]);
    const px = (i: number) => Array.from(back.rgba.slice(i * 4, i * 4 + 4));
    expect(px(0)).toEqual([255, 0, 0, 255]);
    expect(px(2)[3]).toBe(0); // transparent → magenta → transparent again
    expect(px(3)).toEqual([0, 0, 255, 255]);
    expect(px(4)).toEqual([254, 0, 254, 255]); // a magenta pixel stays a pixel
  });

  it('refuses what is no readable BMP', () => {
    expect(bmpToRgba(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('embedded image payload', () => {
  it('is the BMP compressed with zlib, in base64, with the BMP length', async () => {
    const bmp = rgbaToBmp24(RGBA, 3, 2);
    const image = await bmpToAnxImage(bmp);
    expect(image.length).toBe(bmp.length);
    // zlib as ANB (and Python's zlib) reads it
    expect(new Uint8Array(inflateSync(Buffer.from(image.data, 'base64')))).toEqual(bmp);
    expect(await anxImageToBmp(image.data)).toEqual(bmp);
  });

  it('gives null for data that is no zlib stream', async () => {
    expect(await anxImageToBmp('bm90IHpsaWI=')).toBeNull();
  });
});

describe('icon names', () => {
  it('come from the content: the same image, the same name; another image, another name', async () => {
    const a = await bmpToAnxImage(rgbaToBmp24(RGBA, 3, 2));
    const b = await bmpToAnxImage(rgbaToBmp24(RGBA, 3, 2));
    const other = new Uint8ClampedArray(RGBA);
    other[0] = 0;
    const c = await bmpToAnxImage(rgbaToBmp24(other, 3, 2));
    expect(a.name).toMatch(/^ZN_[0-9a-f]{24}$/);
    expect(b.name).toBe(a.name);
    expect(c.name).not.toBe(a.name);
  });
});

describe('ANB pictures (DIB)', () => {
  it('gives a DIB its BMP file header, and keeps magenta in a photo', () => {
    const bmp = rgbaToBmp24(new Uint8Array([255, 0, 255, 255, 10, 20, 30, 255]), 2, 1);
    const fromDib = dibToBmp(bmp.subarray(14))!;
    expect(Array.from(fromDib)).toEqual(Array.from(bmp));
    // rgbaToBmp24 nudges magenta off: put it back to test the photo case
    fromDib[54] = 255; fromDib[55] = 0; fromDib[56] = 255;
    expect(Array.from(bmpToRgba(fromDib, false)!.rgba.subarray(0, 4))).toEqual([255, 0, 255, 255]);
    expect(bmpToRgba(fromDib)!.rgba[3]).toBe(0);
  });

  it('rejects what is no DIB', () => {
    expect(dibToBmp(new Uint8Array(10))).toBeNull();
  });
});
