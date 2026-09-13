// ─── FEC import (Fichier des Écritures Comptables) ───────────
//
// Turns a DGFiP-normalized FEC (18+ pipe/tab-separated columns, one line per
// accounting entry line) into an aggregated third-party flow graph:
//   - nodes: auxiliary accounts (clients/suppliers/other third parties) and
//     general accounts without auxiliary, grouped by 3-digit PCG root;
//   - links: value flows within each balanced entry, distributed pro rata
//     (n debits × m credits), then aggregated per node pair.
//
// Flow direction convention: FROM the credited account TO the debited account
// — the direction value travels in double-entry bookkeeping (a credited bank
// account paying a debited supplier account reads Bank → Supplier).
//
// The pipeline is split so the options UI can preview instantly:
//   analyzeFEC(content)            → FECAggregate   (parse once, ~1 s / 15 MB)
//   previewFECGraph(agg, options)  → counts         (pure, < 50 ms)
//   buildFECGraph(agg, options)    → elements/links (pure)
//   importFEC(content, dossierId)  → persists via Dexie bulkAdd

import i18next from 'i18next';
import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { DossierId, Element, Link, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type { ImportResult } from './importService';

// ── Types ──

export type FECFamily =
  | 'clients'
  | 'suppliers'
  | 'otherThirdParties'
  | 'banks'
  | 'expenses'
  | 'revenues'
  | 'others';

export interface FECImportOptions {
  /** Keep only the N auxiliary accounts with the highest cumulated flow. */
  topN: number;
  /** Drop aggregated links whose cumulated amount is below this value. */
  minLinkAmount: number;
  /**
   * Include flows between two aggregated general accounts (TVA, OD,
   * à-nouveaux, paie…). They mesh the whole graph without naming anyone:
   * off by default — investigation flows touch at least one third party.
   */
  includeGenToGen: boolean;
  families: Record<FECFamily, boolean>;
  dateFrom: Date | null;
  dateTo: Date | null;
}

// Defaults calibrated on a real 94k-line dealership FEC: top 200 third
// parties + a 1 000 € floor keep the canvas below ~300 nodes / ~2 000 links.
export const DEFAULT_FEC_OPTIONS: FECImportOptions = {
  topN: 200,
  minLinkAmount: 0,
  includeGenToGen: false,
  families: {
    clients: true,
    suppliers: true,
    otherThirdParties: true,
    banks: true,
    expenses: true,
    revenues: true,
    others: true,
  },
  dateFrom: null,
  dateTo: null,
};

interface NodeAgg {
  key: string;
  kind: 'aux' | 'gen';
  /** Auxiliary account number, or 3-digit PCG root for general accounts. */
  account: string;
  labelCounts: Map<string, number>;
  generalAccounts: Set<string>;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  minDate: Date | null;
  maxDate: Date | null;
  paymentModes: Set<string>;
  /** Amount-weighted votes per family (an aux seen on 401 and 411 keeps the majority). */
  familyVotes: Map<FECFamily, number>;
}

interface FlowEntry {
  fromKey: string;
  toKey: string;
  amount: number;
  entryCount: number;
  journals: Set<string>;
  minDate: Date;
  maxDate: Date;
}

export interface FECAggregate {
  nodes: Map<string, NodeAgg>;
  flows: FlowEntry[];
  dateMin: Date | null;
  dateMax: Date | null;
  lineCount: number;
  entryCount: number;
  skippedLines: number;
  unbalancedCount: number;
  auxCount: number;
}

// ── i18n (with French fallbacks so pure functions work without init) ──

function t(key: string, fallback: string, options?: Record<string, unknown>): string {
  const translated = i18next.isInitialized
    ? (i18next.t(`importData:fec.${key}`, { defaultValue: fallback, ...options }) as string)
    : undefined;
  if (translated) return translated;
  // i18next absent (tests node) : fallback FR avec interpolation minimale.
  return fallback.replace(/\{\{(\w+)\}\}/g, (m, name: string) =>
    options && name in options ? String(options[name]) : m
  );
}

// ── Format detection ──

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectSeparator(headerLine: string): '|' | '\t' | null {
  if (headerLine.includes('|')) return '|';
  if (headerLine.includes('\t')) return '\t';
  return null;
}

export function isFECFormat(content: string): boolean {
  const text = stripBom(content);
  const nl = text.indexOf('\n');
  const header = (nl === -1 ? text : text.slice(0, nl)).replace(/\r$/, '');
  const sep = detectSeparator(header);
  if (!sep) return false;
  const cols = header.split(sep);
  if (cols.length < 17) return false;
  return cols[0].trim().toLowerCase() === 'journalcode';
}

// ── Parsing helpers ──

/** French decimal ("1 234,56" or "1234.56") → number, NaN-safe. */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** AAAAMMJJ → local Date (timezone-safe), or null. */
function parseFecDate(raw: string): Date | null {
  if (!raw || raw.length !== 8 || !/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function familyOf(compteNum: string, isAux: boolean): FECFamily {
  const root2 = compteNum.slice(0, 2);
  if (isAux) {
    if (root2 === '41') return 'clients';
    if (root2 === '40') return 'suppliers';
    return 'otherThirdParties';
  }
  if (root2 === '51' || root2 === '53') return 'banks';
  if (compteNum.startsWith('6')) return 'expenses';
  if (compteNum.startsWith('7')) return 'revenues';
  return 'others';
}

// ── Phase 1: parse + aggregate ──

interface EntryLine {
  nodeKey: string;
  net: number; // debit − credit : > 0 débité, < 0 crédité
  date: Date | null;
  journal: string;
}

export function analyzeFEC(content: string): FECAggregate {
  const text = stripBom(content);
  const nlHeader = text.indexOf('\n');
  const headerLine = (nlHeader === -1 ? text : text.slice(0, nlHeader)).replace(/\r$/, '');
  const sep = detectSeparator(headerLine) ?? '|';

  const nodes = new Map<string, NodeAgg>();
  const entries = new Map<string, EntryLine[]>();
  let lineCount = 0;
  let skippedLines = 0;
  let dateMin: Date | null = null;
  let dateMax: Date | null = null;

  const getNode = (key: string, kind: 'aux' | 'gen', account: string): NodeAgg => {
    let node = nodes.get(key);
    if (!node) {
      node = {
        key,
        kind,
        account,
        labelCounts: new Map(),
        generalAccounts: new Set(),
        totalDebit: 0,
        totalCredit: 0,
        lineCount: 0,
        minDate: null,
        maxDate: null,
        paymentModes: new Set(),
        familyVotes: new Map(),
      };
      nodes.set(key, node);
    }
    return node;
  };

  // Line-by-line iteration without a global split (15 MB files).
  let pos = nlHeader === -1 ? text.length : nlHeader + 1;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    if (end === -1) end = text.length;
    const line = text.slice(pos, end).replace(/\r$/, '');
    pos = end + 1;
    if (line.trim() === '') continue;

    const cols = line.split(sep);
    if (cols.length < 13) {
      skippedLines++;
      continue;
    }
    lineCount++;

    const journalCode = cols[0].trim();
    const ecritureNum = cols[2].trim();
    const date = parseFecDate(cols[3].trim());
    const compteNum = cols[4].trim();
    const compteLib = cols[5].trim();
    const compAuxNum = cols[6].trim();
    const compAuxLib = cols[7].trim();
    const debit = parseAmount(cols[11]);
    const credit = parseAmount(cols[12]);
    const modeRglt = cols.length > 19 ? cols[19].trim() : '';

    const isAux = compAuxNum !== '';
    const nodeKey = isAux ? `aux:${compAuxNum}` : `gen:${compteNum.slice(0, 3)}`;
    const node = getNode(nodeKey, isAux ? 'aux' : 'gen', isAux ? compAuxNum : compteNum.slice(0, 3));

    const label = isAux ? (compAuxLib || compAuxNum) : compteLib || compteNum.slice(0, 3);
    node.labelCounts.set(label, (node.labelCounts.get(label) ?? 0) + 1);
    node.generalAccounts.add(compteNum);
    node.totalDebit += debit;
    node.totalCredit += credit;
    node.lineCount++;
    if (modeRglt) node.paymentModes.add(modeRglt);
    if (date) {
      if (!node.minDate || date < node.minDate) node.minDate = date;
      if (!node.maxDate || date > node.maxDate) node.maxDate = date;
      if (!dateMin || date < dateMin) dateMin = date;
      if (!dateMax || date > dateMax) dateMax = date;
    }
    const family = familyOf(compteNum, isAux);
    node.familyVotes.set(family, (node.familyVotes.get(family) ?? 0) + debit + credit);

    // EcritureNum can repeat across journals: composite key required.
    const entryKey = `${journalCode}|${ecritureNum}`;
    let entry = entries.get(entryKey);
    if (!entry) {
      entry = [];
      entries.set(entryKey, entry);
    }
    entry.push({ nodeKey, net: debit - credit, date, journal: journalCode });
  }

  // Phase 2: pro-rata flows per entry, compressed by (from, to, month, journal).
  const flowMap = new Map<string, FlowEntry>();
  let unbalancedCount = 0;

  for (const lines of entries.values()) {
    const debited = lines.filter((l) => l.net > 0);
    const credited = lines.filter((l) => l.net < 0);
    if (debited.length === 0 || credited.length === 0) {
      // One-sided entry (corrupt or purely technical): nothing to distribute.
      if (lines.length > 0) unbalancedCount++;
      continue;
    }
    const totalDebit = debited.reduce((s, l) => s + l.net, 0);
    const totalCredit = credited.reduce((s, l) => s - l.net, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) unbalancedCount++;

    // Aggregate this entry's pair amounts locally so entryCount counts each
    // entry once per pair, however many line combinations produced it.
    const pairAmounts = new Map<string, { from: string; to: string; amount: number; date: Date | null; journal: string }>();
    for (const c of credited) {
      for (const d of debited) {
        // Value flows from the credited account to the debited one.
        if (c.nodeKey === d.nodeKey) continue; // self-loop within an aggregate root
        const amount = (-c.net * d.net) / totalDebit;
        if (amount <= 0) continue;
        const pairKey = `${c.nodeKey}→${d.nodeKey}`;
        const existing = pairAmounts.get(pairKey);
        if (existing) {
          existing.amount += amount;
        } else {
          pairAmounts.set(pairKey, {
            from: c.nodeKey,
            to: d.nodeKey,
            amount,
            date: c.date ?? d.date,
            journal: c.journal,
          });
        }
      }
    }

    for (const pair of pairAmounts.values()) {
      const month = pair.date
        ? `${pair.date.getFullYear()}${String(pair.date.getMonth() + 1).padStart(2, '0')}`
        : '000000';
      const flowKey = `${pair.from}→${pair.to}|${month}|${pair.journal}`;
      const flow = flowMap.get(flowKey);
      const date = pair.date ?? new Date(0);
      if (flow) {
        flow.amount += pair.amount;
        flow.entryCount++;
        flow.journals.add(pair.journal);
        if (date < flow.minDate) flow.minDate = date;
        if (date > flow.maxDate) flow.maxDate = date;
      } else {
        flowMap.set(flowKey, {
          fromKey: pair.from,
          toKey: pair.to,
          amount: pair.amount,
          entryCount: 1,
          journals: new Set([pair.journal]),
          minDate: date,
          maxDate: date,
        });
      }
    }
  }

  let auxCount = 0;
  for (const node of nodes.values()) if (node.kind === 'aux') auxCount++;

  return {
    nodes,
    flows: [...flowMap.values()],
    dateMin,
    dateMax,
    lineCount,
    entryCount: entries.size,
    skippedLines,
    unbalancedCount,
    auxCount,
  };
}

// ── Phase 3: filter + build ──

function nodeFamily(node: NodeAgg): FECFamily {
  let best: FECFamily = node.kind === 'aux' ? 'otherThirdParties' : 'others';
  let bestVotes = -1;
  for (const [family, votes] of node.familyVotes) {
    if (votes > bestVotes) {
      best = family;
      bestVotes = votes;
    }
  }
  return best;
}

interface FilterResult {
  keptNodeKeys: Set<string>;
  links: FlowEntry[];
  cappedAux: number;
}

function filterAggregate(agg: FECAggregate, options: FECImportOptions): FilterResult {
  const familyByKey = new Map<string, FECFamily>();
  for (const node of agg.nodes.values()) familyByKey.set(node.key, nodeFamily(node));

  // 1. Period + family filter on monthly flows.
  const flows = agg.flows.filter((f) => {
    if (!options.includeGenToGen && f.fromKey.startsWith('gen:') && f.toKey.startsWith('gen:')) {
      return false;
    }
    if (options.dateFrom && f.maxDate < options.dateFrom) return false;
    if (options.dateTo && f.minDate > options.dateTo) return false;
    const fromFam = familyByKey.get(f.fromKey);
    const toFam = familyByKey.get(f.toKey);
    if (fromFam && !options.families[fromFam]) return false;
    if (toFam && !options.families[toFam]) return false;
    return true;
  });

  // 2. Top-N auxiliary nodes by cumulated flow amount.
  const auxAmounts = new Map<string, number>();
  for (const f of flows) {
    if (f.fromKey.startsWith('aux:')) auxAmounts.set(f.fromKey, (auxAmounts.get(f.fromKey) ?? 0) + f.amount);
    if (f.toKey.startsWith('aux:')) auxAmounts.set(f.toKey, (auxAmounts.get(f.toKey) ?? 0) + f.amount);
  }
  const rankedAux = [...auxAmounts.entries()].sort((a, b) => b[1] - a[1]);
  const keptAux = new Set(rankedAux.slice(0, Math.max(0, options.topN)).map(([k]) => k));
  const cappedAux = Math.max(0, rankedAux.length - keptAux.size);

  // 3. Aggregate remaining flows per pair.
  const pairMap = new Map<string, FlowEntry>();
  for (const f of flows) {
    if (f.fromKey.startsWith('aux:') && !keptAux.has(f.fromKey)) continue;
    if (f.toKey.startsWith('aux:') && !keptAux.has(f.toKey)) continue;
    const key = `${f.fromKey}→${f.toKey}`;
    const pair = pairMap.get(key);
    if (pair) {
      pair.amount += f.amount;
      pair.entryCount += f.entryCount;
      for (const j of f.journals) pair.journals.add(j);
      if (f.minDate < pair.minDate) pair.minDate = f.minDate;
      if (f.maxDate > pair.maxDate) pair.maxDate = f.maxDate;
    } else {
      pairMap.set(key, {
        fromKey: f.fromKey,
        toKey: f.toKey,
        amount: f.amount,
        entryCount: f.entryCount,
        journals: new Set(f.journals),
        minDate: f.minDate,
        maxDate: f.maxDate,
      });
    }
  }

  // 4. Amount threshold, then drop isolated nodes.
  const links = [...pairMap.values()].filter((p) => p.amount >= options.minLinkAmount);
  const keptNodeKeys = new Set<string>();
  for (const l of links) {
    keptNodeKeys.add(l.fromKey);
    keptNodeKeys.add(l.toKey);
  }

  return { keptNodeKeys, links, cappedAux };
}

/**
 * Suggest a minLinkAmount so the graph lands around `targetLinks` links —
 * a fixed euro threshold means nothing across FECs whose totals span from
 * thousands to hundreds of millions. Returns a rounded "nice" value
 * (1/2/5 × 10^k) taken from the actual pair-amount distribution.
 */
export function suggestMinLinkAmount(
  agg: FECAggregate,
  options: FECImportOptions,
  targetLinks = 300
): number {
  const { links } = filterAggregate(agg, { ...options, minLinkAmount: 0 });
  if (links.length <= targetLinks) return 0;
  const amounts = links.map((l) => l.amount).sort((a, b) => b - a);
  // Smallest "nice" value (1/2/5 × 10^k) that keeps at most targetLinks links.
  const maxAmount = amounts[0];
  const candidates: number[] = [];
  for (let mag = 1; mag <= maxAmount; mag *= 10) {
    for (const mult of [1, 2, 5]) candidates.push(mult * mag);
  }
  // amounts est trié décroissant : les montants ≥ nice sont en tête de liste.
  for (const nice of candidates) {
    let count = 0;
    for (const a of amounts) {
      if (a < nice) break;
      count++;
    }
    if (count <= targetLinks) return nice;
  }
  return candidates[candidates.length - 1] ?? 0;
}

export function previewFECGraph(
  agg: FECAggregate,
  options: FECImportOptions
): { elementCount: number; linkCount: number; cappedAux: number } {
  const { keptNodeKeys, links, cappedAux } = filterAggregate(agg, options);
  return { elementCount: keptNodeKeys.size, linkCount: links.length, cappedAux };
}

// ── Graph construction ──

const FAMILY_TAGS: Record<FECFamily, [string, string]> = {
  clients: ['tags.client', 'Client'],
  suppliers: ['tags.supplier', 'Fournisseur'],
  otherThirdParties: ['tags.thirdParty', 'Tiers'],
  banks: ['tags.bank', 'Banque'],
  expenses: ['tags.expense', 'Charge'],
  revenues: ['tags.revenue', 'Produit'],
  others: ['tags.other', 'Compte'],
};

/** Column order on the canvas: value roughly flows left → right. */
const FAMILY_COLUMNS: FECFamily[] = [
  'suppliers',
  'expenses',
  'others',
  'banks',
  'revenues',
  'clients',
  'otherThirdParties',
];

const ROWS_PER_COLUMN = 20;
const GRID_SPACING_X = 280;
const GRID_SPACING_Y = 140;

function bestLabel(node: NodeAgg): string {
  let best = node.account;
  let bestCount = -1;
  for (const [label, count] of node.labelCounts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return node.kind === 'gen' ? `${node.account} — ${best}` : best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatAmount(n: number): string {
  try {
    return new Intl.NumberFormat(i18next.language || 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return `${Math.round(n)} EUR`;
  }
}

/** Log scale of the cumulated amount, clamped to [1,10] (cf. importGephi). */
function amountThickness(amount: number): number {
  return Math.max(1, Math.min(10, Math.round(1 + 2 * Math.log10(1 + amount / 1000))));
}

const FAMILY_COLORS: Record<FECFamily, string> = {
  clients: '#dbeafe',
  suppliers: '#fee2e2',
  otherThirdParties: '#e5e7eb',
  banks: '#dcfce7',
  expenses: '#fef3c7',
  revenues: '#d1fae5',
  others: '#f3f4f6',
};

export function buildFECGraph(
  agg: FECAggregate,
  options: FECImportOptions,
  dossierId: DossierId
): { elements: Element[]; links: Link[]; cappedAux: number } {
  const { keptNodeKeys, links: flowLinks, cappedAux } = filterAggregate(agg, options);
  const now = new Date();

  // Group kept nodes by family, largest totals first inside each column.
  const byFamily = new Map<FECFamily, NodeAgg[]>();
  for (const key of keptNodeKeys) {
    const node = agg.nodes.get(key);
    if (!node) continue;
    const family = nodeFamily(node);
    let list = byFamily.get(family);
    if (!list) {
      list = [];
      byFamily.set(family, list);
    }
    list.push(node);
  }
  for (const list of byFamily.values()) {
    list.sort((a, b) => b.totalDebit + b.totalCredit - (a.totalDebit + a.totalCredit));
  }

  const idByKey = new Map<string, string>();
  const elements: Element[] = [];
  let columnOffset = 0;

  for (const family of FAMILY_COLUMNS) {
    const list = byFamily.get(family);
    if (!list || list.length === 0) continue;
    const subColumns = Math.ceil(list.length / ROWS_PER_COLUMN);
    const [tagKey, tagFallback] = FAMILY_TAGS[family];
    const tag = t(tagKey, tagFallback);

    list.forEach((node, i) => {
      const col = Math.floor(i / ROWS_PER_COLUMN);
      const row = i % ROWS_PER_COLUMN;
      const id = generateUUID();
      idByKey.set(node.key, id);

      const properties: Property[] = [
        node.kind === 'aux'
          ? { key: t('properties.auxAccount', 'Compte auxiliaire'), value: node.account, type: 'text' }
          : { key: t('properties.pcgRoot', 'Racine PCG'), value: node.account, type: 'text' },
        {
          key: t('properties.generalAccounts', 'Comptes généraux'),
          value: [...node.generalAccounts].sort().slice(0, 20).join(', '),
          type: 'text',
        },
        { key: t('properties.totalDebit', 'Total débit'), value: round2(node.totalDebit), type: 'number' },
        { key: t('properties.totalCredit', 'Total crédit'), value: round2(node.totalCredit), type: 'number' },
        { key: t('properties.lineCount', "Nombre de lignes d'écriture"), value: node.lineCount, type: 'number' },
      ];
      if (node.paymentModes.size > 0) {
        properties.push({
          key: t('properties.paymentModes', 'Modes de règlement'),
          value: [...node.paymentModes].sort().join(', '),
          type: 'text',
        });
      }

      elements.push({
        id,
        dossierId,
        label: bestLabel(node),
        notes: '',
        tags: [tag, 'FEC'],
        properties,
        confidence: null,
        source: 'FEC',
        date: null,
        dateRange:
          node.minDate && node.maxDate ? { start: node.minDate, end: node.maxDate } : null,
        position: {
          x: 100 + (columnOffset + col) * GRID_SPACING_X,
          y: 100 + row * GRID_SPACING_Y,
        },
        isPositionLocked: false,
        geo: null,
        events: [],
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          shape: node.kind === 'aux' ? 'circle' : 'rectangle',
          color: FAMILY_COLORS[family],
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    columnOffset += subColumns + 1; // one empty column between families
  }

  const links: Link[] = [];
  for (const flow of flowLinks) {
    const fromId = idByKey.get(flow.fromKey);
    const toId = idByKey.get(flow.toKey);
    if (!fromId || !toId) continue;
    links.push({
      id: generateUUID(),
      dossierId,
      fromId,
      toId,
      sourceHandle: null,
      targetHandle: null,
      label: formatAmount(flow.amount),
      notes: '',
      tags: ['FEC'],
      properties: [
        { key: t('properties.amount', 'Montant cumulé'), value: round2(flow.amount), type: 'number' },
        { key: t('properties.entryCount', "Nombre d'écritures"), value: flow.entryCount, type: 'number' },
        { key: t('properties.journals', 'Journaux'), value: [...flow.journals].sort().join(', '), type: 'text' },
      ],
      confidence: null,
      source: 'FEC',
      date: null,
      dateRange: { start: flow.minDate, end: flow.maxDate },
      directed: true,
      direction: 'forward',
      visual: {
        ...DEFAULT_LINK_VISUAL,
        thickness: amountThickness(flow.amount),
      },
      curveOffset: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    });
  }

  return { elements, links, cappedAux };
}

// ── Persistence ──

export async function importFEC(
  content: string,
  targetDossierId: DossierId,
  options?: FECImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  try {
    if (!isFECFormat(content)) {
      result.errors.push(t('errors.invalidFormat', 'Format FEC non reconnu (en-tête JournalCode absent)'));
      return result;
    }

    const agg = analyzeFEC(content);
    const opts = options ?? DEFAULT_FEC_OPTIONS;
    const { elements, links, cappedAux } = buildFECGraph(agg, opts, targetDossierId);

    await db.elements.bulkAdd(elements);
    await db.links.bulkAdd(links);

    // Curved auto-anchored links read much better on an aggregated flow graph.
    if (links.length > 0) {
      const dossier = await db.dossiers.get(targetDossierId);
      if (dossier) {
        await db.dossiers.update(targetDossierId, {
          settings: { ...dossier.settings, linkAnchorMode: 'auto', linkCurveMode: 'curved' },
          updatedAt: new Date(),
        });
      }
    }

    if (agg.skippedLines > 0) {
      result.warnings.push(
        t('warnings.skippedLines', '{{count}} lignes illisibles ignorées', { count: agg.skippedLines })
      );
    }
    if (agg.unbalancedCount > 0) {
      result.warnings.push(
        t('warnings.unbalanced', '{{count}} écritures déséquilibrées ou à sens unique', {
          count: agg.unbalancedCount,
        })
      );
    }
    if (cappedAux > 0) {
      result.warnings.push(
        t('warnings.cappedThirdParties', '{{count}} tiers sous le plafond non importés', {
          count: cappedAux,
        })
      );
    }

    result.elementsImported = elements.length;
    result.linksImported = links.length;
    result.success = true;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}
