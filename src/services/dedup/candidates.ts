/**
 * Merge candidates: pairs of elements that may be one and the same, each with
 * a level read from the evidence found, and that evidence (the reasons). A
 * score orders the pairs within a level; it is never shown.
 *
 * Comparing every pair is out of reach on a large dossier, so pairs are first
 * drawn from blocks (blocking): elements sharing an identifier, a phonetic
 * key of a name word, or sitting next to each other once names are sorted.
 * Only those pairs are scored.
 */
import type { Element } from '../../types';
import { jaroWinkler } from './jaroWinkler';
import { phonexKey } from './phonex';
import { readIdentifier, type IdentifierKind, type PhoneParser } from './normalizers';

export type MergeReason =
  /** The same phone, IBAN, plate or email (in its comparable form) */
  | { rule: 'sameIdentifier'; kind: IdentifierKind; value: string }
  /** The same name, case, accents, punctuation and word order aside */
  | { rule: 'sameName' }
  /** Names that sound the same in French */
  | { rule: 'phonetic' }
  /** Close names (Jaro-Winkler, 0-1) */
  | { rule: 'similarName'; similarity: number }
  | { rule: 'sharedTags'; count: number }
  /** Both have this kind of identifier, never the same value: likely two */
  | { rule: 'conflict'; kind: IdentifierKind }
  /** Names carrying different numbers ("Lot 3" / "Lot 4") */
  | { rule: 'differentNumbers' };

/**
 * How sure a pair is, from what was found:
 *   - veryLikely : the same identifier, and close names (or two names that are
 *                  the same number written apart)
 *   - likely     : the same identifier alone, or the very same name
 *   - possible   : close names, or names that sound the same, only
 * A conflict (two phones, two numbers in the names) takes a level off.
 */
export type MergeLevel = 'veryLikely' | 'likely' | 'possible';
/** Levels weakest first, with their rank (the minimum the analyst picks) */
export const MERGE_LEVELS: readonly { level: MergeLevel; rank: number }[] = [
  { level: 'possible', rank: 1 },
  { level: 'likely', rank: 2 },
  { level: 'veryLikely', rank: 3 },
];
export const DEFAULT_MERGE_RANK = 1;
const LEVEL_OF_RANK: Record<number, MergeLevel> = { 1: 'possible', 2: 'likely', 3: 'veryLikely' };

export interface MergeCandidate {
  elementIds: [string, string];
  level: MergeLevel;
  /** Orders the pairs within a level (never shown) */
  score: number;
  reasons: MergeReason[];
}

export interface MergeOptions {
  /** Lowest level kept, as its rank (1 = all) */
  minRank?: number;
  /** libphonenumber, once loaded; French numbers only without it */
  parsePhone?: PhoneParser | null;
}
/** An identifier or name word shared by more elements than this tells nothing */
const MAX_BLOCK = 50;
/** Neighbours compared once names are sorted */
const WINDOW = 5;
/** Close-name threshold (Jaro-Winkler) */
const NAME_FLOOR = 0.88;

interface Profile {
  id: string;
  /** Folded label: lower case, no accents, words separated by one space */
  name: string;
  /** The same words, sorted: "Dupont Jean" = "Jean Dupont" */
  sortedName: string;
  /** Phonetic key of each word, sorted */
  sound: string;
  /** Name words, numbers aside */
  words: string[];
  numbers: string;
  /** The label is itself an identifier (a phone number as a name) */
  labelIsIdentifier: boolean;
  identifiers: Map<IdentifierKind, Set<string>>;
  /** Display form of each comparable identifier */
  shown: Map<string, string>;
  tags: Set<string>;
}

const foldName = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function profileOf(el: Element, parse: PhoneParser | null): Profile {
  const name = foldName(el.label ?? '');
  const words = name ? name.split(' ') : [];
  const identifiers = new Map<IdentifierKind, Set<string>>();
  const shown = new Map<string, string>();
  const add = (raw: string, key?: string) => {
    const found = readIdentifier(raw, key, parse);
    if (!found) return false;
    (identifiers.get(found.kind) ?? identifiers.set(found.kind, new Set()).get(found.kind)!).add(found.value);
    if (!shown.has(`${found.kind}:${found.value}`)) shown.set(`${found.kind}:${found.value}`, raw.trim());
    return true;
  };
  const labelIsIdentifier = !!el.label && add(el.label);
  for (const p of el.properties ?? []) {
    if (typeof p.value === 'string' || typeof p.value === 'number') add(String(p.value), p.key);
  }
  return {
    id: el.id,
    name,
    sortedName: [...words].sort().join(' '),
    sound: words.filter((w) => !/^\d+$/.test(w)).map(phonexKey).filter(Boolean).sort().join(' '),
    words: words.filter((w) => !/^\d+$/.test(w)),
    numbers: words.filter((w) => /\d/.test(w)).map((w) => w.replace(/\D/g, '')).sort().join(' '),
    labelIsIdentifier,
    identifiers,
    shown,
    tags: new Set(el.tags ?? []),
  };
}

const WORD_FLOOR = 0.85;

/** Same number of words, each close to one of the other's (an initial matches its word) */
function wordsMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const left = [...b];
  for (const w of a) {
    const k = left.findIndex((x) =>
      (w.length === 1 || x.length === 1) ? w[0] === x[0] : jaroWinkler(w, x) >= WORD_FLOOR);
    if (k < 0) return false;
    left.splice(k, 1);
  }
  return true;
}

/** Score and reasons of one pair, null below any interest */
function scorePair(a: Profile, b: Profile): { level: MergeLevel; score: number; reasons: MergeReason[] } | null {
  // A number as an element and a person carrying it are two things: the
  // person's record points to the number, it is not its double (a link, which
  // the shared values rule offers)
  if (a.labelIsIdentifier !== b.labelIsIdentifier) return null;
  const reasons: MergeReason[] = [];

  // Identifiers in common, and kinds both have without a common value
  let shared = 0;
  const conflicts: IdentifierKind[] = [];
  for (const [kind, values] of a.identifiers) {
    const other = b.identifiers.get(kind);
    if (!other) continue;
    let common = false;
    for (const v of values) {
      if (!other.has(v)) continue;
      common = true;
      shared++;
      reasons.push({ rule: 'sameIdentifier', kind, value: a.shown.get(`${kind}:${v}`) ?? v });
    }
    if (!common) conflicts.push(kind);
  }
  const identScore = shared > 0 ? Math.min(95, 85 + 5 * (shared - 1)) : 0;

  // Names, unless they are identifiers (compared above)
  let nameScore = 0;
  const comparable = !a.labelIsIdentifier && !b.labelIsIdentifier && a.name.length >= 3 && b.name.length >= 3;
  if (comparable) {
    if (a.sortedName === b.sortedName) {
      nameScore = 80;
      reasons.push({ rule: 'sameName' });
    } else {
      const similarity = Math.max(jaroWinkler(a.name, b.name), jaroWinkler(a.sortedName, b.sortedName));
      const sameSound = a.sound !== '' && a.sound === b.sound;
      // Close as a whole is not enough: "Compte Lyon" / "Compte Holding" share
      // a word, not a name. Every word must find a close one in the other name
      if (similarity >= NAME_FLOOR && wordsMatch(a.words, b.words)) {
        nameScore = Math.round(55 + ((similarity - NAME_FLOOR) / (1 - NAME_FLOOR)) * 25);
        reasons.push({ rule: 'similarName', similarity: Math.round(similarity * 100) / 100 });
      }
      if (sameSound) {
        nameScore = Math.min(85, Math.max(nameScore + 5, 70));
        reasons.push({ rule: 'phonetic' });
      }
    }
  }

  let score = identScore > 0 && nameScore >= 55 ? Math.min(100, identScore + 10) : Math.max(identScore, nameScore);
  if (score === 0) return null;

  // The level, from the evidence
  const nameEvidence = reasons.some((r) => r.rule === 'sameName' || r.rule === 'similarName' || r.rule === 'phonetic');
  const sameNumberAsName = a.labelIsIdentifier && b.labelIsIdentifier && shared > 0;
  let rank = shared > 0 && (nameEvidence || sameNumberAsName) ? 3
    : shared > 0 || reasons.some((r) => r.rule === 'sameName') ? 2
      : nameEvidence ? 1 : 0;

  let common = 0;
  for (const tag of a.tags) if (b.tags.has(tag)) common++;
  if (common > 0) {
    score = Math.min(100, score + 3);
    reasons.push({ rule: 'sharedTags', count: common });
  }
  // Two numbers of one kind: maybe two people of one name, maybe one person
  // with two lines. Shown with a warning, not hidden.
  for (const kind of conflicts) {
    score -= 15;
    reasons.push({ rule: 'conflict', kind });
  }
  if (conflicts.length > 0) rank--;
  // Two numbers in the names: two things, not a typo ("Lot 3" / "Lot 4")
  if (comparable && a.numbers && b.numbers && a.numbers !== b.numbers) {
    score -= 40;
    reasons.push({ rule: 'differentNumbers' });
    rank--;
  }
  if (rank < 1) return null;
  return { level: LEVEL_OF_RANK[rank], score: Math.max(0, score), reasons };
}

/**
 * Pairs of elements that may be the same, best first. Pass only elements that
 * can be merged (no groups, no annotations). Pairs already linked stay: a link
 * does not make two records two people.
 */
export function findMergeCandidates(elements: readonly Element[], options: MergeOptions = {}): MergeCandidate[] {
  const minRank = options.minRank ?? DEFAULT_MERGE_RANK;
  const rankOf = (level: MergeLevel) => MERGE_LEVELS.find((l) => l.level === level)!.rank;
  const profiles = elements.map((el) => profileOf(el, options.parsePhone ?? null));
  const pairs = new Set<string>();
  const addPair = (i: number, j: number) => {
    if (i !== j) pairs.add(i < j ? `${i}:${j}` : `${j}:${i}`);
  };
  const fromBlocks = (blocks: Map<string, number[]>) => {
    for (const members of blocks.values()) {
      if (members.length < 2 || members.length > MAX_BLOCK) continue;
      for (let x = 0; x < members.length; x++) for (let y = x + 1; y < members.length; y++) addPair(members[x], members[y]);
    }
  };
  const block = (blocks: Map<string, number[]>, key: string, index: number) => {
    const members = blocks.get(key);
    if (!members) blocks.set(key, [index]);
    else if (members[members.length - 1] !== index) members.push(index);
  };

  const byIdentifier = new Map<string, number[]>();
  const bySound = new Map<string, number[]>();
  profiles.forEach((p, i) => {
    for (const [kind, values] of p.identifiers) for (const v of values) block(byIdentifier, `${kind}:${v}`, i);
    if (!p.labelIsIdentifier) for (const word of p.sound.split(' ')) if (word.length >= 2) block(bySound, word, i);
  });
  fromBlocks(byIdentifier);
  fromBlocks(bySound);

  // Typos the phonetic key misses: neighbours once names are sorted
  for (const field of ['name', 'sortedName'] as const) {
    const order = profiles
      .map((p, i) => ({ key: p[field], i }))
      .filter((x) => x.key.length >= 3)
      .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    for (let x = 0; x < order.length; x++) {
      for (let y = x + 1; y <= x + WINDOW && y < order.length; y++) addPair(order[x].i, order[y].i);
    }
  }

  const found: MergeCandidate[] = [];
  for (const pair of pairs) {
    const [i, j] = pair.split(':').map(Number);
    const result = scorePair(profiles[i], profiles[j]);
    if (!result || rankOf(result.level) < minRank) continue;
    const ids = [profiles[i].id, profiles[j].id].sort() as [string, string];
    found.push({ elementIds: ids, ...result });
  }
  return found
    .sort((x, y) => rankOf(y.level) - rankOf(x.level) || y.score - x.score || (x.elementIds.join() < y.elementIds.join() ? -1 : 1));
}
