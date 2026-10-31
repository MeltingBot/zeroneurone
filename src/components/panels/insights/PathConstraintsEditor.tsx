import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import type { Confidence, EvaluationModel, Link } from '../../../types';
import type { PathConstraints, ValueFilter } from '../../../services/graph/constrainedPaths';
import { hasActiveConstraints } from '../../../services/graph/constrainedPaths';
import { EVALUATION_GRIDS, getModelScale } from '../../../utils/evaluation';

interface Props {
  constraints: PathConstraints;
  onChange: (constraints: PathConstraints) => void;
  /** Links of the analyzed scope: the labels and tags offered come from them */
  links: readonly Link[];
  model: EvaluationModel;
}

/** Distinct values, the most frequent first, case kept from the first seen */
function distinct(values: Iterable<string>): string[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count++;
    else counts.set(key, { value, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((v) => v.value);
}

const toInputDate = (d: Date | null | undefined) => {
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fromInputDate = (v: string): Date | null => {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const chip = (on: boolean) =>
  `px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
    on
      ? 'bg-accent text-white border-accent'
      : 'bg-bg-secondary text-text-secondary border-border-default hover:border-accent hover:text-text-primary'
  }`;

function ValueFilterField({
  label,
  options,
  filter,
  onChange,
}: {
  label: string;
  options: string[];
  filter: ValueFilter | null | undefined;
  onChange: (filter: ValueFilter | null) => void;
}) {
  const { t } = useTranslation('panels');
  const mode = filter?.mode ?? 'include';
  const selected = new Set((filter?.values ?? []).map((v) => v.toLowerCase()));
  if (options.length === 0) return null;

  const toggle = (value: string) => {
    const values = filter?.values ?? [];
    const next = selected.has(value.toLowerCase())
      ? values.filter((v) => v.toLowerCase() !== value.toLowerCase())
      : [...values, value];
    onChange(next.length > 0 ? { mode, values: next } : null);
  };

  // A chosen value shows what it does: kept (filled) or dropped (struck through)
  const valueChip = (on: boolean) =>
    !on
      ? chip(false)
      : mode === 'include'
        ? chip(true)
        : 'px-1.5 py-0.5 text-[10px] rounded border transition-colors bg-bg-primary text-text-primary border-accent line-through';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between min-h-5">
        <span className="text-[10px] text-text-tertiary">{label}</span>
        {/* The mode only means something once a value is chosen */}
        {selected.size > 0 && (
          <div className="inline-flex rounded border border-border-default overflow-hidden" role="group">
            {(['include', 'exclude'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChange({ mode: m, values: filter?.values ?? [] })}
                aria-pressed={mode === m}
                className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                  mode === m
                    ? 'bg-bg-tertiary text-text-primary font-medium'
                    : 'bg-bg-primary text-text-tertiary hover:text-text-primary'
                }`}
              >
                {t(`insights.paths.constraints.${m}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
        {options.map((value) => (
          <button
            key={value}
            onClick={() => toggle(value)}
            aria-pressed={selected.has(value.toLowerCase())}
            className={valueChip(selected.has(value.toLowerCase()))}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Collapsible block narrowing the links a path search may walk */
export function PathConstraintsEditor({ constraints: c, onChange, links, model }: Props) {
  const { t } = useTranslation('panels');
  const { t: tCommon } = useTranslation('common');
  const active = hasActiveConstraints(c, model);
  const [open, setOpen] = useState(active);
  const scale = getModelScale(model);

  const labels = useMemo(() => distinct(links.map((l) => l.label ?? '')), [links]);
  const tags = useMemo(() => distinct(links.flatMap((l) => l.tags ?? [])), [links]);

  const update = (patch: Partial<PathConstraints>) => onChange({ ...c, ...patch });
  const period = c.period ?? { start: null, end: null, keepUndated: true };
  const hasPeriod = period.start !== null || period.end !== null;
  const hasThreshold = scale
    ? !!c.minEvaluation && (c.minEvaluation.source !== null || c.minEvaluation.info !== null)
    : c.minConfidence !== null && c.minConfidence !== undefined;

  return (
    <div className="border border-border-default rounded" data-testid="path-constraints">
      <div className="flex items-center justify-between px-2 py-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-[10px] font-medium text-text-secondary hover:text-text-primary"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('insights.paths.constraints.title')}
          {active && <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />}
        </button>
        {active && (
          <button
            onClick={() => onChange({})}
            title={t('insights.paths.constraints.reset')}
            aria-label={t('insights.paths.constraints.reset')}
            className="p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-2 pb-2 space-y-2">
          <ValueFilterField
            label={t('insights.paths.constraints.labels')}
            options={labels}
            filter={c.labels}
            onChange={(labels) => update({ labels })}
          />
          <ValueFilterField
            label={t('insights.paths.constraints.tags')}
            options={tags}
            filter={c.tags}
            onChange={(tags) => update({ tags })}
          />

          {/* Period */}
          <div className="space-y-1">
            <span className="text-[10px] text-text-tertiary">{t('insights.paths.constraints.period')}</span>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={toInputDate(period.start)}
                onChange={(e) => update({ period: { ...period, start: fromInputDate(e.target.value) } })}
                aria-label={t('insights.paths.constraints.periodStart')}
                className="flex-1 min-w-0 px-1 py-0.5 text-[10px] rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              />
              <span className="text-[10px] text-text-tertiary">–</span>
              <input
                type="date"
                value={toInputDate(period.end)}
                onChange={(e) => update({ period: { ...period, end: fromInputDate(e.target.value) } })}
                aria-label={t('insights.paths.constraints.periodEnd')}
                className="flex-1 min-w-0 px-1 py-0.5 text-[10px] rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            {hasPeriod && (
              <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={period.keepUndated}
                  onChange={(e) => update({ period: { ...period, keepUndated: e.target.checked } })}
                  className="accent-accent"
                />
                {t('insights.paths.constraints.keepUndated')}
              </label>
            )}
          </div>

          {/* Grading (Europol / Admiralty) or confidence threshold */}
          {scale ? (
            <div className="space-y-1">
              {(['source', 'info'] as const).map((axis) => {
                const codes = axis === 'source' ? EVALUATION_GRIDS[scale].sources : EVALUATION_GRIDS[scale].infos;
                const current = c.minEvaluation?.[axis] ?? null;
                const threshold = current === null ? -1 : codes.indexOf(current);
                return (
                  <div key={axis} className="flex items-center gap-1">
                    <span className="w-16 shrink-0 text-[10px] text-text-tertiary">
                      {tCommon(axis === 'source' ? 'evaluation.sourceLabel' : 'evaluation.infoLabel')}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {codes.map((code) => (
                        <button
                          key={code}
                          onClick={() => {
                            const next = { source: c.minEvaluation?.source ?? null, info: c.minEvaluation?.info ?? null };
                            next[axis] = current === code ? null : code;
                            update({ minEvaluation: next.source === null && next.info === null ? null : next });
                          }}
                          aria-pressed={current === code}
                          title={tCommon(`evaluation.${scale}.${axis === 'source' ? 'sources' : 'infos'}.${code}`)}
                          className={`min-w-6 ${
                            current === code
                              ? chip(true)
                              : codes.indexOf(code) < threshold
                                // Stronger codes the threshold keeps too
                                ? 'px-1.5 py-0.5 text-[10px] rounded border transition-colors bg-accent-light text-accent border-accent hover:bg-bg-secondary'
                                : chip(false)
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-text-tertiary">{t('insights.paths.constraints.evaluationAtLeast')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-tertiary">{t('insights.paths.constraints.minConfidence')}</span>
                {hasThreshold && <span className="text-[10px] text-accent">{c.minConfidence}%+</span>}
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={c.minConfidence ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  update({ minConfidence: val === 0 ? null : (val as Confidence) });
                }}
                className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
              />
            </div>
          )}
          {hasThreshold && (
            <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={!!c.keepUnrated}
                onChange={(e) => update({ keepUnrated: e.target.checked })}
                className="accent-accent"
              />
              {t(scale ? 'insights.paths.constraints.keepUngraded' : 'insights.paths.constraints.keepNoConfidence')}
            </label>
          )}

          <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={!!c.respectDirection}
              onChange={(e) => update({ respectDirection: e.target.checked })}
              className="accent-accent"
            />
            {t('insights.paths.constraints.respectDirection')}
          </label>
        </div>
      )}
    </div>
  );
}
