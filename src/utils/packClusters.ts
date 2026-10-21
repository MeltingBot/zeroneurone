/**
 * Places cluster discs (largest first) on an Archimedean spiral around the
 * first one, each at the first spot free of the others. The spiral has no
 * turn limit and walks by arc length, so hundreds of small clusters still
 * form a compact round cloud instead of spilling into a row. Clusters are
 * sorted by decreasing radius, so each search resumes about one turn before
 * the previous hit rather than from the centre.
 *
 * `fixed` discs (locked elements) are taken as already placed: clusters fill
 * the space around them, the largest one included, instead of covering them.
 */
export function packClusters(
  layouts: { radius: number; cx: number; cy: number }[],
  fixed: { cx: number; cy: number; r: number }[] = [],
): void {
  if (layouts.length === 0) return;
  const margin = (r1: number, r2: number) => Math.max(80, 0.12 * (r1 + r2));
  // Distance between spiral turns: about one small-to-mid cluster diameter
  const radii = layouts.map((L) => L.radius).sort((x, y) => x - y);
  const typical = radii[Math.floor(radii.length / 2)];
  const a = (2 * typical + margin(typical, typical)) / (2 * Math.PI);

  // Uniform grid over the placed discs: a candidate spot is only checked
  // against the discs near it (same result as checking them all)
  const cell = Math.max(200, 2 * typical + margin(typical, typical));
  const grid = new Map<string, { cx: number; cy: number; r: number }[]>();
  const add = (p: { cx: number; cy: number; r: number }) => {
    for (let gx = Math.floor((p.cx - p.r) / cell); gx <= Math.floor((p.cx + p.r) / cell); gx++) {
      for (let gy = Math.floor((p.cy - p.r) / cell); gy <= Math.floor((p.cy + p.r) / cell); gy++) {
        const key = `${gx},${gy}`;
        const list = grid.get(key);
        if (list) list.push(p); else grid.set(key, [p]);
      }
    }
  };
  let maxPlacedR = 0;
  const place = (p: { cx: number; cy: number; r: number }) => {
    add(p);
    if (p.r > maxPlacedR) maxPlacedR = p.r;
  };
  for (const f of fixed) place(f);

  // Free if no placed disc is within R + r + margin of (x, y). Any such disc
  // has its bounding box inside the query box of half-size R + max margin.
  const isFree = (x: number, y: number, R: number): boolean => {
    const reach = R + margin(R, maxPlacedR);
    for (let gx = Math.floor((x - reach) / cell); gx <= Math.floor((x + reach) / cell); gx++) {
      for (let gy = Math.floor((y - reach) / cell); gy <= Math.floor((y + reach) / cell); gy++) {
        for (const p of grid.get(`${gx},${gy}`) ?? []) {
          const minDist = R + p.r + margin(R, p.r);
          const dx = x - p.cx;
          const dy = y - p.cy;
          if (dx * dx + dy * dy < minDist * minDist) return false;
        }
      }
    }
    return true;
  };

  let first = 0;
  if (fixed.length === 0) {
    layouts[0].cx = 0; layouts[0].cy = 0;
    place({ cx: 0, cy: 0, r: layouts[0].radius });
    first = 1;
  }
  let theta = 0;
  for (let i = first; i < layouts.length; i++) {
    const L = layouts[i];
    theta = Math.max(0, theta - 2 * Math.PI);
    const stepLen = Math.max(20, L.radius / 2);
    for (;;) {
      const r = a * theta;
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      if (isFree(x, y, L.radius)) { L.cx = x; L.cy = y; break; }
      theta += stepLen / Math.max(r, stepLen);
    }
    place({ cx: L.cx, cy: L.cy, r: L.radius });
  }
}
