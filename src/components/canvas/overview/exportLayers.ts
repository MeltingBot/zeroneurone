/**
 * Canvas layers (overview, links layer) are bitmaps at the screen's pixel
 * ratio. A PNG export copies them as they are, so at 2x or 3x their lines
 * blur next to the sharp SVG nodes. Each layer registers here; the exports
 * redraw them at the output ratio for the time of the capture.
 */

export interface ExportLayer {
  redrawAt: (pixelRatio: number) => void;
  restore: () => void;
}

const layers = new Set<ExportLayer>();

export function registerExportLayer(layer: ExportLayer): () => void {
  layers.add(layer);
  return () => { layers.delete(layer); };
}

/** Largest canvas side browsers accept (Chrome, Firefox: 32 767; Safari less). */
const MAX_CANVAS_SIDE = 16384;

/** The ratio a layer of this CSS size can be drawn at, at most `pixelRatio`. */
export function clampPixelRatio(pixelRatio: number, cssWidth: number, cssHeight: number): number {
  const side = Math.max(cssWidth, cssHeight, 1);
  return Math.max(1, Math.min(pixelRatio, MAX_CANVAS_SIDE / side));
}

/** UI drawn over the graph, left out of an image export: grid, minimap, panels. */
const NOT_EXPORTED = '.react-flow__background, .react-flow__minimap, .react-flow__panel, [data-export-ignore]';

/** html-to-image `filter`: false for the canvas UI that is not part of the graph. */
export function isExportedNode(node: HTMLElement): boolean {
  return !(node instanceof Element && node.matches(NOT_EXPORTED));
}

/** Runs a capture with every layer drawn at `pixelRatio`, then back to the screen's. */
export async function withLayersAt<T>(pixelRatio: number, capture: () => Promise<T>): Promise<T> {
  for (const layer of layers) layer.redrawAt(pixelRatio);
  try {
    return await capture();
  } finally {
    for (const layer of layers) layer.restore();
  }
}
