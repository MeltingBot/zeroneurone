#!/usr/bin/env node
/**
 * Build all YPSI plugins, copy to public/plugins/, and generate manifest.json.
 *
 * The source repo ships an empty manifest (no plugin entries).
 * This script generates the full manifest v2 with trust levels and integrity hashes.
 *
 * Usage:
 *   node scripts/build-plugins.mjs              # build all + generate manifest
 *   node scripts/build-plugins.mjs --skip-build # just copy + generate manifest (if already built)
 */
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const znRoot = resolve(__dirname, '..');
const monorepoRoot = resolve(znRoot, '..');
const pluginsDir = resolve(znRoot, 'public/plugins');
const manifestPath = resolve(pluginsDir, 'manifest.json');

const skipBuild = process.argv.includes('--skip-build');

// ─── YPSI plugin registry ────────────────────────────────────
// All metadata lives here — the manifest is generated, never hand-edited.

const PLUGINS = [
  {
    id: 'one-neurone',
    workspace: 'oneneurone',
    output: 'oneneurone.js',
    name: 'OneNeurone',
    description: 'IA locale — analyse, enrichissement, cross-analysis',
    trust: 'trusted',
  },
  {
    id: 'vault-neurone',
    workspace: 'vaultneurone',
    output: 'vaultneurone.js',
    name: 'VaultNeurone',
    description: 'Backup chiffré S3/WebDAV',
    trust: 'trusted',
  },
  {
    id: 'go-neurone',
    workspace: 'goneurone',
    output: 'goneurone.js',
    name: 'GoNeurone',
    description: 'Guide métier — arbres de décision et profils d\'analyse',
    trust: 'trusted',
  },
  {
    id: 'spot-neurone',
    workspace: 'spotneurone',
    output: 'spotneurone.js',
    name: 'SpotNeurone',
    description: 'Géolocalisation et analyse spatiale',
    trust: 'trusted',
  },
];

function computeHash(filePath) {
  const buffer = readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

// ─── 1. Build + copy ────────────────────────────────────────

const builtPlugins = [];

for (const plugin of PLUGINS) {
  const pluginDir = resolve(monorepoRoot, plugin.workspace);
  if (!existsSync(pluginDir)) {
    console.warn(`  ⚠ ${plugin.workspace}/ not found, skipping`);
    continue;
  }

  if (!skipBuild) {
    console.log(`\n  Building ${plugin.workspace}...`);
    try {
      execSync(`npm run --workspace=${plugin.workspace} build:plugin`, {
        cwd: monorepoRoot,
        stdio: 'inherit',
      });
    } catch {
      console.error(`  ✗ ${plugin.workspace} build failed`);
      continue;
    }
  }

  const src = resolve(pluginDir, 'dist-plugin', plugin.output);
  const dest = resolve(pluginsDir, plugin.output);

  if (!existsSync(src)) {
    console.warn(`  ⚠ ${src} not found after build`);
    continue;
  }

  // Check if dest is a symlink pointing to src — no copy needed
  try {
    if (existsSync(dest) && realpathSync(dest) === realpathSync(src)) {
      console.log(`  ✓ ${plugin.output} (symlink, no copy needed)`);
    } else {
      copyFileSync(src, dest);
      console.log(`  ✓ ${plugin.output} copied`);
    }
  } catch {
    copyFileSync(src, dest);
    console.log(`  ✓ ${plugin.output} copied`);
  }

  builtPlugins.push(plugin);
}

// ─── 2. Generate manifest v2 ────────────────────────────────

const manifest = {
  manifestVersion: '2',
  plugins: [],
};

console.log('\n  Generating manifest v2:');

for (const plugin of builtPlugins) {
  const filePath = join(pluginsDir, plugin.output);
  const integrity = computeHash(filePath);

  manifest.plugins.push({
    id: plugin.id,
    file: plugin.output,
    name: plugin.name,
    description: plugin.description,
    trust: plugin.trust,
    integrity,
  });

  console.log(`    ${plugin.id}: ${integrity.slice(0, 16)}...`);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n  ✓ Manifest generated (${manifest.plugins.length} plugins)\n`);
