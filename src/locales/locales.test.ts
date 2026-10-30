import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every language carries the same keys as French, the reference: a key
 * missing from a language shows English (the fallback) or the raw key, and a
 * key only some languages have is dead. Plural suffixes (_one, _other…) vary
 * by language and are compared without them.
 */
const DIR = join(__dirname);
const REFERENCE = 'fr';
const languages = readdirSync(DIR).filter((name) => statSync(join(DIR, name)).isDirectory());
const namespaces = readdirSync(join(DIR, REFERENCE)).filter((name) => name.endsWith('.json'));

function keysOf(lang: string, file: string): Set<string> {
  const keys = new Set<string>();
  const walk = (node: unknown, prefix: string) => {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, path);
      else keys.add(path.replace(/_(zero|one|two|few|many|other)$/, ''));
    }
  };
  walk(JSON.parse(readFileSync(join(DIR, lang, file), 'utf8')), '');
  return keys;
}

describe('translations', () => {
  it('covers the eleven languages', () => {
    expect(languages.length).toBe(11);
  });

  for (const file of namespaces) {
    const reference = keysOf(REFERENCE, file);
    for (const lang of languages.filter((l) => l !== REFERENCE)) {
      it(`${lang}/${file} has the same keys as ${REFERENCE}`, () => {
        const keys = keysOf(lang, file);
        expect({ missing: [...reference].filter((k) => !keys.has(k)), extra: [...keys].filter((k) => !reference.has(k)) })
          .toEqual({ missing: [], extra: [] });
      });
    }
  }
});
