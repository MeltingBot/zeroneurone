/** Shapes the map hooks share with MapView */

import type * as maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import type { useMapTemporalGeo } from './useMapTemporalGeo';

/** Element placed on the map: its resolved position and marker key (one element can have several markers) */
export type MapGeoElement = ReturnType<typeof useMapTemporalGeo>['geoElements'][number];

// Cluster lookup: for each element, where it visually appears
export interface ClusterState {
  clustered: boolean;
  clusterCenter?: [number, number]; // [lng, lat]
  clusterId?: number;
}

/** Per cluster: center, member keys, and whether the members are co-located (zooming can never separate them) */
export interface ClusterMeta {
  center: [number, number];
  leafKeys: string[];
  degenerate: boolean;
}

/** Marker badge listeners reach React state through these */
export interface EventPopoverHandlers {
  open: (elementId: string, anchor: HTMLElement) => void;
  toggle: (elementId: string, anchor: HTMLElement) => void;
  scheduleClose: () => void;
}

export type MapRef = RefObject<maplibregl.Map | null>;
export type MarkerMapRef<K> = RefObject<Map<K, maplibregl.Marker>>;
