import i18next from 'i18next';
import { useReportStore } from '../../../stores/reportStore';
import { toast } from '../../../stores/toastStore';
import { assertDossierWritable, DossierLockedError } from '../../../utils/dossierLock';
import type { ReportSectionId } from '../../../types';

/** Where report text goes: a new section, or the end of an existing one */
export type ReportTarget = 'new' | ReportSectionId;

/** Load the dossier's report if the report tab has not, creating it if there is none */
export async function ensureReport(dossierId: string) {
  const store = useReportStore.getState();
  if (store.currentReport?.dossierId !== dossierId) await store.loadReport(dossierId);
  const loaded = useReportStore.getState().currentReport;
  if (loaded?.dossierId === dossierId) return loaded;
  assertDossierWritable();
  return useReportStore.getState().createReport(dossierId, i18next.t('panels:report.defaultTitle'));
}

/**
 * Append report text. Returns the section written to (null when refused): a
 * caller that asked for a new section goes on writing into that one.
 */
export async function appendToReport(
  dossierId: string,
  target: ReportTarget,
  newSectionTitle: string,
  markdown: string,
): Promise<ReportSectionId | null> {
  try {
    assertDossierWritable();
    await ensureReport(dossierId);
    const store = useReportStore.getState();
    // Read at the time of the click: the section may have changed since
    const existing = target === 'new' ? null : store.currentReport?.sections.find((s) => s.id === target) ?? null;
    if (existing) {
      const before = existing.content.trimEnd();
      await store.updateSection(existing.id, { content: before ? `${before}\n\n${markdown}` : markdown });
      toast.success(i18next.t('panels:insights.roles.added', { section: existing.title || i18next.t('panels:report.defaultSectionTitle') }));
      return existing.id;
    }
    const section = await store.addSection(newSectionTitle);
    if (!section) return null;
    await useReportStore.getState().updateSection(section.id, { content: markdown });
    toast.success(i18next.t('panels:insights.roles.added', { section: newSectionTitle }));
    return section.id;
  } catch (error) {
    // A locked dossier has already said so
    if (!(error instanceof DossierLockedError)) {
      console.warn('[Roles] Report write failed:', error);
      toast.error(i18next.t('panels:insights.roles.addFailed'));
    }
    return null;
  }
}
