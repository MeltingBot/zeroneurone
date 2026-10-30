/** MapLibre layers drawn by the map view: link lines and arrows, density heatmap */

import * as maplibregl from 'maplibre-gl';

// Links are drawn by a fixed set of layers over two sources (lines, arrows),
// whatever their number: a source and layers per link made each addLayer
// re-validate the whole style and each frame walk a thousand sources.
export const LINK_LINES_SOURCE = 'link-lines';

export const LINK_ARROWS_SOURCE = 'link-arrows';

export const LINK_OUTLINE_LAYER = 'link-outline';

const LINK_LINE_LAYERS = { solid: 'link-line-solid', dashed: 'link-line-dashed', dotted: 'link-line-dotted' } as const;

const LINK_ARROWS_LAYER = 'link-arrows';

const LINK_DASHES = { dashed: [10, 6], dotted: [3, 6] } as const;

// Density overlay: one point source and one heatmap layer, drawn under the links
/** Sequential ramp by density, transparent where there is nothing (also drawn in the legend) */
export const DENSITY_RAMP: [number, string][] = [
  [0, 'rgba(254, 240, 217, 0)'],
  [0.05, 'rgba(253, 212, 158, 0.55)'],
  [0.3, 'rgb(253, 187, 132)'],
  [0.55, 'rgb(252, 141, 89)'],
  [0.75, 'rgb(227, 74, 51)'],
  [1, 'rgb(179, 0, 0)'],
];

export const DENSITY_SOURCE = 'density-points';

export const DENSITY_LAYER = 'density-heatmap';

/** Weight of one density point: full up to about a hundred points, then
 *  decreasing with the square root of their number. */
export function densityPointWeight(count: number): number {
  return Math.min(1, 10 / Math.sqrt(Math.max(1, count)));
}

/** Adds the density source and layer, unless a style already has them. */
export function ensureDensityLayer(map: maplibregl.Map) {
  if (map.getSource(DENSITY_SOURCE)) return;
  map.addSource(DENSITY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: DENSITY_LAYER,
    type: 'heatmap',
    source: DENSITY_SOURCE,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
      // Wide enough at low zoom for a lone point to stay visible
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 6, 24, 15, 50],
      'heatmap-opacity': 0.8,
      // Sequential ramp, transparent where there is nothing
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...DENSITY_RAMP.flat()],
    },
  }, map.getLayer(LINK_OUTLINE_LAYER) ? LINK_OUTLINE_LAYER : undefined);
}

/** Adds the link sources and layers, unless a style already has them. */
export function ensureLinkLayers(map: maplibregl.Map) {
  if (map.getSource(LINK_LINES_SOURCE)) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  map.addSource(LINK_LINES_SOURCE, { type: 'geojson', data: empty });
  map.addSource(LINK_ARROWS_SOURCE, { type: 'geojson', data: empty });
  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;
  map.addLayer({
    id: LINK_OUTLINE_LAYER,
    type: 'line',
    source: LINK_LINES_SOURCE,
    paint: {
      'line-color': '#ffffff',
      'line-width': ['+', ['get', 'width'], 4],
      // halo: 0 hides the white outline (density shown)
      'line-opacity': ['*', 0.9, ['get', 'opacity'], ['get', 'halo']],
    },
    layout: lineLayout,
  });
  for (const style of ['solid', 'dashed', 'dotted'] as const) {
    map.addLayer({
      id: LINK_LINE_LAYERS[style],
      type: 'line',
      source: LINK_LINES_SOURCE,
      filter: ['==', ['get', 'style'], style],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': ['get', 'opacity'],
        ...(style === 'solid' ? {} : { 'line-dasharray': [...LINK_DASHES[style]] }),
      },
      layout: lineLayout,
    });
  }
  map.addLayer({
    id: LINK_ARROWS_LAYER,
    type: 'symbol',
    source: LINK_ARROWS_SOURCE,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-rotate': ['get', 'rotate'],
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['get', 'opacity'] },
  });
}

/** Arrow icon in a link colour: the former DOM arrow (same path, white
 *  outline, soft shadow), drawn once per colour at 2× for sharpness. */
export function ensureArrowImage(map: maplibregl.Map, fill: string): string {
  const id = `link-arrow-${fill}`;
  if (map.hasImage(id)) return id;
  const ratio = 2, size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return id;
  ctx.scale(ratio, ratio);
  ctx.translate(2, 2);
  const path = new Path2D('M10 2 L18 18 L10 13 L2 18 Z');
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1 * ratio;
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio });
  return id;
}
