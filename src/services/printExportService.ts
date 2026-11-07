import { escapeHtml } from '../utils/escapeHtml';

/**
 * Canvas to PDF through the browser's print dialog: the vector SVG export laid
 * out on one sheet (A0 to A4), printed from a hidden frame. "Save as PDF" in
 * the dialog gives a vector PDF; the browser handles the fonts and scripts.
 */

export type PaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export type PaperOrientation = 'auto' | 'portrait' | 'landscape';

export const PAPER_SIZES: PaperSize[] = ['A0', 'A1', 'A2', 'A3', 'A4'];

/** ISO 216 sizes in millimetres, portrait. */
const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
};

const MARGIN_MM = 10;
const FRAME_ID = 'zn-print-frame';

/** Width and height of an SVG, from its viewBox. */
export function svgSize(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/i);
  const width = match ? Number(match[1]) : NaN;
  const height = match ? Number(match[2]) : NaN;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : { width: 1, height: 1 };
}

/** Sheet size in mm; "auto" turns the sheet the way the graph is drawn. */
export function pageSize(
  paper: PaperSize,
  orientation: PaperOrientation,
  graph: { width: number; height: number },
): { width: number; height: number } {
  const { width, height } = PAPER_MM[paper];
  const landscape = orientation === 'landscape' || (orientation === 'auto' && graph.width > graph.height);
  return landscape ? { width: height, height: width } : { width, height };
}

/** The area the graph is fitted in, in mm. */
function printBox(page: { width: number; height: number }): { width: number; height: number } {
  // A little under the printable height: rounding would otherwise spill onto a second sheet
  return { width: page.width - 2 * MARGIN_MM, height: page.height - 2 * MARGIN_MM - 1 };
}

/** Print resolution the images of the elements are prepared for. */
const PRINT_DPI = 300;
/** Largest side of an image in the printed page: beyond, the file grows for no visible gain. */
const MAX_IMAGE_SIDE = 4096;

/**
 * Image pixels needed per SVG unit for the graph to print at 300 dpi once
 * fitted on the sheet.
 */
export function printPixelsPerUnit(
  svg: string,
  options: { paper: PaperSize; orientation: PaperOrientation },
): number {
  const graph = svgSize(svg);
  const box = printBox(pageSize(options.paper, options.orientation, graph));
  const mmPerUnit = Math.min(box.width / graph.width, box.height / graph.height);
  return (mmPerUnit * PRINT_DPI) / 25.4;
}

const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/**
 * The original image as a data URL, reduced to fit a `box` of pixels (the
 * frame it is drawn in, at print resolution), 4096 pixels at most on its
 * longest side. Null for a file that is not a bitmap image: its thumbnail stays.
 */
export async function printImageDataUrl(file: File, box: { width: number; height: number }): Promise<string | null> {
  if (!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(file.type)) return null;
  const bitmap = await createImageBitmap(file);
  try {
    // Drawn whole inside its frame: the side that touches the frame sets the size
    const scale = Math.min(1, box.width / bitmap.width, box.height / bitmap.height,
      MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    // Small enough already: the file as it is
    if (scale === 1 && (file.type === 'image/jpeg' || file.type === 'image/png')) return readAsDataUrl(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // JPEG stays JPEG; the others keep their transparency in PNG
    return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}

/** A print-ready page: the SVG fitted inside the margins of one sheet. */
export function buildPrintHtml(
  svg: string,
  options: { paper: PaperSize; orientation: PaperOrientation; title: string },
): string {
  const page = pageSize(options.paper, options.orientation, svgSize(svg));
  const { width: boxWidth, height: boxHeight } = printBox(page);

  // The SVG takes the size of the box and keeps its proportions inside it
  const body = svg
    .replace(/^\s*<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg\b([^>]*)>/, (_m, attrs: string) =>
      `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} preserveAspectRatio="xMidYMid meet">`);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(options.title)}</title>
<style>
@page { size: ${page.width}mm ${page.height}mm; margin: ${MARGIN_MM}mm; }
html, body { margin: 0; padding: 0; background: #ffffff; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
svg { display: block; width: ${boxWidth}mm; height: ${boxHeight}mm; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Opens the print dialog on this page, from a hidden frame (no new tab, no
 * popup blocker). The frame runs no script: the labels it shows are user text.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    document.getElementById(FRAME_ID)?.remove();
    const frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    // Same origin so this page can call print(); modals so print() is allowed; no scripts
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    const onLoad = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        reject(new Error('Print frame unavailable'));
        return;
      }
      // Some browsers load about:blank first: wait for the page itself
      if (!win.document.querySelector('svg')) {
        frame.addEventListener('load', onLoad, { once: true });
        return;
      }
      try {
        win.addEventListener('afterprint', () => frame.remove(), { once: true });
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        frame.remove();
        reject(err);
      }
    };
    frame.addEventListener('load', onLoad, { once: true });
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
