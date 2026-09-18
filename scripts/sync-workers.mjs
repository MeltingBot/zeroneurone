/**
 * Copy third-party web workers into public/ so the build emits them.
 *
 * Both libraries resolve their worker at runtime rather than through a static
 * import, so Rollup cannot see the reference and never emits the file:
 *
 *   maplibre-gl: new URL(`./maplibre-gl-worker.mjs`, import.meta.url)
 *   pdfjs-dist:  workerSrc pointing at a served path
 *
 * Without the copy the request falls through to the SPA rewrite, which answers
 * index.html with a 200 and text/html. The Worker then fails silently: MapLibre
 * parses no GeoJSON source at all, so link lines, zones and every other vector
 * layer are simply absent, with nothing in the console.
 *
 * maplibre-gl-worker.mjs must land in assets/ because the URL above is resolved
 * relative to the maplibre chunk, which Vite emits into assets/. It also does
 * `import "./maplibre-gl-shared.mjs"` at runtime, so that file has to sit next
 * to it or the worker dies on its first import with the same MIME error.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

const WORKERS = [
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs'],
  ['maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/assets/maplibre-gl-worker.mjs'],
  ['maplibre-gl/dist/maplibre-gl-shared.mjs', 'public/assets/maplibre-gl-shared.mjs'],
];

// The MapLibre files end with a //# sourceMappingURL= comment. We do not ship
// the .map files — they weigh 2.5 MB and the rest of the bundle carries no
// source maps either — so the browser would fetch a path that falls through to
// the SPA rewrite and report "JSON.parse: unexpected character" in the console
// of anyone with devtools open. Drop the directive instead.
function stripSourceMappingURL(text) {
  return text.replace(/\n?\/\/# sourceMappingURL=.*$/, '\n');
}

for (const [from, to] of WORKERS) {
  mkdirSync(dirname(to), { recursive: true });
  const src = require.resolve(from);
  if (to.endsWith('.mjs')) {
    writeFileSync(to, stripSourceMappingURL(readFileSync(src, 'utf8')));
  } else {
    copyFileSync(src, to);
  }
  console.log(`  ${to}`);
}
