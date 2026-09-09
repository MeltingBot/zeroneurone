// Regenerate package-lock.json for the Docker image build.
//
// The lock is computed in an isolated temp dir (package.json only) so it
// matches what `npm ci` sees inside the image — free of the monorepo's
// workspace links. Two robustness measures, both learned the hard way:
//
//   1. The nested npm must NOT inherit the parent npm's `npm_*` env:
//      a leaked `npm_config_workspace` makes arborist attempt workspace
//      resolution in the workspace-less temp dir and crash with
//      "Cannot read properties of null (reading 'edgesOut')".
//
//   2. npm 10's arborist can still crash the same way on some peer-dep
//      resolution paths (a known, environment-sensitive bug). When the
//      first attempt fails, retry through `npx npm@11`, whose arborist
//      has the fix. npm 11 emits the same lockfileVersion 3 that the
//      image's `npm ci` consumes. (npm 12 is NOT a drop-in: its remote-
//      fetch policy rejects URL-tarball deps like oxide-wasm32-wasi.)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const dir = fs.mkdtempSync('/tmp/zn-lock-');
fs.copyFileSync('package.json', path.join(dir, 'package.json'));

// Strip every npm_* var (npm_config_*, npm_lifecycle_*, npm_package_*).
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k)),
);

const run = (npmCmd) =>
  execSync(`${npmCmd} install --package-lock-only`, {
    cwd: dir, stdio: 'inherit', env,
  });

try {
  try {
    run('npm');
  } catch {
    // npm 10 arborist crash ("edgesOut" on peer resolution) — npm 11
    // resolves the same tree without the bug.
    console.warn('[generate-docker-lock] npm failed, retrying via npx npm@11…');
    run('npx --yes npm@11');
  }
  fs.copyFileSync(path.join(dir, 'package-lock.json'), 'package-lock.json');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
