import * as Y from 'yjs';

/**
 * Rebuilds a dossier's Y.Doc from its current content, without its history.
 *
 * A Y.Doc keeps a trace of every edit: an overwritten field or a deleted
 * element still occupies its slot (a tombstone), and encodeStateAsUpdate()
 * keeps them all. Folding the update log into one snapshot ("compacting")
 * therefore frees nothing once a dossier has been edited for a while. Copying
 * the live content into a fresh document is the only way to drop that weight.
 *
 * The copy has new client IDs: it can no longer merge with a peer still
 * holding the old document. Never use it on a shared dossier.
 */

/** Root types of a dossier document; all are Y.Maps. */
export const DOSSIER_ROOTS = ['assets', 'comments', 'elements', 'links', 'meta', 'pluginData', 'reports', 'tabs', 'views'] as const;

export class UnsupportedYdocError extends Error {}

/** The shared types a dossier document is made of. */
type Container = Y.Map<unknown> | Y.Array<unknown> | Y.Text;

/** Copies the content of `source` into a new document. Throws on anything it cannot copy faithfully. */
export function rebuildYdoc(source: Y.Doc): Y.Doc {
  const unknown = [...source.share.keys()].filter((name) => !(DOSSIER_ROOTS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new UnsupportedYdocError(`Unknown root types: ${unknown.join(', ')}`);
  }

  const target = new Y.Doc();
  target.transact(() => {
    for (const name of source.share.keys()) {
      // A root loaded from an update has no type of its own: getMap() reads
      // only its keyed content. List content would be silently dropped, and
      // the fingerprint, reading through the same lens, would not notice.
      const root = source.getMap(name);
      if (root._start !== null) throw new UnsupportedYdocError(`Root '${name}' holds list content`);
      copyMap(root, target.getMap(name));
    }
  });
  return target;
}

// Nested types are attached to their parent first, then filled: they are then
// part of the document and behave exactly as they would after a normal edit.

function copyMap(from: Y.Map<unknown>, to: Y.Map<unknown>): void {
  for (const [key, value] of from) {
    if (value instanceof Y.AbstractType) {
      const child = emptyLike(value);
      to.set(key, child);
      fill(value, child);
    } else {
      to.set(key, value);
    }
  }
}

function copyArray(from: Y.Array<unknown>, to: Y.Array<unknown>): void {
  from.forEach((value) => {
    if (value instanceof Y.AbstractType) {
      const child = emptyLike(value);
      to.push([child]);
      fill(value, child);
    } else {
      to.push([value]);
    }
  });
}

function emptyLike(value: Y.AbstractType<unknown>): Container {
  if (value instanceof Y.Map) return new Y.Map();
  if (value instanceof Y.Array) return new Y.Array();
  // Y.XmlText extends Y.Text: rule it out before accepting a Y.Text
  if (value instanceof Y.XmlText || value instanceof Y.XmlElement || value instanceof Y.XmlFragment) {
    throw new UnsupportedYdocError('XML types are not supported');
  }
  if (value instanceof Y.Text) return new Y.Text();
  throw new UnsupportedYdocError(`Unsupported type: ${value.constructor.name}`);
}

function fill(from: Y.AbstractType<unknown>, to: Container): void {
  if (from instanceof Y.Map) copyMap(from, to as Y.Map<unknown>);
  else if (from instanceof Y.Array) copyArray(from, to as Y.Array<unknown>);
  else if (from instanceof Y.Text) {
    // The delta, not the string: it carries the formatting
    const delta = from.toDelta() as { insert: unknown }[];
    if (delta.some((op) => typeof op.insert !== 'string')) {
      throw new UnsupportedYdocError('Embedded content in Y.Text is not supported');
    }
    (to as Y.Text).applyDelta(delta);
  }
}

/**
 * Plain, order-independent view of a document's content, Y.Text as its delta
 * so that formatting counts. Two documents with the same content give the
 * same string. Empty roots are left out: an update does not carry them, so a
 * root emptied before saving would otherwise read as a difference.
 */
export function ydocFingerprint(doc: Y.Doc): string {
  const roots: Record<string, unknown> = {};
  for (const name of [...doc.share.keys()].sort()) {
    const root = doc.getMap(name);
    if (root.size > 0) roots[name] = toPlain(root);
  }
  return stableStringify(roots);
}

function toPlain(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of value) out[key] = toPlain(child);
    return { $map: out };
  }
  if (value instanceof Y.Array) return { $array: value.toArray().map(toPlain) };
  if (value instanceof Y.Text) return { $text: value.toDelta() };
  if (value instanceof Uint8Array) return { $bytes: Array.from(value) };
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
