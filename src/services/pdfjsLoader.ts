/**
 * Lazy loader for pdf.js.
 *
 * The library weighs about a megabyte and is only needed for PDF attachments,
 * but its consumers (fileService, PdfPreview) are reachable from the stores and
 * every view. Importing it statically puts it in the entry chunk for everyone.
 *
 * The promise is memoised so concurrent callers share a single download, and
 * the worker URL is configured once, on first load.
 *
 * The legacy build is used on purpose: the modern one calls recent built-ins
 * (Map.prototype.getOrInsertComputed...) without polyfilling them, and throws
 * "getOrInsertComputed is not a function" in browsers that lack them. The
 * worker in public/ must come from the same build (see sync-workers.mjs).
 */
import { appPath } from '../utils/basePath';

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    // Stable URL from public/ — survives SW cache mismatches across deploys.
    lib.GlobalWorkerOptions.workerSrc = appPath('/pdf.worker.min.mjs');
    return lib;
  });
  return pdfjsPromise;
}
