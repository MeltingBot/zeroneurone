// ─── Sample dossier seed (onboarding) ────────────────────────
//
// Builds a small, realistic investigation as a ZeroNeurone export ZIP so a
// new user can explore a populated graph (canvas + map + timeline + insights)
// in one click. Imported through the regular importService path.

import JSZip from 'jszip';
import type { Dossier, Element, Link, ElementId, ElementShape } from '../../types';
import type { ExportData } from '../../services/exportService';

/** Translatable labels injected from i18n at call time. */
export interface SampleStrings {
  name: string;
  description: string;
  tag: { person: string; org: string; place: string; account: string; document: string };
  link: { worksAt: string; locatedIn: string; owns: string; contacts: string; signed: string };
}

function el(
  id: string,
  label: string,
  x: number,
  y: number,
  shape: ElementShape,
  extra: Partial<Element> = {},
): Element {
  const now = new Date();
  return {
    id: id as ElementId,
    dossierId: '' as Element['dossierId'],
    label,
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    position: { x, y },
    isPositionLocked: false,
    geo: null,
    events: [],
    visual: { color: '#ffffff', borderColor: '#e5e7eb', shape, size: 'medium', icon: null, image: null },
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function lk(
  id: string,
  fromId: string,
  toId: string,
  label: string,
  directed: boolean,
  extra: Partial<Link> = {},
): Link {
  const now = new Date();
  return {
    id: id as Link['id'],
    dossierId: '' as Link['dossierId'],
    fromId: fromId as ElementId,
    toId: toId as ElementId,
    sourceHandle: null,
    targetHandle: null,
    label,
    notes: '',
    tags: [],
    properties: [],
    directed,
    direction: directed ? 'forward' : 'none',
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    visual: { color: '#9ca3af', style: 'solid', thickness: 2 },
    curveOffset: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

/** Build the seed export data (complete Element/Link objects). */
function buildSampleExportData(s: SampleStrings): ExportData {
  // Distant points so the map shows a meaningful spread (France + Luxembourg).
  const paris = { type: 'point' as const, lat: 48.8566, lng: 2.3522 };
  const marseille = { type: 'point' as const, lat: 43.2965, lng: 5.3698 };
  const lyon = { type: 'point' as const, lat: 45.7578, lng: 4.8320 };
  const luxembourg = { type: 'point' as const, lat: 49.6116, lng: 6.1319 };
  const geneve = { type: 'point' as const, lat: 46.2044, lng: 6.1432 };

  const elements: Element[] = [
    el('e1', 'Camille Laurent', 0, 0, 'circle', {
      tags: [s.tag.person],
      confidence: 80,
      date: new Date('2026-03-10'),
      geo: paris,
      properties: [
        { key: 'Rôle', value: 'Gérante', type: 'text' },
        { key: 'Ville', value: 'Paris', type: 'text' },
        { key: 'Date de naissance', value: '1986-04-22', type: 'date' },
        { key: 'Nationalité', value: 'FR', type: 'country' },
      ],
      events: [
        { id: 'ev1', date: new Date('2026-03-09'), dateEnd: new Date('2026-03-12'), label: 'Séjour à Genève', geo: geneve, source: 'Filature' },
        { id: 'ev2', date: new Date('2026-03-13'), dateEnd: new Date('2026-03-16'), label: 'Virements suspects' },
      ],
    }),
    el('e2', 'Théo Marchand', 320, 40, 'circle', {
      tags: [s.tag.person],
      date: new Date('2026-03-12'),
      geo: marseille,
      properties: [
        { key: 'Rôle', value: 'Comptable', type: 'text' },
        { key: 'Ville', value: 'Marseille', type: 'text' },
        { key: 'Téléphone', value: '+33 6 12 34 56 78', type: 'text' },
      ],
      events: [
        { id: 'ev3', date: new Date('2026-02-01'), dateEnd: new Date('2026-03-31'), label: 'Mission comptable' },
      ],
    }),
    el('e3', 'Société Vortex', 150, 230, 'square', {
      tags: [s.tag.org],
      geo: lyon,
      properties: [
        { key: 'SIREN', value: '824 753 219', type: 'text' },
        { key: 'Siège', value: 'Lyon', type: 'text' },
        { key: 'Création', value: '2019-06-01', type: 'date' },
        { key: "Chiffre d'affaires", value: 1250000, type: 'number' },
      ],
      events: [
        { id: 'ev4', date: new Date('2025-01-01'), dateEnd: new Date('2025-12-31'), label: 'Exercice 2025' },
      ],
    }),
    el('e4', 'Lyon', -180, 240, 'diamond', {
      tags: [s.tag.place],
      geo: lyon,
      properties: [
        { key: 'Pays', value: 'FR', type: 'country' },
        { key: 'Population', value: 522969, type: 'number' },
      ],
    }),
    el('e5', 'Compte LU28 0019 4…', 470, 240, 'hexagon', {
      tags: [s.tag.account],
      geo: luxembourg,
      properties: [
        { key: 'IBAN', value: 'LU28 0019 4006 4475 0000', type: 'text' },
        { key: 'Banque', value: 'Luxembourg', type: 'text' },
        { key: 'Solde (€)', value: 84200, type: 'number' },
        { key: 'Actif', value: true, type: 'boolean' },
      ],
      events: [
        {
          id: 'ev5',
          date: new Date('2026-01-15'),
          dateEnd: new Date('2026-03-20'),
          label: "Période d'activité",
          properties: [{ key: 'Montant (€)', value: 50000, type: 'number' }],
        },
      ],
    }),
    el('e6', 'Contrat 2026-03', 300, 430, 'rectangle', {
      tags: [s.tag.document],
      date: new Date('2026-03-15'),
      properties: [
        { key: 'Type', value: 'Contrat de cession', type: 'choice' },
        { key: 'Signé le', value: '2026-03-15', type: 'date' },
      ],
    }),
  ];

  const links: Link[] = [
    lk('l1', 'e1', 'e3', s.link.worksAt, true),
    lk('l2', 'e2', 'e3', s.link.worksAt, true),
    lk('l3', 'e3', 'e4', s.link.locatedIn, true),
    lk('l4', 'e1', 'e5', s.link.owns, true),
    lk('l5', 'e1', 'e2', s.link.contacts, false),
    lk('l6', 'e2', 'e6', s.link.signed, true),
  ];

  return {
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    dossier: { name: s.name, description: s.description } as Dossier,
    elements,
    links,
  };
}

/** Build the sample dossier as an importable ZIP File. */
export async function buildSampleZipFile(s: SampleStrings): Promise<File> {
  const data = buildSampleExportData(s);
  const zip = new JSZip();
  zip.file('dossier.json', JSON.stringify(data));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([blob], 'exemple.znzip', { type: 'application/zip' });
}
