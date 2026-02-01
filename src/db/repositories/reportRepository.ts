import { db } from '../database';
import { generateUUID } from '../../utils';
import type { Report, ReportSection, InvestigationId, UUID, ReportSectionId } from '../../types';

// Helper to rehydrate dates from IndexedDB
function rehydrateReport(report: Report): Report {
  return {
    ...report,
    createdAt: new Date(report.createdAt),
    updatedAt: new Date(report.updatedAt),
  };
}

function createDefaultSection(title: string, order: number): ReportSection {
  return {
    id: generateUUID() as ReportSectionId,
    title,
    order,
    content: '',
    elementIds: [],
    graphSnapshot: null,
  };
}

export const reportRepository = {
  async getByInvestigation(investigationId: InvestigationId): Promise<Report | null> {
    const reports = await db.reports.where({ investigationId }).toArray();
    return reports.length > 0 ? rehydrateReport(reports[0]) : null;
  },

  async getById(id: UUID): Promise<Report | null> {
    const report = await db.reports.get(id);
    return report ? rehydrateReport(report) : null;
  },

  async create(investigationId: InvestigationId, title: string): Promise<Report> {
    const report: Report = {
      id: generateUUID(),
      investigationId,
      title,
      sections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.reports.add(report);
    return report;
  },

  async update(id: UUID, changes: Partial<Omit<Report, 'id' | 'investigationId' | 'createdAt'>>): Promise<void> {
    await db.reports.update(id, {
      ...changes,
      updatedAt: new Date(),
    });
  },

  async delete(id: UUID): Promise<void> {
    await db.reports.delete(id);
  },

  async addSection(reportId: UUID, title: string): Promise<ReportSection> {
    const report = await db.reports.get(reportId);
    if (!report) throw new Error('Report not found');

    const section = createDefaultSection(title, report.sections.length);
    const updatedSections = [...report.sections, section];

    await db.reports.update(reportId, {
      sections: updatedSections,
      updatedAt: new Date(),
    });

    return section;
  },

  async updateSection(
    reportId: UUID,
    sectionId: ReportSectionId,
    changes: Partial<Omit<ReportSection, 'id'>>
  ): Promise<void> {
    const report = await db.reports.get(reportId);
    if (!report) return;

    const updatedSections = report.sections.map((s) =>
      s.id === sectionId ? { ...s, ...changes } : s
    );

    await db.reports.update(reportId, {
      sections: updatedSections,
      updatedAt: new Date(),
    });
  },

  async removeSection(reportId: UUID, sectionId: ReportSectionId): Promise<void> {
    const report = await db.reports.get(reportId);
    if (!report) return;

    const updatedSections = report.sections
      .filter((s) => s.id !== sectionId)
      .map((s, i) => ({ ...s, order: i }));

    await db.reports.update(reportId, {
      sections: updatedSections,
      updatedAt: new Date(),
    });
  },

  async reorderSections(reportId: UUID, sectionIds: ReportSectionId[]): Promise<void> {
    const report = await db.reports.get(reportId);
    if (!report) return;

    const sectionMap = new Map(report.sections.map((s) => [s.id, s]));
    const updatedSections = sectionIds
      .map((id, i) => {
        const section = sectionMap.get(id);
        return section ? { ...section, order: i } : null;
      })
      .filter((s): s is ReportSection => s !== null);

    await db.reports.update(reportId, {
      sections: updatedSections,
      updatedAt: new Date(),
    });
  },
};
