import { create } from 'zustand';
import * as Y from 'yjs';
import type { Report, ReportSection, InvestigationId, ReportSectionId } from '../types';
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
      // First, try to load from Y.Doc if available
      const ydoc = syncService.getYDoc();
      if (ydoc) {
        const { reports: reportsMap } = getYMaps(ydoc);

        // Find report for this investigation
        let report: Report | null = null;
        reportsMap.forEach((ymap) => {
          const invId = ymap.get('investigationId');
          if (invId === investigationId) {
            report = yMapToReport(ymap);
          }
        });

        if (report) {
          set({ currentReport: report, isDirty: false, activeSectionId: null });

          // Setup observer if not already
          if (ydocObserverCleanup) {
            ydocObserverCleanup();
          }
          ydocObserverCleanup = get()._setupObserver();
          return;
        }
      }

      // Fallback to local database
      const report = await reportRepository.getByInvestigation(investigationId);
      set({ currentReport: report, isDirty: false, activeSectionId: null });

      // If we have a report and Y.Doc, sync it to Y.Doc
      if (report && ydoc) {
        const { reports: reportsMap } = getYMaps(ydoc);
        if (!reportsMap.has(report.id)) {
          ydoc.transact(() => {
            const ymap = reportToYMap(report);
            reportsMap.set(report.id, ymap);
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
        set({
          currentReport: {
            ...currentReport,
            title: reportFromYDoc.title,
            sections: reportFromYDoc.sections,
            updatedAt: reportFromYDoc.updatedAt,
          },
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
