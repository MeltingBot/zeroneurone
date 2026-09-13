import { describe, it, expect } from 'vitest';
import {
  isFECFormat,
  analyzeFEC,
  previewFECGraph,
  buildFECGraph,
  suggestMinLinkAmount,
  DEFAULT_FEC_OPTIONS,
  type FECImportOptions,
} from './importFEC';

const HEADER =
  'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise';

function line(
  journal: string,
  num: string,
  date: string,
  compte: string,
  compteLib: string,
  aux: string,
  auxLib: string,
  debit: string,
  credit: string
): string {
  return [journal, 'Journal', num, date, compte, compteLib, aux, auxLib, 'P1', date, 'Lib', debit, credit, '', '', '', '', ''].join('|');
}

// Achat : facture fournisseur 1 200 (606 débité 1000, 44566 débité 200, 401 crédité 1200)
// puis paiement banque (401 débité 1200, 512 crédité 1200).
const SAMPLE = [
  HEADER,
  line('AC', 'A1', '20240110', '60600000', 'ACHATS', '', '', '1000,00', '0,00'),
  line('AC', 'A1', '20240110', '44566000', 'TVA DEDUCTIBLE', '', '', '200,00', '0,00'),
  line('AC', 'A1', '20240110', '40100000', 'FOURNISSEURS', 'F001', 'ACME SARL', '0,00', '1200,00'),
  line('BQ', 'B1', '20240215', '40100000', 'FOURNISSEURS', 'F001', 'ACME SARL', '1200,00', '0,00'),
  line('BQ', 'B1', '20240215', '51200000', 'BANQUE', '', '', '0,00', '1200,00'),
  // Vente client : 411 débité 600, 707 crédité 500, 44571 crédité 100.
  line('VE', 'V1', '20240320', '41100000', 'CLIENTS', 'C001', 'DUPONT SA', '600,00', '0,00'),
  line('VE', 'V1', '20240320', '70700000', 'VENTES', '', '', '0,00', '500,00'),
  line('VE', 'V1', '20240320', '44571000', 'TVA COLLECTEE', '', '', '0,00', '100,00'),
].join('\r\n');

// Options « tout garder » : les défauts de prod sont calibrés pour de vrais
// FEC, pas pour ce petit échantillon.
const ALL: FECImportOptions = {
  ...DEFAULT_FEC_OPTIONS,
  topN: 300,
  minLinkAmount: 0,
  includeGenToGen: true,
};

describe('isFECFormat', () => {
  it('accepts pipe, tab and BOM headers', () => {
    expect(isFECFormat(SAMPLE)).toBe(true);
    expect(isFECFormat('﻿' + SAMPLE)).toBe(true);
    expect(isFECFormat(HEADER.replace(/\|/g, '\t') + '\n')).toBe(true);
  });
  it('rejects other text files', () => {
    expect(isFECFormat('hello world\nfoo')).toBe(false);
    expect(isFECFormat('a,b,c\n1,2,3')).toBe(false);
    expect(isFECFormat('JournalCode;JournalLib;x')).toBe(false); // point-virgule hors norme
  });
});

describe('analyzeFEC', () => {
  const agg = analyzeFEC(SAMPLE);

  it('counts lines and entries', () => {
    expect(agg.lineCount).toBe(8);
    expect(agg.entryCount).toBe(3);
    expect(agg.skippedLines).toBe(0);
    expect(agg.unbalancedCount).toBe(0);
    expect(agg.auxCount).toBe(2);
  });

  it('parses french decimals and dates', () => {
    expect(agg.dateMin?.getTime()).toBe(new Date(2024, 0, 10).getTime());
    expect(agg.dateMax?.getTime()).toBe(new Date(2024, 2, 20).getTime());
    const supplier = agg.nodes.get('aux:F001')!;
    expect(supplier.totalCredit).toBe(1200);
    expect(supplier.totalDebit).toBe(1200);
  });

  it('distributes pro rata from credited to debited (n×m)', () => {
    // Écriture A1 : crédité 401/F001 (1200) → débités 606 (1000) et 44566 (200).
    const toExpenses = agg.flows.find((f) => f.fromKey === 'aux:F001' && f.toKey === 'gen:606');
    const toVat = agg.flows.find((f) => f.fromKey === 'aux:F001' && f.toKey === 'gen:445');
    expect(toExpenses?.amount).toBeCloseTo(1000, 2);
    expect(toVat?.amount).toBeCloseTo(200, 2);
    // Somme conservée.
    const total = agg.flows.reduce((s, f) => s + f.amount, 0);
    expect(total).toBeCloseTo(1200 + 1200 + 600, 2);
  });

  it('keeps the credited→debited direction for payments', () => {
    // Paiement B1 : banque créditée → fournisseur débité.
    const payment = agg.flows.find((f) => f.fromKey === 'gen:512' && f.toKey === 'aux:F001');
    expect(payment?.amount).toBeCloseTo(1200, 2);
  });

  it('flags unbalanced and one-sided entries', () => {
    const bad = analyzeFEC(
      [HEADER,
        line('OD', 'X1', '20240101', '60600000', 'ACHATS', '', '', '100,00', '0,00'),
        line('OD', 'X1', '20240101', '40100000', 'FOURN', 'F9', 'X', '0,00', '90,00'),
        line('OD', 'X2', '20240102', '60600000', 'ACHATS', '', '', '50,00', '0,00'),
      ].join('\n')
    );
    expect(bad.unbalancedCount).toBe(2); // X1 déséquilibrée, X2 à sens unique
    // X1 traitée quand même au prorata.
    expect(bad.flows.some((f) => f.fromKey === 'aux:F9' && f.toKey === 'gen:606')).toBe(true);
  });

  it('skips malformed lines without dying', () => {
    const agg2 = analyzeFEC(SAMPLE + '\ngarbage line\n');
    expect(agg2.skippedLines).toBe(1);
    expect(agg2.lineCount).toBe(8);
  });
});

describe('previewFECGraph / buildFECGraph', () => {
  const agg = analyzeFEC(SAMPLE);

  it('builds the full graph with all defaults', () => {
    const { elements, links } = buildFECGraph(agg, ALL, 'dossier-1');
    // Nœuds : F001, C001, 606, 445, 512, 707
    expect(elements).toHaveLength(6);
    expect(links.length).toBeGreaterThanOrEqual(5);
    const supplier = elements.find((e) => e.label === 'ACME SARL')!;
    expect(supplier.tags).toContain('Fournisseur');
    const client = elements.find((e) => e.label === 'DUPONT SA')!;
    expect(client.tags).toContain('Client');
    const bank = elements.find((e) => e.label.startsWith('512'))!;
    expect(bank.tags).toContain('Banque');
    // dateRange sur les liens pour la chronologie.
    for (const l of links) {
      expect(l.dateRange).not.toBeNull();
      expect(l.directed).toBe(true);
    }
  });

  it('applies topN on auxiliary accounts only', () => {
    const opts = { ...ALL, topN: 1 };
    const preview = previewFECGraph(agg, opts);
    expect(preview.cappedAux).toBe(1);
    const { elements } = buildFECGraph(agg, opts, 'd');
    const auxLabels = elements.filter((e) => e.tags.includes('Fournisseur') || e.tags.includes('Client'));
    expect(auxLabels).toHaveLength(1);
    // F001 (2400 cumulés) gagne sur C001 (600).
    expect(auxLabels[0].label).toBe('ACME SARL');
  });

  it('applies the amount threshold and drops isolated nodes', () => {
    const opts = { ...ALL, minLinkAmount: 700 };
    const { elements, links } = buildFECGraph(agg, opts, 'd');
    // Seuls les flux ≥ 700 restent (1000 et 1200) — la vente (500/100/600) disparaît.
    expect(links.every((l) => (l.properties[0].value as number) >= 700)).toBe(true);
    expect(elements.some((e) => e.label === 'DUPONT SA')).toBe(false);
  });

  it('filters by family', () => {
    const opts = { ...ALL, families: { ...ALL.families, clients: false } };
    const { elements } = buildFECGraph(agg, opts, 'd');
    expect(elements.some((e) => e.tags.includes('Client'))).toBe(false);
    expect(elements.some((e) => e.tags.includes('Fournisseur'))).toBe(true);
  });

  it('filters by period', () => {
    const opts = { ...ALL, dateFrom: new Date(2024, 2, 1), dateTo: null };
    const { elements } = buildFECGraph(agg, opts, 'd');
    // Seule la vente de mars reste.
    expect(elements.some((e) => e.label === 'DUPONT SA')).toBe(true);
    expect(elements.some((e) => e.label === 'ACME SARL')).toBe(false);
  });

  it('excludes gen↔gen technical flows by default', () => {
    // Écriture OD purement technique : 606 débité ← 445 crédité (gen↔gen).
    const withOd = analyzeFEC(
      SAMPLE + '\n' +
      line('OD', 'T1', '20240401', '60600000', 'ACHATS', '', '', '300,00', '0,00') + '\n' +
      line('OD', 'T1', '20240401', '44560000', 'TVA', '', '', '0,00', '300,00')
    );
    const noTech = buildFECGraph(withOd, { ...ALL, includeGenToGen: false }, 'd');
    const withTech = buildFECGraph(withOd, ALL, 'd');
    expect(withTech.links.length).toBe(noTech.links.length + 1);
  });

  it('suggests an adaptive threshold targeting a link count', () => {
    // Petit échantillon sous la cible → pas de seuil.
    expect(suggestMinLinkAmount(agg, ALL, 300)).toBe(0);
    // Cible 2 liens sur ~5 : le seuil doit exclure les petits flux et être « rond ».
    const s = suggestMinLinkAmount(agg, ALL, 2);
    expect(s).toBeGreaterThan(0);
    const preview = previewFECGraph(agg, { ...ALL, minLinkAmount: s });
    expect(preview.linkCount).toBeLessThanOrEqual(4);
  });

  it('scales link thickness with amount', () => {
    const { links } = buildFECGraph(agg, ALL, 'd');
    for (const l of links) {
      expect(l.visual.thickness).toBeGreaterThanOrEqual(1);
      expect(l.visual.thickness).toBeLessThanOrEqual(10);
    }
  });
});
