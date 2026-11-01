/**
 * Report <-> Y.Map mapper for Yjs collaboration
 *
 * Sections are stored as Y.Map<sectionId, Y.Map> for CRDT-level conflict resolution.
 * Each section field can be updated independently without overwriting other sections.
 *
 * v1 (legacy): sections stored as plain JS array → migrated on first access
 * v2 (current): sections stored as Y.Map<sectionId, Y.Map>
 */

import * as Y from 'yjs';
import type { Report, ReportSection, GraphSnapshot } from '../../types';
import { dateToYjs, dateFromYjs, yFields, type YMeta, type YStored } from '../../types/yjs';

type Viewport = GraphSnapshot['viewport'];

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Convert a ReportSection to a detached Y.Map for insertion */
function sectionToYMap(section: ReportSection): Y.Map<unknown> {
  const map = new Y.Map();
  map.set('id', section.id);
  map.set('title', section.title);
  map.set('order', section.order);
  map.set('content', section.content);
  map.set('elementIds', Array.isArray(section.elementIds) ? [...section.elementIds] : []);
  map.set('graphSnapshot', section.graphSnapshot ? {
    imageDataUrl: section.graphSnapshot.imageDataUrl,
    viewport: { ...section.graphSnapshot.viewport },
    capturedAt: dateToYjs(section.graphSnapshot.capturedAt),
  } : null);
  return map;
}

/** Get sections Y.Map if v2 format, null otherwise */
function getSectionsYMap(ymap: Y.Map<unknown>): Y.Map<unknown> | null {
  const raw = ymap.get('sections');
  if (raw instanceof Y.Map) return raw;
  return null;
}

/** Migrate v1 plain array → v2 Y.Map<sectionId, Y.Map> */
function migrateSectionsToYMap(reportYMap: Y.Map<unknown>, ydoc: Y.Doc): Y.Map<unknown> {
  const sectionsRaw = reportYMap.get('sections');
  let oldSections: ReportSection[] = [];

  if (Array.isArray(sectionsRaw)) {
    oldSections = sectionsRaw.map(plainObjectToSection);
  } else if (sectionsRaw instanceof Y.Array) {
    oldSections = sectionsRaw.toArray().map((item) =>
      item instanceof Y.Map ? yMapToSection(item) : plainObjectToSection(item)
    );
  }

  const newSections = new Y.Map<unknown>();
  ydoc.transact(() => {
    for (const section of oldSections) {
      newSections.set(section.id, sectionToYMap(section));
    }
    reportYMap.set('sections', newSections);
    reportYMap.set('_version', 2);
  });

  return newSections;
}

/** Update _meta.updatedAt timestamp */
function _updateMeta(ymap: Y.Map<unknown>): void {
  const currentMeta = ymap.get('_meta') || {};
  const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
    ? { ...currentMeta, updatedAt: new Date().toISOString() }
    : { updatedAt: new Date().toISOString() };
  ymap.set('_meta', newMeta);
}

// ============================================================================
// REPORT -> Y.MAP (FOR CREATION)
// ============================================================================

/**
 * Convert a Report to a Y.Map for insertion into Y.Doc.
 * Always creates v2 format with Y.Map<sectionId, Y.Map> for sections.
 */
export function reportToYMap(report: Report): Y.Map<unknown> {
  const map = new Y.Map();

  map.set('id', report.id);
  map.set('dossierId', report.dossierId);
  map.set('title', report.title);
  map.set('_version', 2);

  // Sections as Y.Map<sectionId, Y.Map>
  const sectionsMap = new Y.Map<unknown>();
  for (const section of report.sections) {
    sectionsMap.set(section.id, sectionToYMap(section));
  }
  map.set('sections', sectionsMap);

  map.set('_meta', {
    createdAt: dateToYjs(report.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return map;
}

// ============================================================================
// Y.MAP -> REPORT
// ============================================================================

/**
 * Convert a Y.Map to a Report.
 * If ydoc is provided and sections are in v1 format, migrates to v2 automatically.
 */
export function yMapToReport(ymap: Y.Map<unknown>, ydoc?: Y.Doc): Report {
  let sectionsYMap = getSectionsYMap(ymap);

  // Migrate old format if Y.Doc is available
  if (!sectionsYMap && ydoc) {
    sectionsYMap = migrateSectionsToYMap(ymap, ydoc);
  }

  let sections: ReportSection[] = [];

  if (sectionsYMap) {
    // v2: Y.Map<sectionId, Y.Map>
    for (const [, sectionEntry] of sectionsYMap.entries()) {
      if (sectionEntry instanceof Y.Map) {
        sections.push(yMapToSection(sectionEntry));
      } else if (sectionEntry && typeof sectionEntry === 'object') {
        sections.push(plainObjectToSection(sectionEntry));
      }
    }
    sections.sort((a, b) => a.order - b.order);
  } else {
    // Fallback for offline reads without ydoc (e.g. getByDossierWithYDoc)
    const sectionsRaw = ymap.get('sections');
    if (Array.isArray(sectionsRaw)) {
      sections = sectionsRaw.map(plainObjectToSection);
    } else if (sectionsRaw instanceof Y.Array) {
      sections = sectionsRaw.toArray().map((item) =>
        item instanceof Y.Map ? yMapToSection(item) : plainObjectToSection(item)
      );
    }
  }

  // Metadata
  const metaRaw = ymap.get('_meta');
  let createdAt = new Date();
  let updatedAt = new Date();
  if (metaRaw instanceof Y.Map) {
    const m = yFields<YMeta>(metaRaw);
    createdAt = dateFromYjs(m.get('createdAt')) || new Date();
    updatedAt = dateFromYjs(m.get('updatedAt')) || new Date();
  } else if (metaRaw && typeof metaRaw === 'object') {
    const m = metaRaw as Partial<YMeta>;
    createdAt = dateFromYjs(m.createdAt) || new Date();
    updatedAt = dateFromYjs(m.updatedAt) || new Date();
  }

  const fields = yFields<YStored<Report>>(ymap);
  return {
    id: fields.get('id') || '',
    dossierId: fields.get('dossierId') || '',
    title: fields.get('title') || '',
    sections,
    createdAt,
    updatedAt,
  };
}

// ============================================================================
// MUTATION FUNCTIONS (CRDT-safe)
// ============================================================================

/**
 * Apply partial changes to an existing report Y.Map.
 * For sections, clears and repopulates (used by restoreSection only).
 */
export function updateReportYMap(
  ymap: Y.Map<unknown>,
  changes: Partial<Report>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    if (changes.title !== undefined) {
      ymap.set('title', changes.title);
    }

    if (changes.sections !== undefined) {
      let sectionsYMap = getSectionsYMap(ymap);
      if (!sectionsYMap) {
        sectionsYMap = new Y.Map<unknown>();
        ymap.set('sections', sectionsYMap);
        ymap.set('_version', 2);
      }
      // Clear and repopulate
      for (const key of Array.from(sectionsYMap.keys())) {
        sectionsYMap.delete(key);
      }
      for (const section of changes.sections) {
        sectionsYMap.set(section.id, sectionToYMap(section));
      }
    }

    _updateMeta(ymap);
  });
}

/**
 * Update a single section — only sets changed fields on the section's Y.Map.
 * Other sections are completely untouched.
 */
export function updateSectionInYMap(
  ymap: Y.Map<unknown>,
  sectionId: string,
  changes: Partial<Omit<ReportSection, 'id'>>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsYMap = getSectionsYMap(ymap);
    if (!sectionsYMap) return;

    const sectionYMap = sectionsYMap.get(sectionId);
    if (!(sectionYMap instanceof Y.Map)) return;

    if (changes.title !== undefined) sectionYMap.set('title', changes.title);
    if (changes.order !== undefined) sectionYMap.set('order', changes.order);
    if (changes.content !== undefined) sectionYMap.set('content', changes.content);
    if (changes.elementIds !== undefined) sectionYMap.set('elementIds', [...changes.elementIds]);
    if (changes.graphSnapshot !== undefined) {
      sectionYMap.set('graphSnapshot', changes.graphSnapshot ? {
        imageDataUrl: changes.graphSnapshot.imageDataUrl,
        viewport: { ...changes.graphSnapshot.viewport },
        capturedAt: dateToYjs(changes.graphSnapshot.capturedAt),
      } : null);
    }

    _updateMeta(ymap);
  });
}

/**
 * Add a section — inserts a new Y.Map entry into the sections Y.Map.
 */
export function addSectionToYMap(
  ymap: Y.Map<unknown>,
  section: ReportSection,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    let sectionsYMap = getSectionsYMap(ymap);
    if (!sectionsYMap) {
      sectionsYMap = new Y.Map<unknown>();
      ymap.set('sections', sectionsYMap);
      ymap.set('_version', 2);
    }
    sectionsYMap.set(section.id, sectionToYMap(section));
    _updateMeta(ymap);
  });
}

/**
 * Remove a section — deletes key from sections Y.Map, renumbers order on remaining.
 */
export function removeSectionFromYMap(
  ymap: Y.Map<unknown>,
  sectionId: string,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsYMap = getSectionsYMap(ymap);
    if (!sectionsYMap) return;

    sectionsYMap.delete(sectionId);

    // Renumber order fields on remaining sections
    const remaining: Array<{ order: number; map: Y.Map<unknown> }> = [];
    for (const [, entry] of sectionsYMap.entries()) {
      if (entry instanceof Y.Map) {
        remaining.push({ order: entry.get('order') ?? 0, map: entry });
      }
    }
    remaining.sort((a, b) => a.order - b.order);
    remaining.forEach(({ map }, i) => map.set('order', i));

    _updateMeta(ymap);
  });
}

/**
 * Reorder sections — updates only the order field on each section's Y.Map.
 */
export function reorderSectionsInYMap(
  ymap: Y.Map<unknown>,
  sectionIds: string[],
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsYMap = getSectionsYMap(ymap);
    if (!sectionsYMap) return;

    sectionIds.forEach((id, i) => {
      const sectionYMap = sectionsYMap.get(id);
      if (sectionYMap instanceof Y.Map) {
        sectionYMap.set('order', i);
      }
    });

    _updateMeta(ymap);
  });
}

// ============================================================================
// SECTION CONVERSION HELPERS (kept for Dexie/export paths)
// ============================================================================

function plainObjectToSection(raw: unknown): ReportSection {
  const obj = raw as Partial<Omit<ReportSection, 'graphSnapshot'>> & { graphSnapshot?: unknown };
  return {
    id: obj.id || '',
    title: obj.title || '',
    order: obj.order ?? 0,
    content: obj.content || '',
    elementIds: Array.isArray(obj.elementIds) ? obj.elementIds : [],
    graphSnapshot: obj.graphSnapshot ? plainObjectToGraphSnapshot(obj.graphSnapshot) : null,
  };
}

function yMapToSection(ymap: Y.Map<unknown>): ReportSection {
  const elementIdsRaw = ymap.get('elementIds');
  const graphSnapshotRaw = ymap.get('graphSnapshot');

  const elementIds = elementIdsRaw instanceof Y.Array
    ? elementIdsRaw.toArray()
    : (Array.isArray(elementIdsRaw) ? elementIdsRaw : []);

  let graphSnapshot: GraphSnapshot | null = null;
  if (graphSnapshotRaw instanceof Y.Map) {
    graphSnapshot = yMapToGraphSnapshot(graphSnapshotRaw);
  } else if (graphSnapshotRaw && typeof graphSnapshotRaw === 'object') {
    graphSnapshot = plainObjectToGraphSnapshot(graphSnapshotRaw);
  }

  const fields = yFields<ReportSection>(ymap);
  return {
    id: fields.get('id') || '',
    title: fields.get('title') || '',
    order: fields.get('order') ?? 0,
    content: fields.get('content') || '',
    elementIds,
    graphSnapshot,
  };
}

function plainObjectToGraphSnapshot(raw: unknown): GraphSnapshot {
  const obj = raw as Partial<YStored<Omit<GraphSnapshot, 'viewport'>>> & { viewport?: Partial<Viewport> };
  return {
    imageDataUrl: obj.imageDataUrl || '',
    viewport: obj.viewport ? {
      x: obj.viewport.x ?? 0,
      y: obj.viewport.y ?? 0,
      zoom: obj.viewport.zoom ?? 1,
    } : { x: 0, y: 0, zoom: 1 },
    capturedAt: dateFromYjs(obj.capturedAt) || new Date(),
  };
}

function yMapToGraphSnapshot(ymap: Y.Map<unknown>): GraphSnapshot {
  const viewportRaw = ymap.get('viewport');
  let viewport = { x: 0, y: 0, zoom: 1 };

  if (viewportRaw instanceof Y.Map) {
    const v = yFields<Viewport>(viewportRaw);
    viewport = {
      x: v.get('x') ?? 0,
      y: v.get('y') ?? 0,
      zoom: v.get('zoom') ?? 1,
    };
  } else if (viewportRaw && typeof viewportRaw === 'object') {
    const v = viewportRaw as Partial<Viewport>;
    viewport = {
      x: v.x ?? 0,
      y: v.y ?? 0,
      zoom: v.zoom ?? 1,
    };
  }

  const fields = yFields<YStored<Omit<GraphSnapshot, 'viewport'>>>(ymap);
  return {
    imageDataUrl: fields.get('imageDataUrl') || '',
    viewport,
    capturedAt: dateFromYjs(fields.get('capturedAt')) || new Date(),
  };
}
