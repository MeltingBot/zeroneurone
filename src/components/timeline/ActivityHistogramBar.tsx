import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../utils/dates';
import { buildActivityHistogram, type HistogramInput, type HistogramMode } from './activityHistogram';

const MODES: HistogramMode[] = ['hour', 'weekday', 'month'];
const BAR_AREA_HEIGHT = 40;

interface ActivityHistogramBarProps {
  items: readonly HistogramInput[];
  mode: HistogramMode;
  onModeChange: (mode: HistogramMode) => void;
  selected: number | null;
  onSelect: (bucket: number | null) => void;
}

function bucketLabels(mode: HistogramMode, locale: string): string[] {
  switch (mode) {
    case 'hour':
      return Array.from({ length: 24 }, (_, h) => String(h));
    case 'weekday':
      // 1 January 2024 was a Monday
      return Array.from({ length: 7 }, (_, d) =>
        new Date(2024, 0, 1 + d).toLocaleDateString(locale, { weekday: 'short' }));
    case 'month':
      return Array.from({ length: 12 }, (_, m) =>
        new Date(2024, m, 1).toLocaleDateString(locale, { month: 'short' }));
  }
}

export function ActivityHistogramBar({ items, mode, onModeChange, selected, onSelect }: ActivityHistogramBarProps) {
  const { t, i18n } = useTranslation('pages');
  const histogram = useMemo(() => buildActivityHistogram(items, mode), [items, mode]);
  const labels = useMemo(() => bucketLabels(mode, dateLocale(i18n.language)), [mode, i18n.language]);

  return (
    <div className="flex items-stretch gap-3 px-3 py-2 border-b border-border-default bg-bg-primary">
      <div className="flex flex-col justify-between shrink-0">
        <div className="flex items-center border border-border-default rounded overflow-hidden">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-1.5 h-6 text-[10px] ${
                mode === m ? 'bg-accent/20 text-accent font-medium' : 'text-text-tertiary hover:bg-bg-tertiary'
              }`}
            >
              {t(`timeline.histogramMode.${m}`)}
            </button>
          ))}
        </div>
        {histogram.skipped > 0 && (
          <span className="text-[10px] text-text-tertiary" title={t('timeline.histogramSkippedHint')}>
            {t(`timeline.histogramSkipped.${mode}`, { count: histogram.skipped })}
          </span>
        )}
      </div>
      <div className="flex-1 flex items-end gap-px min-w-0">
        {histogram.counts.map((count, i) => {
          const ratio = histogram.maxCount > 0 ? count / histogram.maxCount : 0;
          const isSelected = selected === i;
          const isMuted = selected !== null && !isSelected;
          return (
            <button
              key={i}
              onClick={() => onSelect(isSelected ? null : i)}
              className="flex-1 min-w-0 flex flex-col items-center gap-0.5 group"
              title={`${labels[i]} : ${count}`}
              aria-pressed={isSelected}
            >
              <div className="w-full flex items-end" style={{ height: BAR_AREA_HEIGHT }}>
                <div
                  className={`w-full group-hover:opacity-80 ${isSelected ? 'bg-accent' : 'bg-accent/60'}`}
                  style={{
                    borderRadius: 1,
                    height: count > 0 ? Math.max(2, ratio * BAR_AREA_HEIGHT) : 1,
                    opacity: count === 0 ? 0.25 : isMuted ? 0.35 : 1,
                  }}
                />
              </div>
              <span className={`text-[9px] leading-none truncate max-w-full ${isSelected ? 'text-text-primary font-medium' : 'text-text-tertiary'}`}>
                {labels[i]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
