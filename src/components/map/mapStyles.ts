/** Basemaps: tile sources, the MapLibre style built from them, terrain and 3D buildings */

import * as maplibregl from 'maplibre-gl';

// Vector basemaps served as a complete style document. Unlike the raster
// entries below, these are handed to MapLibre as a URL: the provider owns the
// whole style, so we cannot assemble it locally.
//
// OpenFreeMap needs no API key, sets no quota and allows commercial use; only
// attribution is required, and MapLibre adds it from the style itself. The
// project already backs the 3D buildings source (see add3DBuildingsLayer).
const STYLE_SOURCES: Record<string, string> = {
  ofmPositron: 'https://tiles.openfreemap.org/styles/positron',
  ofmLiberty: 'https://tiles.openfreemap.org/styles/liberty',
  ofmDark: 'https://tiles.openfreemap.org/styles/dark',
  ofmFiord: 'https://tiles.openfreemap.org/styles/fiord',
};

/** Variants offered in the basemap dropdown. 'auto' follows the theme. */
export const OFM_VARIANTS = [
  { id: 'auto' as const, labelKey: 'map.ofmAuto', fallback: 'Automatique' },
  { id: 'positron' as const, labelKey: 'map.ofmPositron', fallback: 'Clair' },
  { id: 'liberty' as const, labelKey: 'map.ofmLiberty', fallback: 'Détaillé' },
  { id: 'dark' as const, labelKey: 'map.ofmDark', fallback: 'Sombre' },
  { id: 'fiord' as const, labelKey: 'map.ofmFiord', fallback: 'Contrasté' },
];

// Raster tile sources
const TILE_SOURCES: Record<string, { tiles: string[]; attribution: string; maxzoom: number; tileSize?: number; subdomains?: string }> = {
  osm: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxzoom: 19,
  },
  osmFr: {
    tiles: ['https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.fr">OSM France</a>',
    maxzoom: 19,
  },
  osmDe: {
    tiles: ['https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.de/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.de/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.de">OSM Deutschland</a>',
    maxzoom: 19,
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxzoom: 18,
  },
};

export const BASE_LAYERS = [
  { id: 'ofm', label: 'OpenFreeMap' },
  // Kept as a fallback provider: OpenFreeMap runs on donations, and a single
  // basemap supplier would leave no map at all if it ever stopped.
  { id: 'osm', label: 'OSM' },
  { id: 'satellite', label: 'Satellite' },
];

export function resolveLayerId(id: string, isDark: boolean, ofmVariant: string): string {
  // Stored preferences may still name basemaps that no longer exist: CartoDB
  // (now behind an API key) and the localized OSM raster entry. Map them to
  // something valid rather than render a blank map.
  if (id === 'carto' || id === 'cartoLight' || id === 'cartoDark') return 'ofm';
  if (id === 'osmLocalized' || id === 'osmFr' || id === 'osmDe') return 'osm';

  if (id === 'ofm') {
    if (ofmVariant === 'auto') return isDark ? 'ofmDark' : 'ofmPositron';
    return `ofm${ofmVariant.charAt(0).toUpperCase()}${ofmVariant.slice(1)}`;
  }
  return id;
}

/**
 * Build the style for a basemap.
 *
 * Returns a URL for provider-owned vector styles, and a hand-assembled style
 * object for raster tile sets. MapLibre accepts either in `setStyle` and in the
 * Map constructor. Terrain is only injected in the object form; for a remote
 * style the 3D effect adds the source itself once the style has loaded.
 */
export function buildMapStyle(activeLayerId: string, enable3D: boolean): maplibregl.StyleSpecification | string {
  const styleUrl = STYLE_SOURCES[activeLayerId];
  if (styleUrl) return styleUrl;

  const src = TILE_SOURCES[activeLayerId];
  const sources: maplibregl.StyleSpecification['sources'] = {
    'base-tiles': {
      type: 'raster',
      tiles: src.tiles,
      tileSize: 256,
      attribution: src.attribution,
      maxzoom: src.maxzoom,
    },
  };
  if (enable3D) {
    sources['terrain-dem'] = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
    };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: 'base-layer', type: 'raster', source: 'base-tiles' },
    ],
  };
}

/**
 * Make sure the elevation source exists before enabling terrain.
 *
 * buildMapStyle only embeds it in the raster style it assembles itself. A
 * provider-owned style (OpenFreeMap) arrives without it, so setTerrain would
 * fail there unless we add it first.
 */
export function ensureTerrainSource(map: maplibregl.Map) {
  if (map.getSource('terrain-dem')) return;
  map.addSource('terrain-dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    encoding: 'terrarium',
  });
}

/**
 * Show or hide the basemap's own extruded buildings.
 *
 * OpenFreeMap styles carry a `building` fill layer, and Liberty adds a
 * `building-3d` fill-extrusion one. Toggling our own layer therefore left the
 * style's extrusions on screen, so the button looked broken on OpenFreeMap
 * while it worked on the raster basemaps.
 *
 * Only extrusion layers are touched: the flat `building` fill belongs to the
 * basemap's own rendering, exactly as building footprints baked into an OSM
 * raster tile do, and the button is about 3D buildings.
 */
export function setBasemapBuildings(map: maplibregl.Map, visible: boolean) {
  for (const layer of map.getStyle().layers) {
    if (layer.id === '3d-buildings') continue;
    if (layer.type !== 'fill-extrusion') continue;
    if ((layer as { 'source-layer'?: string })['source-layer'] !== 'building') continue;
    try {
      map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
    } catch { /* layer may vanish with a style change */ }
  }
}

export function add3DBuildingsLayer(map: maplibregl.Map) {
  // Guard on the layer, not the source: an OpenFreeMap basemap is built on
  // OpenMapTiles and already ships a source under this very name, so testing
  // the source made the function return before adding anything and the
  // buildings toggle did nothing there.
  setBasemapBuildings(map, true);
  if (map.getLayer('3d-buildings')) return;
  if (!map.getSource('openmaptiles')) {
    map.addSource('openmaptiles', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    });
  }
  // Find the first link layer to insert buildings below it
  const firstLinkLayer = map.getStyle().layers.find(l => l.id.startsWith('link-'));
  map.addLayer(
    {
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#d4cfc8',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    },
    firstLinkLayer?.id,
  );
}
