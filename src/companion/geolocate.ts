import type { GeoData } from '../types';

/** The phone's position, asked once (the browser asks the person the first time) */
export interface Located {
  lat: number;
  lng: number;
  /** Radius of uncertainty, in metres */
  accuracy: number;
}

export function locateOnce(): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}

/** Located elements of the dossier (a polygon by its centre), one left out */
export function dossierPoints(elements: { id: string; geo: GeoData | null }[], except?: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  for (const e of elements) {
    if (e.id === except || !e.geo) continue;
    const p = e.geo.type === 'point' ? e.geo : e.geo.center;
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) out.push({ lat: p.lat, lng: p.lng });
  }
  return out;
}
