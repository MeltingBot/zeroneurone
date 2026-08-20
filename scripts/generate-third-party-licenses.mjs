#!/usr/bin/env node
/**
 * Génère public/THIRD_PARTY_LICENSES.txt à partir de l'arbre de dépendances
 * de production réellement installé.
 *
 * Raison d'être : le bundle est minifié par esbuild, qui supprime les
 * commentaires de licence. Or MIT, ISC, BSD et Apache-2.0 imposent tous que
 * l'avis de copyright accompagne la distribution binaire. Ce fichier est cette
 * pièce jointe ; il est servi statiquement et lié depuis la modale « À propos ».
 *
 * Lancé automatiquement par `prebuild`. Manuellement : npm run licenses
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(projectRoot, 'public', 'THIRD_PARTY_LICENSES.txt');

// Répertoires où chercher un paquet : le monorepo hisse la plupart des
// dépendances à sa racine, quelques-unes restent locales au workspace.
const NODE_MODULES_ROOTS = [
  join(projectRoot, '..', 'node_modules'),
  join(projectRoot, 'node_modules'),
];

/**
 * Paquets sous double licence : le choix retenu par ZeroNeurone est explicite
 * ici plutôt que laissé à l'interprétation du lecteur.
 */
const DUAL_LICENSE_CHOICES = {
  dompurify: 'Apache-2.0 (parmi MPL-2.0 ou Apache-2.0)',
  jszip: 'MIT (parmi MIT ou GPL-3.0-or-later)',
  'vis-data': 'MIT (parmi Apache-2.0 ou MIT)',
  'vis-util': 'MIT (parmi Apache-2.0 ou MIT)',
  '@maplibre/mlt': 'MIT (parmi MIT ou Apache-2.0)',
};

/**
 * Fichiers de licence reconnus. Le suffixe libre capte aussi bien LICENSE.txt
 * que LICENSE.markdown ou les variantes par licence (LICENSE-MIT,
 * LICENSE-APACHE-2.0) publiées par les paquets sous double licence.
 */
const LICENSE_FILE_PATTERN = /^(LICENSE|LICENCE|COPYING)([-._].*)?$/i;
const NOTICE_FILE_PATTERN = /^NOTICE([-._].*)?$/i;

/**
 * Quand un paquet publie un fichier par licence, retenir celui qui correspond à
 * l'option choisie dans DUAL_LICENSE_CHOICES.
 */
const DUAL_LICENSE_FILE_HINTS = {
  dompurify: /apache/i,
  jszip: /mit/i,
  'vis-data': /mit/i,
  'vis-util': /mit/i,
  '@maplibre/mlt': /mit/i,
};

/** Repêchage d'un avis de copyright pour les paquets sans fichier de licence. */
const COPYRIGHT_LINE_PATTERN = /^.*copyright\s+(\(c\)|©|\d{4}).*$/gim;
const README_PATTERN = /^README([-._].*)?$/i;

function readProductionTree() {
  const raw = execFileSync(
    'npm',
    ['ls', '--omit=dev', '--all', '--json'],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(raw);
}

function collectPackages(tree) {
  const found = new Map(); // name -> version
  const visit = (node) => {
    for (const [name, info] of Object.entries(node.dependencies ?? {})) {
      if (typeof info !== 'object' || info === null) continue;
      if (!found.has(name)) found.set(name, info.version);
      visit(info);
    }
  };
  visit(tree);
  return found;
}

function findPackageDir(name) {
  for (const root of NODE_MODULES_ROOTS) {
    const dir = join(root, name);
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  return null;
}

function normalizeLicenseField(manifest) {
  const value = manifest.license ?? manifest.licenses;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'object' ? entry.type : entry)).join(' OR ');
  }
  if (value && typeof value === 'object') return value.type ?? null;
  return null;
}

/** Les avis relevés dans un README markdown peuvent être échappés en HTML. */
function decodeHtmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function readLegalFiles(dir, name) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return { license: null, notice: null, copyright: null };
  }
  const read = (file) => {
    try {
      return readFileSync(join(dir, file), 'utf8').trim();
    } catch {
      return null;
    }
  };

  const licenseFiles = entries.filter((entry) => LICENSE_FILE_PATTERN.test(entry));
  const hint = DUAL_LICENSE_FILE_HINTS[name];
  const licenseFile =
    (hint && licenseFiles.find((file) => hint.test(file))) ?? licenseFiles[0] ?? null;

  const noticeFile = entries.find((entry) => NOTICE_FILE_PATTERN.test(entry)) ?? null;

  // Sans fichier dédié, l'avis de copyright se trouve souvent dans le README.
  let copyright = null;
  if (!licenseFile) {
    const readme = entries.find((entry) => README_PATTERN.test(entry));
    const content = readme ? read(readme) : null;
    const matches = content?.match(COPYRIGHT_LINE_PATTERN);
    if (matches?.length) {
      copyright = [...new Set(matches.map((line) => decodeHtmlEntities(line.trim())))]
        .slice(0, 3)
        .join('\n');
    }
  }

  return {
    license: licenseFile ? read(licenseFile) : null,
    notice: noticeFile ? read(noticeFile) : null,
    copyright,
  };
}

function buildEntries(packages) {
  const entries = [];
  const unresolved = [];

  for (const [name, version] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const dir = findPackageDir(name);
    if (!dir) {
      // Binaires optionnels d'autres plateformes et peerDependencies non
      // installées : absents du disque, donc absents de la distribution.
      unresolved.push(name);
      continue;
    }
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const { license, notice, copyright } = readLegalFiles(dir, name);
    const author =
      typeof manifest.author === 'object' ? manifest.author?.name : manifest.author;
    entries.push({
      name,
      version: manifest.version ?? version,
      spdx: normalizeLicenseField(manifest),
      homepage: manifest.homepage ?? manifest.repository?.url ?? null,
      author: author ?? null,
      licenseText: license,
      noticeText: notice,
      copyrightNotice: copyright,
    });
  }

  return { entries, unresolved };
}

function formatDocument({ entries, unresolved }) {
  const appManifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const rule = '='.repeat(78);
  const out = [];

  out.push(rule);
  out.push(`ZeroNeurone ${appManifest.version} — Licences des composants tiers`);
  out.push(rule);
  out.push('');
  out.push('ZeroNeurone est distribué sous licence MIT (voir le fichier LICENSE).');
  out.push('');
  out.push('Ce document reproduit les avis de copyright et les licences des composants');
  out.push('tiers inclus dans la distribution, conformément à leurs termes respectifs.');
  out.push('Il est généré automatiquement à partir des dépendances de production');
  out.push('réellement installées — les outils de développement, absents du produit');
  out.push("livré, n'y figurent pas.");
  out.push('');
  out.push(`Composants recensés : ${entries.length}`);
  out.push('');

  const choices = entries.filter((entry) => DUAL_LICENSE_CHOICES[entry.name]);
  if (choices.length > 0) {
    out.push('-'.repeat(78));
    out.push('Composants sous double licence — option retenue');
    out.push('-'.repeat(78));
    out.push('');
    for (const entry of choices) {
      out.push(`  ${entry.name} : ${DUAL_LICENSE_CHOICES[entry.name]}`);
    }
    out.push('');
  }

  out.push('-'.repeat(78));
  out.push('Sommaire');
  out.push('-'.repeat(78));
  out.push('');
  for (const entry of entries) {
    out.push(`  ${entry.name}@${entry.version} — ${entry.spdx ?? 'licence non déclarée'}`);
  }
  out.push('');

  for (const entry of entries) {
    out.push(rule);
    out.push(`${entry.name}@${entry.version}`);
    out.push(rule);
    out.push('');
    out.push(`Licence déclarée : ${entry.spdx ?? 'non déclarée dans le manifeste'}`);
    if (DUAL_LICENSE_CHOICES[entry.name]) {
      out.push(`Option retenue   : ${DUAL_LICENSE_CHOICES[entry.name]}`);
    }
    if (entry.homepage) out.push(`Source           : ${entry.homepage}`);
    out.push('');
    if (entry.noticeText) {
      // Apache-2.0 §4(d) : le contenu du NOTICE doit être reproduit.
      out.push('--- NOTICE ---');
      out.push('');
      out.push(entry.noticeText);
      out.push('');
    }
    if (entry.licenseText) {
      out.push(entry.licenseText);
    } else {
      // Le paquet ne publie pas de fichier de licence : on reproduit ce qui est
      // disponible (avis relevé dans le README, auteur déclaré) et on renvoie au
      // texte de référence de la licence annoncée.
      out.push("Ce paquet ne publie pas de fichier de licence.");
      if (entry.copyrightNotice) {
        out.push('');
        out.push(entry.copyrightNotice);
      } else if (entry.author) {
        out.push('');
        out.push(`Auteur déclaré : ${entry.author}`);
      }
      out.push('');
      out.push(
        `Distribué sous licence ${entry.spdx ?? 'non déclarée'} — se reporter au texte de référence de cette licence.`
      );
    }
    out.push('');
  }

  if (unresolved.length > 0) {
    out.push(rule);
    out.push('Non inclus dans la distribution');
    out.push(rule);
    out.push('');
    out.push('Déclarés dans l’arbre de dépendances mais absents du disque : binaires');
    out.push('optionnels destinés à d’autres plateformes et dépendances de pair non');
    out.push('installées. Ils ne font pas partie du produit livré.');
    out.push('');
    for (const name of unresolved.sort()) out.push(`  ${name}`);
    out.push('');
  }

  return out.join('\n');
}

const tree = readProductionTree();
const packages = collectPackages(tree);
const result = buildEntries(packages);
writeFileSync(OUTPUT, formatDocument(result), 'utf8');

const withoutText = result.entries.filter((entry) => !entry.licenseText);
console.log(
  `THIRD_PARTY_LICENSES.txt : ${result.entries.length} composants` +
    (withoutText.length > 0 ? ` (${withoutText.length} sans fichier de licence)` : '') +
    `, ${result.unresolved.length} hors distribution`
);
if (withoutText.length > 0) {
  console.log(`  sans fichier de licence : ${withoutText.map((e) => e.name).join(', ')}`);
}
