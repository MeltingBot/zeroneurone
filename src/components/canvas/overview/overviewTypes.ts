/**
 * Data shared by the canvas overview layer modules: what is drawn, packed in
 * typed arrays so that 10 000 nodes and 15 000 links are walked every frame
 * without allocating.
 */

// Shapes
export const SHAPE_RECT = 0;
export const SHAPE_SQUARE = 1;
export const SHAPE_CIRCLE = 2;
export const SHAPE_DIAMOND = 3;
export const SHAPE_HEXAGON = 4;
export const SHAPE_GROUP = 5;
export const SHAPE_ANNOTATION = 6;

// Node flags
export const NODE_SELECTED = 1;
export const NODE_DIMMED = 2;
export const NODE_EMPHASIZED = 4;
export const NODE_GHOST = 8;
export const NODE_REMOTE = 16;

// Link flags
export const LINK_SELECTED = 1;
export const LINK_DIMMED = 2;
export const LINK_ARROW_START = 4;
export const LINK_ARROW_END = 8;

// Line styles (borders and links)
export const STYLE_SOLID = 0;
export const STYLE_DASHED = 1;
export const STYLE_DOTTED = 2;

export interface SpatialGrid {
  cells: Map<number, number[]>;
  /** Groups, annotations and oversized nodes, tested one by one. */
  large: number[];
  /** Dedup stamps for queries (a node spans several cells). */
  stamp: Uint32Array;
  stampValue: number;
}

export interface OverviewScene {
  nodeCount: number;
  ids: string[];
  indexById: Map<string, number>;
  /** Absolute top-left corner and size, in flow units. */
  x: Float32Array;
  y: Float32Array;
  w: Float32Array;
  h: Float32Array;
  shape: Uint8Array;
  /** Indices into `palette`. */
  fill: Uint16Array;
  stroke: Uint16Array;
  remoteColor: Uint16Array;
  borderWidth: Float32Array;
  borderStyle: Uint8Array;
  flags: Uint8Array;

  linkCount: number;
  linkIds: string[];
  /** Node indices of each link's ends. */
  from: Int32Array;
  to: Int32Array;
  linkColor: Uint16Array;
  linkStyle: Uint8Array;
  linkWidth: Float32Array;
  linkFlags: Uint8Array;

  palette: string[];
  grid: SpatialGrid;
}
