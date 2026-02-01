/**
 * Report <-> Y.Map mapper for Yjs collaboration
 *
 * Handles conversion between Report domain objects and Y.Map for Y.Doc storage.
 * Reports contain sections with Markdown content that can reference elements via [[Label|id]].
 */

import * as Y from 'yjs';
import type { Report, ReportSection, GraphSnapshot } from '../../types';
import { dateToYjs, dateFromYjs } from '../../types/yjs';

// ============================================================================
// REPORT -> Y.MAP (FOR MIGRATION/CREATION)
// ============================================================================

/**
 * Convert a Report to a Y.Map for insertion into Y.Doc.
 * Uses primitive values that can be set before the map is added to a document.
 */
export function reportToYMap(report: Report): Y.Map<any> {
  const map = new Y.Map();

  // Simple fields
  map.set('id', report.id);
  map.set('investigationId', report.investigationId);
  map.set('title', report.title);

  // Sections as array of plain objects
  map.set('sections', report.sections.map(sectionToPlainObject));

  // Metadata
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
 * Handles both Y types and primitive values for backward compatibility.
 */
export function yMapToReport(ymap: Y.Map<any>): Report {
  const sectionsRaw = ymap.get('sections');
  const metaRaw = ymap.get('_meta');

  // Handle sections - can be Y.Array or plain array
  let sections: ReportSection[] = [];
  if (sectionsRaw instanceof Y.Array) {
    sections = sectionsRaw.toArray().map((item: any) => {
      if (item instanceof Y.Map) {
        return yMapToSection(item);
      }
      return plainObjectToSection(item);
    });
  } else if (Array.isArray(sectionsRaw)) {
    sections = sectionsRaw.map(plainObjectToSection);
  }

  // Handle metadata
  let createdAt = new Date();
  let updatedAt = new Date();
  if (metaRaw instanceof Y.Map) {
    createdAt = dateFromYjs(metaRaw.get('createdAt')) || new Date();
    updatedAt = dateFromYjs(metaRaw.get('updatedAt')) || new Date();
  } else if (metaRaw && typeof metaRaw === 'object') {
    createdAt = dateFromYjs(metaRaw.createdAt) || new Date();
    updatedAt = dateFromYjs(metaRaw.updatedAt) || new Date();
  }

  return {
    id: ymap.get('id') || '',
    investigationId: ymap.get('investigationId') || '',
    title: ymap.get('title') || '',
    sections,
    createdAt,
    updatedAt,
  };
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Apply partial changes to an existing report Y.Map.
 * The map must already be part of a Y.Doc for this to work.
 */
export function updateReportYMap(
  ymap: Y.Map<any>,
  changes: Partial<Report>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    if (changes.title !== undefined) {
      ymap.set('title', changes.title);
    }

    if (changes.sections !== undefined) {
      ymap.set('sections', changes.sections.map(sectionToPlainObject));
    }

    // Always update updatedAt
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

/**
 * Update a single section in the report Y.Map
 */
export function updateSectionInYMap(
  ymap: Y.Map<any>,
  sectionId: string,
  changes: Partial<Omit<ReportSection, 'id'>>,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsRaw = ymap.get('sections');
    let sections: any[] = [];

    if (sectionsRaw instanceof Y.Array) {
      sections = sectionsRaw.toArray();
    } else if (Array.isArray(sectionsRaw)) {
      sections = [...sectionsRaw];
    }

    const updatedSections = sections.map((s: any) => {
      const id = s instanceof Y.Map ? s.get('id') : s.id;
      if (id === sectionId) {
        const currentSection = s instanceof Y.Map ? yMapToSection(s) : plainObjectToSection(s);
        return sectionToPlainObject({ ...currentSection, ...changes });
      }
      return s instanceof Y.Map ? yMapToSection(s) : s;
    }).map(sectionToPlainObject);

    ymap.set('sections', updatedSections);

    // Update timestamp
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

/**
 * Add a section to the report Y.Map
 */
export function addSectionToYMap(
  ymap: Y.Map<any>,
  section: ReportSection,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsRaw = ymap.get('sections');
    let sections: any[] = [];

    if (sectionsRaw instanceof Y.Array) {
      sections = sectionsRaw.toArray().map((s: any) =>
        s instanceof Y.Map ? yMapToSection(s) : plainObjectToSection(s)
      );
    } else if (Array.isArray(sectionsRaw)) {
      sections = sectionsRaw.map(plainObjectToSection);
    }

    sections.push(section);
    ymap.set('sections', sections.map(sectionToPlainObject));

    // Update timestamp
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

/**
 * Remove a section from the report Y.Map
 */
export function removeSectionFromYMap(
  ymap: Y.Map<any>,
  sectionId: string,
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsRaw = ymap.get('sections');
    let sections: ReportSection[] = [];

    if (sectionsRaw instanceof Y.Array) {
      sections = sectionsRaw.toArray().map((s: any) =>
        s instanceof Y.Map ? yMapToSection(s) : plainObjectToSection(s)
      );
    } else if (Array.isArray(sectionsRaw)) {
      sections = sectionsRaw.map(plainObjectToSection);
    }

    const filtered = sections
      .filter((s) => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i }));

    ymap.set('sections', filtered.map(sectionToPlainObject));

    // Update timestamp
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

/**
 * Reorder sections in the report Y.Map
 */
export function reorderSectionsInYMap(
  ymap: Y.Map<any>,
  sectionIds: string[],
  ydoc: Y.Doc
): void {
  ydoc.transact(() => {
    const sectionsRaw = ymap.get('sections');
    let sections: ReportSection[] = [];

    if (sectionsRaw instanceof Y.Array) {
      sections = sectionsRaw.toArray().map((s: any) =>
        s instanceof Y.Map ? yMapToSection(s) : plainObjectToSection(s)
      );
    } else if (Array.isArray(sectionsRaw)) {
      sections = sectionsRaw.map(plainObjectToSection);
    }

    const sectionMap = new Map(sections.map((s) => [s.id, s]));
    const reordered = sectionIds
      .map((id, i) => {
        const section = sectionMap.get(id);
        return section ? { ...section, order: i } : null;
      })
      .filter((s): s is ReportSection => s !== null);

    ymap.set('sections', reordered.map(sectionToPlainObject));

    // Update timestamp
    const currentMeta = ymap.get('_meta') || {};
    const newMeta = typeof currentMeta === 'object' && !(currentMeta instanceof Y.Map)
      ? { ...currentMeta, updatedAt: new Date().toISOString() }
      : { updatedAt: new Date().toISOString() };
    ymap.set('_meta', newMeta);
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sectionToPlainObject(section: ReportSection): any {
  return {
    id: section.id,
    title: section.title,
    order: section.order,
    content: section.content,
    elementIds: section.elementIds,
    graphSnapshot: section.graphSnapshot ? {
      imageDataUrl: section.graphSnapshot.imageDataUrl,
      viewport: section.graphSnapshot.viewport,
      capturedAt: dateToYjs(section.graphSnapshot.capturedAt),
    } : null,
  };
}

function plainObjectToSection(obj: any): ReportSection {
  return {
    id: obj.id || '',
    title: obj.title || '',
    order: obj.order ?? 0,
    content: obj.content || '',
    elementIds: Array.isArray(obj.elementIds) ? obj.elementIds : [],
    graphSnapshot: obj.graphSnapshot ? plainObjectToGraphSnapshot(obj.graphSnapshot) : null,
  };
}

function yMapToSection(ymap: Y.Map<any>): ReportSection {
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

  return {
    id: ymap.get('id') || '',
    title: ymap.get('title') || '',
    order: ymap.get('order') ?? 0,
    content: ymap.get('content') || '',
    elementIds,
    graphSnapshot,
  };
}

function plainObjectToGraphSnapshot(obj: any): GraphSnapshot {
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

function yMapToGraphSnapshot(ymap: Y.Map<any>): GraphSnapshot {
  const viewportRaw = ymap.get('viewport');
  let viewport = { x: 0, y: 0, zoom: 1 };

  if (viewportRaw instanceof Y.Map) {
    viewport = {
      x: viewportRaw.get('x') ?? 0,
      y: viewportRaw.get('y') ?? 0,
      zoom: viewportRaw.get('zoom') ?? 1,
    };
  } else if (viewportRaw && typeof viewportRaw === 'object') {
    viewport = {
      x: viewportRaw.x ?? 0,
      y: viewportRaw.y ?? 0,
      zoom: viewportRaw.zoom ?? 1,
    };
  }

  return {
    imageDataUrl: ymap.get('imageDataUrl') || '',
    viewport,
    capturedAt: dateFromYjs(ymap.get('capturedAt')) || new Date(),
  };
}
