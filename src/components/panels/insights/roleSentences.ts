import type { StructuralFact } from '../../../services/graph/structuralRoles';

/** A piece of a role sentence: plain text, or an element named in it */
export type Segment = { text: string } | { ref: string; label: string };

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface SentenceContext {
  t: Translate;
  labelOf: (id: string) => string;
  clusterLeads: Readonly<Record<number, string>>;
  clusterSizes: ReadonlyMap<number, number>;
  locale: string;
}

const MARK = '\u0001';
const marker = (name: string) => `${MARK}${name}${MARK}`;

/** Translate with element placeholders, then cut the text around them */
function fill(text: string, parts: Record<string, Segment[]>): Segment[] {
  return text.split(MARK).flatMap((piece, i) =>
    i % 2 === 1 ? (parts[piece] ?? [{ text: piece }]) : piece ? [{ text: piece }] : []);
}

function element(id: string, ctx: SentenceContext): Segment[] {
  return [{ ref: id, label: ctx.labelOf(id) }];
}

function group(clusterId: number, ctx: SentenceContext): Segment[] {
  const lead = ctx.clusterLeads[clusterId];
  if (lead === undefined) return [{ text: '?' }];
  const text = ctx.t('insights.roles.group', { lead: marker('lead'), size: ctx.clusterSizes.get(clusterId) ?? 0 });
  return fill(text, { lead: element(lead, ctx) });
}

/** "A, B and C" in the reader's language */
function list(items: readonly Segment[][], ctx: SentenceContext): Segment[] {
  const names = items.map((_, i) => marker(`i${i}`));
  let text: string;
  try {
    text = new Intl.ListFormat(ctx.locale, { type: 'conjunction' }).format(names);
  } catch {
    text = names.join(', ');
  }
  return fill(text, Object.fromEntries(items.map((item, i) => [`i${i}`, item])));
}

function groups(clusterIds: readonly number[], ctx: SentenceContext): Segment[] {
  return list(clusterIds.map((id) => group(id, ctx)), ctx);
}

/** Up to this many elements reached through one, all are named */
export const NAMED_CUT_MAX = 3;

/** The sentence a fact reads as */
export function roleSegments(fact: StructuralFact, ctx: SentenceContext): Segment[] {
  const { t } = ctx;
  switch (fact.kind) {
    case 'soleConnector':
      return fill(t('insights.roles.soleConnector', { x: marker('x'), groups: marker('groups') }), {
        x: element(fact.elementId, ctx),
        groups: groups(fact.sides.map((s) => s.clusterId!), ctx),
      });
    case 'bridgeLink':
      return fill(t('insights.roles.bridgeLink', { x: marker('x'), y: marker('y'), groups: marker('groups') }), {
        x: element(fact.fromId, ctx),
        y: element(fact.toId, ctx),
        groups: groups(fact.sides.map((s) => s.clusterId!), ctx),
      });
    case 'cutOff':
      // A few elements: name them all, no arbitrary pick among equals
      if (fact.size <= NAMED_CUT_MAX && fact.cutIds.length === fact.size) {
        const names = [...fact.cutIds]
          .sort((a, b) => ctx.labelOf(a).localeCompare(ctx.labelOf(b), ctx.locale))
          .map((id) => element(id, ctx));
        return fill(t('insights.roles.cutOffNamed', { x: marker('x'), names: marker('names') }), {
          x: element(fact.elementId, ctx),
          names: list(names, ctx),
        });
      }
      return fill(t('insights.roles.cutOff', { x: marker('x'), y: marker('y'), count: fact.size }), {
        x: element(fact.elementId, ctx),
        y: element(fact.leadId, ctx),
      });
    case 'broker':
      return fill(t('insights.roles.broker', { x: marker('x'), groups: marker('groups') }), {
        x: element(fact.elementId, ctx),
        groups: groups(fact.clusterIds, ctx),
      });
  }
}

/** [[Label|id]], with the characters that would break the reference taken out */
export function reportRef(label: string, id: string): string {
  const safe = label.replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `[[${safe || id}|${id}]]`;
}

/** The sentence as report text: names become clickable references */
export function segmentsToMarkdown(segments: readonly Segment[]): string {
  return segments.map((s) => ('ref' in s ? reportRef(s.label, s.ref) : s.text)).join('');
}

/** The sentence as plain text */
export function segmentsToText(segments: readonly Segment[]): string {
  return segments.map((s) => ('ref' in s ? s.label : s.text)).join('');
}

/** What the canvas lights up for a fact: its subject, and the groups or elements it is about */
export function roleTargets(
  fact: StructuralFact,
  clusterMembers: ReadonlyMap<number, readonly string[]>,
): { elementIds: string[]; focusId: string | null; linkIds: string[] } {
  const members = (ids: readonly number[]) => ids.flatMap((id) => clusterMembers.get(id) ?? []);
  switch (fact.kind) {
    case 'soleConnector':
      return { elementIds: [fact.elementId, ...members(fact.sides.map((s) => s.clusterId!))], focusId: fact.elementId, linkIds: [] };
    case 'bridgeLink':
      return {
        elementIds: [fact.fromId, fact.toId, ...members(fact.sides.map((s) => s.clusterId!))],
        focusId: null,
        linkIds: [fact.linkId],
      };
    case 'cutOff':
      return { elementIds: [fact.elementId, ...fact.cutIds], focusId: fact.elementId, linkIds: [] };
    case 'broker':
      return { elementIds: [fact.elementId, ...members(fact.clusterIds)], focusId: fact.elementId, linkIds: [] };
  }
}
