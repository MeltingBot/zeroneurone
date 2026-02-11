import { create } from 'zustand';
import * as Y from 'yjs';
import type { Report, ReportSection, InvestigationId, ReportSectionId } from '../types';
import { db } from '../db/database';
import { reportRepository } from '../db/repositories/reportRepository';
import { syncService } from '../services/syncService';
import { getYMaps } from '../types/yjs';
import {
  reportToYMap,
  yMapToReport,
  updateReportYMap,
  addSectionToYMap,
  updateSectionInYMap,
  removeSectionFromYMap,
  reorderSectionsInYMap,
} from '../services/yjs/reportMapper';

interface ReportState {
  // Current report for the active investigation
  currentReport: Report | null;

  // Which section is being actively edited
  activeSectionId: ReportSectionId | null;

  // Track unsaved changes
  isDirty: boolean;

  // Loading state
  isLoading: boolean;

  // Actions - Report lifecycle
  loadReport: (investigationId: InvestigationId) => Promise<void>;
  createReport: (investigationId: InvestigationId, title: string) => Promise<Report>;
  updateReportTitle: (title: string) => Promise<void>;
  clearReport: () => void;

  // Actions - Sections
  addSection: (title?: string) => Promise<ReportSection | null>;
  updateSection: (sectionId: ReportSectionId, changes: Partial<Omit<ReportSection, 'id'>>) => Promise<void>;
  removeSection: (sectionId: ReportSectionId) => Promise<void>;
  restoreSection: (section: ReportSection) => Promise<void>;
  reorderSections: (sectionIds: ReportSectionId[]) => Promise<void>;

  // Actions - UI state
  setActiveSection: (sectionId: ReportSectionId | null) => void;

  // Internal: sync from Y.Doc
  _syncFromYDoc: () => void;

  // Internal: setup Y.Doc observer
  _setupObserver: () => (() => void) | null;
}

// Store the observer cleanup function
let ydocObserverCleanup: (() => void) | null = null;

export const useReportStore = create<ReportState>((set, get) => ({
  currentReport: null,
  activeSectionId: null,
  isDirty: false,
  isLoading: false,

  loadReport: async (investigationId) => {
    set({ isLoading: true });
    try {
      // First, check what we have in local database
      const localReport = await reportRepository.getByInvestigation(investigationId);

      // Then, try to load from Y.Doc if available
      const ydoc = syncService.getYDoc();
      if (ydoc) {
        const { reports: reportsMap } = getYMaps(ydoc);

        // Find report for this investigation
        let ydocReport: Report | null = null;
        for (const [, ymap] of reportsMap.entries()) {
          const invId = ymap.get('investigationId');
          if (invId === investigationId) {
            ydocReport = yMapToReport(ymap);
            break;
          }
        }

        if (ydocReport) {
          // If report exists in Y.Doc but NOT in local DB, persist it
          if (!localReport) {
            // Create report in local DB with same ID
            const reportToSave: Report = {
              id: ydocReport.id,
              investigationId,
              title: ydocReport.title,
              sections: ydocReport.sections,
              createdAt: ydocReport.createdAt,
              updatedAt: ydocReport.updatedAt,
            };
            await db.reports.add(reportToSave);
          }

          set({ currentReport: ydocReport, isDirty: false, activeSectionId: null });

          // Setup observer if not already
          if (ydocObserverCleanup) {
            ydocObserverCleanup();
          }
          ydocObserverCleanup = get()._setupObserver();
          return;
        }
      }

      // Use local database report
      set({ currentReport: localReport, isDirty: false, activeSectionId: null });

      // If we have a report and Y.Doc, sync it to Y.Doc
      if (localReport && ydoc) {
        const { reports: reportsMap } = getYMaps(ydoc);
        if (!reportsMap.has(localReport.id)) {
          ydoc.transact(() => {
            const ymap = reportToYMap(localReport);
            reportsMap.set(localReport.id, ymap);
          });
        }
      }

      // Setup observer if Y.Doc is available
      if (ydoc) {
        if (ydocObserverCleanup) {
          ydocObserverCleanup();
        }
        ydocObserverCleanup = get()._setupObserver();
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createReport: async (investigationId, title) => {
    set({ isLoading: true });
    try {
      // Create in local database first
      const report = await reportRepository.create(investigationId, title);

      // Sync to Y.Doc if available
      const ydoc = syncService.getYDoc();
      if (ydoc) {
        const { reports: reportsMap } = getYMaps(ydoc);
        ydoc.transact(() => {
          const ymap = reportToYMap(report);
          reportsMap.set(report.id, ymap);
        });

        // Setup observer if not already
        if (!ydocObserverCleanup) {
          ydocObserverCleanup = get()._setupObserver();
        }
      }

      set({ currentReport: report, isDirty: false });
      return report;
    } finally {
      set({ isLoading: false });
    }
  },

  updateReportTitle: async (title) => {
    const { currentReport } = get();
    if (!currentReport) return;

    // Update local database
    await reportRepository.update(currentReport.id, { title });

    // Update Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        updateReportYMap(ymap, { title }, ydoc);
      }
    }

    set({
      currentReport: { ...currentReport, title, updatedAt: new Date() },
      isDirty: false,
    });
  },

  clearReport: () => {
    // Cleanup observer
    if (ydocObserverCleanup) {
      ydocObserverCleanup();
      ydocObserverCleanup = null;
    }
    set({ currentReport: null, activeSectionId: null, isDirty: false });
  },

  addSection: async (title = '') => {
    const { currentReport } = get();
    if (!currentReport) return null;

    // Create section in local database
    const section = await reportRepository.addSection(currentReport.id, title);

    // Sync to Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        addSectionToYMap(ymap, section, ydoc);
      }
    }

    const updatedReport = {
      ...currentReport,
      sections: [...currentReport.sections, section],
      updatedAt: new Date(),
    };
    set({ currentReport: updatedReport, activeSectionId: section.id });
    return section;
  },

  updateSection: async (sectionId, changes) => {
    const { currentReport } = get();
    if (!currentReport) return;

    // Update local database
    await reportRepository.updateSection(currentReport.id, sectionId, changes);

    // Update Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        updateSectionInYMap(ymap, sectionId, changes, ydoc);
      }
    }

    const updatedSections = currentReport.sections.map((s) =>
      s.id === sectionId ? { ...s, ...changes } : s
    );
    set({
      currentReport: { ...currentReport, sections: updatedSections, updatedAt: new Date() },
      isDirty: false,
    });
  },

  removeSection: async (sectionId) => {
    const { currentReport, activeSectionId } = get();
    if (!currentReport) return;

    // Remove from local database
    await reportRepository.removeSection(currentReport.id, sectionId);

    // Remove from Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        removeSectionFromYMap(ymap, sectionId, ydoc);
      }
    }

    const updatedSections = currentReport.sections
      .filter((s) => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i }));

    set({
      currentReport: { ...currentReport, sections: updatedSections, updatedAt: new Date() },
      activeSectionId: activeSectionId === sectionId ? null : activeSectionId,
    });
  },

  restoreSection: async (section: ReportSection) => {
    const { currentReport } = get();
    if (!currentReport) return;

    // Re-insert at correct position and reorder
    const updatedSections = [...currentReport.sections, section]
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({ ...s, order: i }));

    // Persist to local database
    await reportRepository.update(currentReport.id, { sections: updatedSections });

    // Sync to Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        addSectionToYMap(ymap, section, ydoc);
      }
    }

    set({
      currentReport: { ...currentReport, sections: updatedSections, updatedAt: new Date() },
      activeSectionId: section.id,
    });
  },

  reorderSections: async (sectionIds) => {
    const { currentReport } = get();
    if (!currentReport) return;

    // Update local database
    await reportRepository.reorderSections(currentReport.id, sectionIds);

    // Update Y.Doc if available
    const ydoc = syncService.getYDoc();
    if (ydoc) {
      const { reports: reportsMap } = getYMaps(ydoc);
      const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;
      if (ymap) {
        reorderSectionsInYMap(ymap, sectionIds, ydoc);
      }
    }

    const sectionMap = new Map(currentReport.sections.map((s) => [s.id, s]));
    const updatedSections = sectionIds
      .map((id, i) => {
        const section = sectionMap.get(id);
        return section ? { ...section, order: i } : null;
      })
      .filter((s): s is ReportSection => s !== null);

    set({
      currentReport: { ...currentReport, sections: updatedSections, updatedAt: new Date() },
    });
  },

  setActiveSection: (sectionId) => {
    set({ activeSectionId: sectionId });
  },

  // ============================================================================
  // INTERNAL: Y.DOC SYNC
  // ============================================================================

  _syncFromYDoc: () => {
    const ydoc = syncService.getYDoc();
    const { currentReport } = get();
    if (!ydoc || !currentReport) {
      return;
    }

    const { reports: reportsMap } = getYMaps(ydoc);
    const ymap = reportsMap.get(currentReport.id) as Y.Map<any> | undefined;

    if (!ymap) {
      return;
    }

    try {
      const reportFromYDoc = yMapToReport(ymap);

      // Only update if there are actual changes
      const currentJson = JSON.stringify({
        title: currentReport.title,
        sections: currentReport.sections,
      });
      const newJson = JSON.stringify({
        title: reportFromYDoc.title,
        sections: reportFromYDoc.sections,
      });

      if (currentJson !== newJson) {
        const updatedReport = {
          ...currentReport,
          title: reportFromYDoc.title,
          sections: reportFromYDoc.sections,
          updatedAt: reportFromYDoc.updatedAt,
        };
        set({ currentReport: updatedReport });

        // Also persist to local database for export consistency
        db.reports.update(currentReport.id, {
          title: updatedReport.title,
          sections: updatedReport.sections,
          updatedAt: updatedReport.updatedAt,
        }).catch((err) => {
          console.error('[reportStore] Error persisting Y.Doc sync to DB:', err);
        });
      }
    } catch (error) {
      console.error('[reportStore] Error syncing from Y.Doc:', error);
    }
  },

  _setupObserver: () => {
    const ydoc = syncService.getYDoc();
    if (!ydoc) {
      return null;
    }

    const { reports: reportsMap } = getYMaps(ydoc);

    // Throttle sync to avoid excessive re-renders
    let syncTimeout: ReturnType<typeof setTimeout> | null = null;
    const throttledSync = () => {
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
      syncTimeout = setTimeout(() => {
        get()._syncFromYDoc();
      }, 50);
    };

    // Observe changes to reports map
    const reportsObserver = () => {
      throttledSync();
    };

    reportsMap.observeDeep(reportsObserver);

    // Return cleanup function
    return () => {
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
      reportsMap.unobserveDeep(reportsObserver);
    };
  },
}));
