/**
 * Lambert 93 (EPSG:2154) → WGS 84 degrees, the projection of most French
 * public geodata (IGN, cadastre, communes). Lambert conformal conic with two
 * standard parallels on GRS80; RGF93 matches WGS 84 within a metre, so no
 * datum shift is applied.
 */

const A = 6378137;
const F = 1 / 298.257222101;
const E = Math.sqrt(2 * F - F * F);
const LAT1 = (49 * Math.PI) / 180;
const LAT2 = (44 * Math.PI) / 180;
const LAT0 = (46.5 * Math.PI) / 180;
const LNG0 = (3 * Math.PI) / 180;
const X0 = 700000;
const Y0 = 6600000;

const m = (lat: number) => Math.cos(lat) / Math.sqrt(1 - E * E * Math.sin(lat) ** 2);
const t = (lat: number) => {
  const es = E * Math.sin(lat);
  return Math.tan(Math.PI / 4 - lat / 2) / ((1 - es) / (1 + es)) ** (E / 2);
};

const N = (Math.log(m(LAT1)) - Math.log(m(LAT2))) / (Math.log(t(LAT1)) - Math.log(t(LAT2)));
const AF = (A * m(LAT1)) / (N * t(LAT1) ** N);
const R0 = AF * t(LAT0) ** N;

/** Lambert 93 metres [x, y] → WGS 84 [lng, lat] degrees */
export function lambert93ToWgs84([x, y]: [number, number]): [number, number] {
  const dx = x - X0;
  const dy = R0 - (y - Y0);
  const r = Math.sqrt(dx * dx + dy * dy);
  const tp = (r / AF) ** (1 / N);
  const lng = Math.atan2(dx, dy) / N + LNG0;
  let lat = Math.PI / 2 - 2 * Math.atan(tp);
  for (let i = 0; i < 10; i++) {
    const es = E * Math.sin(lat);
    const next = Math.PI / 2 - 2 * Math.atan(tp * ((1 - es) / (1 + es)) ** (E / 2));
    if (Math.abs(next - lat) < 1e-12) { lat = next; break; }
    lat = next;
  }
  return [(lng * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** WGS 84 [lng, lat] degrees → Lambert 93 metres [x, y] */
export function wgs84ToLambert93([lng, lat]: [number, number]): [number, number] {
  const r = AF * t((lat * Math.PI) / 180) ** N;
  const theta = N * ((lng * Math.PI) / 180 - LNG0);
  return [X0 + r * Math.sin(theta), Y0 + R0 - r * Math.cos(theta)];
}

/** True for the ways a GeoJSON `crs` names Lambert 93 (EPSG:2154, urn:ogc:def:crs:EPSG::2154) */
export function isLambert93CrsName(name: unknown): boolean {
  return typeof name === 'string' && /EPSG:{1,2}2154$/i.test(name.trim());
}
