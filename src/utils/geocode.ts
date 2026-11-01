/** Place search through Nominatim (OpenStreetMap geocoding) */

import i18next from 'i18next';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

/** First match for `query`, or null when nothing is found. Throws on network errors. */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
    { headers: { 'Accept-Language': i18next.language || 'fr' } }
  );
  const results: Array<{ lat: string; lon: string }> = await response.json();
  if (results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}
