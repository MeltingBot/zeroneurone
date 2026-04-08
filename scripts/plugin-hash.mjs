#!/usr/bin/env node
/**
 * Plugin integrity hash generator.
 *
 * Usage:
 *   node scripts/plugin-hash.mjs dist/plugins/my-plugin.js
 *     → prints SHA-256 hex hash to stdout
 *
 *   node scripts/plugin-hash.mjs --manifest dist/plugins/manifest.json
 *     → updates all plugin entries in-place with their integrity hash
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';

async function computeHash(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage:');
  console.error('  node scripts/plugin-hash.mjs <plugin-file.js>');
  console.error('  node scripts/plugin-hash.mjs --manifest <manifest.json>');
  process.exit(1);
}

if (args[0] === '--manifest') {
  if (!args[1]) {
    console.error('Missing manifest path');
    process.exit(1);
  }

  const manifestPath = resolve(args[1]);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const dir = dirname(manifestPath);

  for (const entry of manifest.plugins) {
    const filePath = join(dir, entry.file);
    try {
      entry.integrity = await computeHash(filePath);
      console.log(`  ${entry.id}: ${entry.integrity}`);
    } catch (err) {
      console.error(`  ${entry.id}: FAILED — ${err.message}`);
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nManifest updated: ${manifestPath}`);
} else {
  const filePath = resolve(args[0]);
  const hash = await computeHash(filePath);
  console.log(hash);
}
