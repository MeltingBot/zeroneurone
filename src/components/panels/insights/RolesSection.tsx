import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePlus, Search, X } from 'lucide-react';
import type { Cluster, Element } from '../../../types';
import type { StructuralRoles } from '../../../services/graph/structuralRoles';
import { useInsightsStore } from '../../../stores/insightsStore';
import { useReportStore } from '../../../stores/reportStore';
import { useSelectionStore } from '../../../stores/selectionStore';
import { dateLocale } from '../../../utils/dates';
import { revealElement, revealElements } from '../../../utils/revealElement';
import { roleSegments, roleTargets, segmentsToMarkdown, segmentsToText, type Segment } from './roleSentences';
import { ProgressiveList } from '../../common/ProgressiveList';
import { appendToReport, type ReportTarget } from './addToReport';

interface Props {
  roles: StructuralRoles;
  clusters: readonly Cluster[];
  elements: readonly Element[];
  computedAt: Date | null;
  dossierId: string | null;
}

/** Who holds the network together, in sentences, each addable to the report */
export function RolesSection({ roles, clusters, elements, computedAt, dossierId }: Props) {
  const { t, i18n } = useTranslation('panels');
  const locale = dateLocale(i18n.language);
  const highlightType = useInsightsStore((s) => s.highlightType);
  const highlightRole = useInsightsStore((s) => s.highlightRole);
  const clearHighlight = useInsightsStore((s) => s.clearHighlight);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const report = useReportStore((s) => (s.currentReport?.dossierId === dossierId ? s.currentReport : null));
  const [active, setActive] = useState<number | null>(null);
  const [target, setTarget] = useState<ReportTarget>('new');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const labelOf = useMemo(() => {
    const byId = new Map(elements.map((el) => [el.id, el.label]));
    return (id: string) => byId.get(id) || t('insights.noName');
  }, [elements, t]);
  const clusterMembers = useMemo(() => new Map(clusters.map((c) => [c.id, c.elementIds])), [clusters]);
  const sentences = useMemo(() => {
    const ctx = {
      t: t as unknown as (key: string, options?: Record<string, unknown>) => string,
      labelOf,
      clusterLeads: roles.clusterLeads,
      clusterSizes: new Map(clusters.map((c) => [c.id, c.size])),
      locale,
    };
    return roles.facts.map((fact, index) => {
      const segments = roleSegments(fact, ctx);
      return { fact, segments, index, folded: fold(segmentsToText(segments)) };
    });
  }, [roles, clusters, labelOf, locale, t]);

  // A name typed: the sentences it appears in, i.e. the roles it plays
  const needle = fold(query.trim());
  const shown = useMemo(
    () => (needle ? sentences.filter((s) => s.folded.includes(needle)) : sentences),
    [sentences, needle],
  );

  const shownActive = highlightType === 'role' ? active : null;
  // A section picked earlier and deleted since: back to a new one
  const sectionTarget = target !== 'new' && report?.sections.some((s) => s.id === target) ? target : 'new';

  const analyzedOn = computedAt
    ? computedAt.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
    : '';

  const add = async (indexes: number[]) => {
    if (!dossierId || busy || indexes.length === 0) return;
    setBusy(true);
    const lines = indexes.map((i) => `- ${segmentsToMarkdown(sentences[i].segments)}`).join('\n');
    // The groups come from this analysis: the date says which one
    const markdown = `*${t('insights.roles.analyzedOn', { date: analyzedOn })}*\n\n${lines}`;
    const written = await appendToReport(dossierId, sectionTarget, t('insights.roles.sectionTitle'), markdown);
    // Further sentences go to the section just made, not to a new one each
    if (written) setTarget(written);
    setBusy(false);
  };

  const toggle = (index: number) => {
    if (shownActive === index) {
      clearHighlight();
      setActive(null);
      return;
    }
    const { elementIds, focusId, linkIds } = roleTargets(sentences[index].fact, clusterMembers);
    highlightRole(elementIds, focusId, linkIds);
    setActive(index);
    revealElements(elementIds);
  };

  const renderSegment = (s: Segment, i: number) =>
    'ref' in s ? (
      <button
        key={i}
        onClick={(e) => {
          e.stopPropagation();
          selectElement(s.ref);
          revealElement(s.ref);
        }}
        className="font-medium text-text-primary hover:underline"
      >
        {s.label}
      </button>
    ) : (
      <span key={i}>{s.text}</span>
    );

  return (
    <div className="space-y-2" data-testid="roles">
      <div className="flex items-center gap-1">
        <select
          value={sectionTarget}
          onFocus={() => { if (dossierId) void ensureReportQuietly(dossierId); }}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={t('insights.roles.target')}
          title={t('insights.roles.target')}
          className="flex-1 min-w-0 px-1.5 py-1 text-[10px] rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="new">{t('insights.roles.newSection')}</option>
          {report?.sections.map((s) => (
            <option key={s.id} value={s.id}>{s.title || t('report.defaultSectionTitle')}</option>
          ))}
        </select>
        <button
          onClick={() => add(shown.map((s) => s.index))}
          disabled={busy || !dossierId || shown.length === 0}
          className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors disabled:opacity-50"
          data-testid="roles-add-all"
        >
          <FilePlus size={10} />
          {/* Says how many: the list shows ten, this adds every kept sentence */}
          {t('insights.roles.addAll', { count: shown.length })}
        </button>
      </div>

      {sentences.length > SEARCH_FROM && (
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('insights.roles.search')}
            aria-label={t('insights.roles.search')}
            className="w-full pl-6 pr-6 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
            data-testid="roles-search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('insights.roles.clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-text-tertiary px-2">{t('insights.noResults')}</p>
      ) : (
        <ProgressiveList
          items={shown}
          initialCount={10}
          increment={10}
          className="space-y-1"
          renderItem={({ segments, index }) => (
            <div
              key={index}
              onClick={() => toggle(index)}
              className={`group flex items-start gap-1 p-2 rounded border text-xs text-text-secondary cursor-pointer transition-colors ${
                shownActive === index ? 'bg-accent/10 border-accent' : 'border-transparent hover:bg-bg-secondary'
              }`}
              data-testid="role-sentence"
            >
              <span className="flex-1 min-w-0">{segments.map(renderSegment)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void add([index]);
                }}
                disabled={busy || !dossierId}
                title={t('insights.roles.addToReport')}
                aria-label={t('insights.roles.addToReport')}
                className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-50"
              >
                <FilePlus size={12} />
              </button>
            </div>
          )}
        />
      )}
    </div>
  );
}

/** The search field shows past this many sentences */
const SEARCH_FROM = 10;

/** Case and accents aside */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Sections to offer as targets: load the report without creating one */
async function ensureReportQuietly(dossierId: string) {
  const store = useReportStore.getState();
  if (store.currentReport?.dossierId === dossierId) return;
  try {
    await store.loadReport(dossierId);
  } catch {
    /* The list then offers a new section only */
  }
}
