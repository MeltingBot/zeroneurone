import type JSZip from 'jszip';

/** Size and count limits for every ZIP read by the app (ZIP bomb protection). */
export const ZIP_LIMITS = {
  /** Archive file size: 500 MB */
  MAX_ZIP_SIZE: 500 * 1024 * 1024,
  /** Total decompressed size: 2 GB */
  MAX_DECOMPRESSED_SIZE: 2 * 1024 * 1024 * 1024,
  MAX_FILES_IN_ZIP: 10000,
  /** One file inside the archive: 100 MB, the upload limit */
  MAX_FILE_SIZE_IN_ZIP: 100 * 1024 * 1024,
  /** dossier.json: 50 MB */
  MAX_JSON_SIZE: 50 * 1024 * 1024,
  MAX_ELEMENTS: 50000,
  MAX_LINKS: 100000,
  MAX_ASSETS: 5000,
  /** Decompressed / compressed; a higher ratio suggests a ZIP bomb */
  MAX_COMPRESSION_RATIO: 100,
};

/** Raised when an entry decompresses past its limit; reading stops there. */
export class ZipEntryTooLargeError extends Error {
  readonly maxBytes: number;
  constructor(name: string, maxBytes: number) {
    super(`${name}: more than ${maxBytes} bytes once decompressed`);
    this.maxBytes = maxBytes;
  }
}

interface ChunkStream {
  on(event: 'data', fn: (chunk: Uint8Array) => void): ChunkStream;
  on(event: 'end', fn: () => void): ChunkStream;
  on(event: 'error', fn: (err: unknown) => void): ChunkStream;
  pause(): ChunkStream;
  resume(): ChunkStream;
}

/**
 * Decompresses an entry chunk by chunk and stops as soon as `maxBytes` is
 * passed, so a forged entry never fills memory. The size declared in the
 * archive header is not trusted.
 */
export function readZipEntryBytes(entry: JSZip.JSZipObject, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let done = false;
    // internalStream is public JSZip API, missing from its type definitions
    const stream = (entry as unknown as { internalStream(type: 'uint8array'): ChunkStream })
      .internalStream('uint8array');
    stream
      .on('data', (chunk) => {
        if (done) return;
        total += chunk.length;
        if (total > maxBytes) {
          done = true;
          stream.pause();
          reject(new ZipEntryTooLargeError(entry.name, maxBytes));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', (err) => {
        if (done) return;
        done = true;
        reject(err);
      })
      .on('end', () => {
        if (done) return;
        done = true;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(out);
      })
      .resume();
  });
}

export async function readZipEntryText(entry: JSZip.JSZipObject, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readZipEntryBytes(entry, maxBytes));
}

export async function readZipEntryBuffer(entry: JSZip.JSZipObject, maxBytes: number): Promise<ArrayBuffer> {
  // readZipEntryBytes returns a fresh array spanning its whole buffer
  return (await readZipEntryBytes(entry, maxBytes)).buffer as ArrayBuffer;
}
