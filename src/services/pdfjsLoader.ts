/**
 * Lazy loader for pdf.js.
 *
 * The library weighs about a megabyte and is only needed for PDF attachments,
 * but its consumers (fileService, PdfPreview) are reachable from the stores and
 * every view. Importing it statically puts it in the entry chunk for everyone.
 *
 * The promise is memoised so concurrent callers share a single download, and
 * the worker URL is configured once, on first load.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsPromise ??= import('pdfjs-dist').then((lib) => {
    // Stable URL from public/ — survives SW cache mismatches across deploys.
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return lib;
  });
  return pdfjsPromise;
}
