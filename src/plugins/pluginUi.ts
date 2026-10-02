/**
 * UI helpers lent to plugins: ZN components a plugin can open without
 * importing them. The plugin gets a promise; ZN renders the component
 * through PluginUiHost (mounted once in App).
 *
 * Network access stays ZN's: the geo picker loads its map tiles and runs its
 * address search itself, as it does from the element panel.
 */

import { useSyncExternalStore } from 'react';

export interface PickedLocation {
  lat: number;
  lng: number;
}

export interface GeoPickOptions {
  /** Text put in the picker's search field (e.g. an address read in a document). */
  query?: string;
}

interface GeoPickRequest {
  /** Changes with each request, so the host remounts the picker. */
  id: number;
  initial?: PickedLocation;
  query?: string;
  resolve: (result: PickedLocation | null) => void;
}

let current: GeoPickRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/**
 * Opens ZN's map picker. Resolves with the chosen point, or null when the
 * user cancels. A request still open is cancelled by a new one.
 */
export function openGeoPicker(initial?: PickedLocation, options?: GeoPickOptions): Promise<PickedLocation | null> {
  current?.resolve(null);
  return new Promise((resolve) => {
    current = { id: nextId++, initial, query: options?.query, resolve };
    notify();
  });
}

/** Called by the host when the picker closes. */
export function settleGeoPick(result: PickedLocation | null): void {
  const request = current;
  current = null;
  notify();
  request?.resolve(result);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Request currently shown, if any. */
export function getGeoPickRequest(): GeoPickRequest | null {
  return current;
}

export function useGeoPickRequest(): GeoPickRequest | null {
  return useSyncExternalStore(subscribe, getGeoPickRequest);
}
