/** Mime type of a data: URL (`data:image/png;base64,…` → image/png) */
export function dataUrlMimeType(dataUrl: string, fallback = 'application/octet-stream'): string {
  return dataUrl.slice(0, dataUrl.indexOf(',')).match(/^data:([^;,]+)/)?.[1] ?? fallback;
}

/** A base64 data: URL as a File */
export function dataUrlToFile(dataUrl: string, filename: string, fallbackMime?: string): File {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: dataUrlMimeType(dataUrl, fallbackMime) });
}
