/**
 * Synthetic dossiers for the render benchmark.
 *
 * Written to disk as a ZeroNeurone JSON export and imported through the real
 * import path, so the measurement covers what a user actually experiences
 * rather than a hand-built store state.
 */

const FIRST = ['Jean', 'Marie', 'Pierre', 'Sophie', 'Luc', 'Anne', 'Marc', 'Julie'];
const LAST = ['Dupont', 'Martin', 'Bernard', 'Petit', 'Durand', 'Moreau'];
const COLORS = ['#fca5a5', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd'];

/** Links per element: an investigation graph is sparse, not dense. */
const LINK_RATIO = 1.5;
/** Nodes per row when laying the grid out. */
const COLUMNS = 100;

export function buildLargeDossierJson(elementCount: number): string {
  const now = new Date().toISOString();

  const elements = Array.from({ length: elementCount }, (_, i) => ({
    id: `el-${i}`,
    label: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${i}`,
    notes: '',
    tags: [`tag-${i % 20}`],
    properties: [
      { key: 'ville', value: `Ville ${i % 50}`, type: 'text' },
      { key: 'dossier', value: `D-${i}`, type: 'text' },
    ],
    confidence: null,
    source: `source-${i % 30}`,
    date: null,
    dateRange: null,
    position: { x: (i % COLUMNS) * 180, y: Math.floor(i / COLUMNS) * 140 },
    isPositionLocked: false,
    geo: null,
    events: [],
    assetIds: [],
    parentGroupId: null,
    isGroup: false,
    isAnnotation: false,
    childIds: [],
    visual: {
      color: COLORS[i % COLORS.length],
      borderColor: '#a8a29e',
      shape: 'rectangle',
      size: 'medium',
      icon: null,
      image: null,
    },
    createdAt: now,
    updatedAt: now,
  }));

  const links = Array.from({ length: Math.floor(elementCount * LINK_RATIO) }, (_, i) => ({
    id: `lk-${i}`,
    fromId: `el-${i % elementCount}`,
    toId: `el-${(i * 7 + 3) % elementCount}`,
    label: '',
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    direction: 'forward',
    directed: true,
    visual: { color: '#9ca3af', style: 'solid', width: 1 },
    createdAt: now,
    updatedAt: now,
  })).filter((l) => l.fromId !== l.toId);

  return JSON.stringify({ version: '1.0.0', elements, links });
}
