import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Play, Pause, SkipBack, SkipForward, CalendarRange } from 'lucide-react';
import { closestDateIndex, shiftNavigator } from '../../utils/temporalUtils';
import { activeTimeZoneLabel, dateLocale } from '../../utils/dates';

/**
 * Temporal navigator shared by the map and the canvas: same toggle, same bar,
 * so users find the same controls in both views. Steps through the distinct
 * dates of the dossier, either as an instant or as a period [start, periodEnd].
 * The selection is owned by the caller.
 */

interface TemporalToggleButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function TemporalToggleButton({ active, onClick, disabled }: TemporalToggleButtonProps) {
  const { t } = useTranslation('pages');
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-xs flex items-center gap-1 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        active ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
      }`}
      title={t('map.temporalMode')}
    >
      <Clock size={12} />
      {t('map.temporal')}
    </button>
  );
}

interface TemporalNavigatorBarProps {
  /** Distinct dates, sorted ascending */
  dates: Date[];
  /** Selected instant, or start of the period */
  selectedDate: Date | null;
  /** End of the period; null in instant mode */
  periodEnd: Date | null;
  onChange: (start: Date, periodEnd: Date | null) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** View-specific toggles rendered after the play controls */
  extraControls?: ReactNode;
}

const TOGGLE_ON = 'bg-accent text-white';
const TOGGLE_OFF = 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary';

// Two native ranges stacked on one track: only the thumbs catch the pointer
const DUAL_RANGE_INPUT =
  'absolute inset-0 w-full h-1.5 my-auto bg-transparent appearance-none cursor-pointer accent-accent pointer-events-none ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto';

export function TemporalNavigatorBar({
  dates,
  selectedDate,
  periodEnd,
  onChange,
  isPlaying,
  onTogglePlay,
  extraControls,
}: TemporalNavigatorBarProps) {
  const { t, i18n } = useTranslation('pages');
  const isPeriod = periodEnd !== null;

  const startIndex = useMemo(
    () => (dates.length === 0 || !selectedDate ? 0 : closestDateIndex(dates, selectedDate.getTime())),
    [dates, selectedDate]
  );
  const endIndex = useMemo(
    () => (dates.length === 0 || !periodEnd ? startIndex : closestDateIndex(dates, periodEnd.getTime())),
    [dates, periodEnd, startIndex]
  );

  if (dates.length === 0) return null;
  const lastIndex = dates.length - 1;

  // Format date for display (handles BC/negative years and hour precision)
  const formatDate = (date: Date) => {
    const locale = dateLocale(i18n.language);
    const year = date.getFullYear();
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
    if (year <= 0) {
      // BC date: getFullYear() gives the astronomical year (0 = 1 BC, -1 = 2 BC, etc.)
      const monthDay = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(
        new Date(2000, date.getMonth(), date.getDate())
      );
      const timePart = hasTime ? ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
      return `${monthDay} ${year}${timePart}`;
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  };

  // Format date for <input type="datetime-local"> — only supports years 1–9999
  const formatDateForInput = (date: Date): string => {
    const y = date.getFullYear();
    if (y < 1 || y > 9999) return '';
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${String(y).padStart(4, '0')}-${m}-${d}T${hh}:${mm}`;
  };

  const handleStep = (direction: 1 | -1) => {
    if (!selectedDate) return;
    const next = shiftNavigator(dates, selectedDate, periodEnd, direction);
    if (next) onChange(next.start, next.periodEnd);
  };

  const togglePeriod = () => {
    if (isPeriod) {
      onChange(dates[startIndex], null);
    } else {
      // Start from the whole span; the user narrows it with the handles
      onChange(dates[0], dates[lastIndex]);
    }
  };

  const renderDateInput = (date: Date, onDate: (d: Date) => void) => (
    date.getFullYear() >= 1 && date.getFullYear() <= 9999 ? (
      <input
        type="datetime-local"
        value={formatDateForInput(date)}
        onChange={(e) => {
          const dateStr = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)) {
            const newDate = new Date(dateStr);
            if (!isNaN(newDate.getTime())) onDate(newDate);
          }
        }}
        className="text-xs font-medium text-accent bg-transparent border border-border-default rounded px-2 py-0.5 min-w-[10rem]"
        title={activeTimeZoneLabel(date)}
      />
    ) : (
      <span className="text-xs font-medium text-accent border border-border-default rounded px-2 py-0.5 whitespace-nowrap">
        {formatDate(date)}
      </span>
    )
  );

  return (
    <div className="px-4 py-2 border-b border-border-default bg-bg-primary flex items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleStep(-1)}
          className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
          title={t('map.stepBack')}
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={onTogglePlay}
          className={`p-1 rounded ${isPlaying ? TOGGLE_ON : TOGGLE_OFF}`}
          title={isPlaying ? t('map.pause') : t('map.play')}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={() => handleStep(1)}
          className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
          title={t('map.stepForward')}
        >
          <SkipForward size={14} />
        </button>
        <button
          onClick={togglePeriod}
          className={`p-1 rounded ${isPeriod ? TOGGLE_ON : TOGGLE_OFF}`}
          title={t('map.period')}
        >
          <CalendarRange size={14} />
        </button>
        {extraControls}
      </div>
      <span className="text-xs text-text-tertiary whitespace-nowrap">{formatDate(dates[0])}</span>
      {isPeriod ? (
        <div className="relative flex-1 h-4">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-bg-tertiary rounded" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-accent/30 rounded"
            style={{
              left: `${lastIndex === 0 ? 0 : (startIndex / lastIndex) * 100}%`,
              width: `${lastIndex === 0 ? 100 : ((endIndex - startIndex) / lastIndex) * 100}%`,
            }}
          />
          <input
            type="range"
            min="0"
            max={lastIndex}
            value={startIndex}
            onChange={(e) => onChange(dates[Math.min(parseInt(e.target.value), endIndex)], dates[endIndex])}
            className={DUAL_RANGE_INPUT}
          />
          <input
            type="range"
            min="0"
            max={lastIndex}
            value={endIndex}
            onChange={(e) => onChange(dates[startIndex], dates[Math.max(parseInt(e.target.value), startIndex)])}
            className={DUAL_RANGE_INPUT}
          />
        </div>
      ) : (
        <input
          type="range"
          min="0"
          max={lastIndex}
          value={startIndex}
          onChange={(e) => onChange(dates[parseInt(e.target.value)], null)}
          className="flex-1 h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
        />
      )}
      <span className="text-xs text-text-tertiary whitespace-nowrap">{formatDate(dates[lastIndex])}</span>
      <span className="text-[10px] text-text-tertiary whitespace-nowrap">
        {isPeriod ? `${startIndex + 1}–${endIndex + 1}` : startIndex + 1}/{dates.length}
      </span>
      {selectedDate && renderDateInput(selectedDate, (d) => {
        if (periodEnd && d > periodEnd) return;
        onChange(d, periodEnd);
      })}
      {selectedDate && periodEnd && (
        <>
          <span className="text-xs text-text-tertiary">–</span>
          {renderDateInput(periodEnd, (d) => {
            if (d < selectedDate) return;
            onChange(selectedDate, d);
          })}
        </>
      )}
      {/* Time zone the hours are shown in (system, read-only) */}
      <span className="hidden 2xl:inline shrink-0 text-[10px] text-text-tertiary whitespace-nowrap" title={t('map.timeZoneHint')}>
        {activeTimeZoneLabel(selectedDate ?? undefined)}
      </span>
    </div>
  );
}
