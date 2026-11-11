/**
 * Image helpers that only need a canvas: the 200 px thumbnail stored with an
 * asset, and the downscale the mobile companion applies before sending a
 * photo (its chunks stay in every collaborator's Y.Doc for good).
 */

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(img: HTMLImageElement, maxSize: number): HTMLCanvasElement | null {
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** JPEG data URL fitting in maxSize × maxSize, or null when the image cannot be read */
export async function generateImageThumbnail(blob: Blob, maxSize = 200): Promise<string | null> {
  try {
    const canvas = drawScaled(await loadImage(blob), maxSize);
    return canvas ? canvas.toDataURL('image/jpeg', 0.7) : null;
  } catch (error) {
    console.warn('Failed to generate image thumbnail:', error);
    return null;
  }
}

/**
 * JPEG copy whose longest side is at most maxSize. Returns the original when
 * it is already small enough and a JPEG, or when the image cannot be read.
 */
export async function downscaleImage(file: Blob, maxSize = 2048, quality = 0.85): Promise<Blob> {
  try {
    const img = await loadImage(file);
    if (Math.max(img.width, img.height) <= maxSize && file.type === 'image/jpeg') return file;
    const canvas = drawScaled(img, maxSize);
    if (!canvas) return file;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
