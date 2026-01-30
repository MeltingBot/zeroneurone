import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Play, Pause, SkipForward, SkipBack } from 'lucide-react';

interface TimelineRangeSliderProps {
  minDate: Date;
  maxDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  onRangeChange: (start: Date | null, end: Date | null) => void;
  onClear: () => void;
}

// Format date for display
function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Format date for input
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function TimelineRangeSlider({
  minDate,
  maxDate,
  startDate,
  endDate,
  onRangeChange,
  onClear,
}: TimelineRangeSliderProps) {
  const { t, i18n } = useTranslation('pages');
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'range' | null>(null);
  const dragStartRatioRef = useRef<number>(0); // Store initial ratio when starting range drag
  const dragStartRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 1 }); // Store initial range ratios

  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const shouldAnimateRef = useRef(false); // Flag to control animation loop
  const animationWindowDays = 30; // Show 30 days window during animation

  // Convert dates to 0-1 range
  const totalMs = maxDate.getTime() - minDate.getTime();

  const startRatio = useMemo(() => {
    if (!startDate) return 0;
    return Math.max(0, Math.min(1, (startDate.getTime() - minDate.getTime()) / totalMs));
  }, [startDate, minDate, totalMs]);

  const endRatio = useMemo(() => {
    if (!endDate) return 1;
    return Math.max(0, Math.min(1, (endDate.getTime() - minDate.getTime()) / totalMs));
  }, [endDate, minDate, totalMs]);

  // Convert ratio to date
  const ratioToDate = useCallback((ratio: number): Date => {
    const ms = minDate.getTime() + ratio * totalMs;
    return new Date(ms);
  }, [minDate, totalMs]);

  // Animation controls - defined early so other handlers can use it
  const stopAnimation = useCallback(() => {
    shouldAnimateRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  // Handle drag for start/end handles
  const handleMouseDown = useCallback((handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(handle);
    stopAnimation();
  }, [stopAnimation]);

  // Handle drag for the entire range
  const handleRangeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;

    // Store initial state for range drag
    dragStartRatioRef.current = ratio;
    dragStartRangeRef.current = { start: startRatio, end: endRatio };

    setIsDragging('range');
    stopAnimation();
  }, [startRatio, endRatio, stopAnimation]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (isDragging === 'range') {
      // Calculate how much the mouse has moved
      const deltaRatio = ratio - dragStartRatioRef.current;
      const rangeWidth = dragStartRangeRef.current.end - dragStartRangeRef.current.start;

      // Calculate new positions
      let newStartRatio = dragStartRangeRef.current.start + deltaRatio;
      let newEndRatio = dragStartRangeRef.current.end + deltaRatio;

      // Clamp to bounds while maintaining range width
      if (newStartRatio < 0) {
        newStartRatio = 0;
        newEndRatio = rangeWidth;
      }
      if (newEndRatio > 1) {
        newEndRatio = 1;
        newStartRatio = 1 - rangeWidth;
      }

      const newStart = ratioToDate(newStartRatio);
      const newEnd = ratioToDate(newEndRatio);
      onRangeChange(newStart, newEnd);
    } else if (isDragging === 'start') {
      const newDate = ratioToDate(ratio);
      const newEnd = endDate || maxDate;
      if (newDate.getTime() <= newEnd.getTime()) {
        onRangeChange(newDate, newEnd);
      }
    } else if (isDragging === 'end') {
      const newDate = ratioToDate(ratio);
      const newStart = startDate || minDate;
      if (newDate.getTime() >= newStart.getTime()) {
        onRangeChange(newStart, newDate);
      }
    }
  }, [isDragging, ratioToDate, startDate, endDate, minDate, maxDate, onRangeChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const startAnimation = useCallback(() => {
    shouldAnimateRef.current = true;
    setIsAnimating(true);

    // Use current window size if selected, otherwise default to 30 days
    const currentWindowMs = (startDate && endDate)
      ? endDate.getTime() - startDate.getTime()
      : animationWindowDays * 24 * 60 * 60 * 1000;

    // Start from current position, or from the beginning
    let currentStart = startDate ? startDate.getTime() : minDate.getTime();

    const animate = () => {
      // Check if we should stop
      if (!shouldAnimateRef.current) {
        return;
      }

      const currentEnd = currentStart + currentWindowMs;

      if (currentEnd > maxDate.getTime()) {
        // Reached the end, stop
        stopAnimation();
        return;
      }

      onRangeChange(new Date(currentStart), new Date(currentEnd));

      // Move forward by 1 day per frame (adjust speed as needed)
      currentStart += 24 * 60 * 60 * 1000; // 1 day

      // Schedule next frame
      timeoutRef.current = window.setTimeout(() => {
        if (shouldAnimateRef.current) {
          animationRef.current = requestAnimationFrame(animate);
        }
      }, 100); // 100ms between frames
    };

    animate();
  }, [minDate, maxDate, startDate, endDate, animationWindowDays, onRangeChange, stopAnimation]);

  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      stopAnimation();
    } else {
      startAnimation();
    }
  }, [isAnimating, startAnimation, stopAnimation]);

  // Step controls
  const stepBackward = useCallback(() => {
    stopAnimation();
    const stepMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const newStart = new Date(Math.max(minDate.getTime(), (startDate || minDate).getTime() - stepMs));
    const newEnd = new Date(Math.max(minDate.getTime() + stepMs, (endDate || maxDate).getTime() - stepMs));
    onRangeChange(newStart, newEnd);
  }, [startDate, endDate, minDate, maxDate, onRangeChange, stopAnimation]);

  const stepForward = useCallback(() => {
    stopAnimation();
    const stepMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const newStart = new Date(Math.min(maxDate.getTime() - stepMs, (startDate || minDate).getTime() + stepMs));
    const newEnd = new Date(Math.min(maxDate.getTime(), (endDate || maxDate).getTime() + stepMs));
    onRangeChange(newStart, newEnd);
  }, [startDate, endDate, minDate, maxDate, onRangeChange, stopAnimation]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      shouldAnimateRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle date input changes
  const handleStartDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const newDate = new Date(value + 'T12:00:00');
      if (!isNaN(newDate.getTime()) && newDate >= minDate && newDate <= (endDate || maxDate)) {
        onRangeChange(newDate, endDate);
      }
    }
  }, [minDate, maxDate, endDate, onRangeChange]);

  const handleEndDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const newDate = new Date(value + 'T12:00:00');
      if (!isNaN(newDate.getTime()) && newDate <= maxDate && newDate >= (startDate || minDate)) {
        onRangeChange(startDate, newDate);
      }
    }
  }, [minDate, maxDate, startDate, onRangeChange]);

  const isActive = startDate !== null || endDate !== null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-bg-tertiary border-b border-border-default">
      {/* Label */}
      <span className="text-xs text-text-secondary whitespace-nowrap">
        {t('timeline.temporalFilter')}
      </span>

      {/* Animation controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={stepBackward}
          className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-secondary rounded"
          title={t('timeline.stepBackward')}
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={toggleAnimation}
          className={`p-1 rounded ${isAnimating ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-secondary'}`}
          title={isAnimating ? t('timeline.pauseAnimation') : t('timeline.playAnimation')}
        >
          {isAnimating ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={stepForward}
          className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-secondary rounded"
          title={t('timeline.stepForward')}
        >
          <SkipForward size={14} />
        </button>
      </div>

      {/* Start date input */}
      <input
        type="date"
        value={startDate ? formatDateForInput(startDate) : formatDateForInput(minDate)}
        min={formatDateForInput(minDate)}
        max={formatDateForInput(endDate || maxDate)}
        onChange={handleStartDateInput}
        className="h-6 px-1.5 text-[10px] bg-bg-primary border border-border-default rounded text-text-primary"
      />

      {/* Range slider track */}
      <div
        ref={trackRef}
        className="relative flex-1 h-4 bg-bg-secondary rounded cursor-pointer min-w-[100px]"
        onClick={(e) => {
          if (isDragging) return;
          const rect = trackRef.current!.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const clickDate = ratioToDate(ratio);

          // Decide which handle to move based on proximity
          const startDiff = Math.abs(ratio - startRatio);
          const endDiff = Math.abs(ratio - endRatio);

          if (startDiff < endDiff) {
            onRangeChange(clickDate, endDate);
          } else {
            onRangeChange(startDate, clickDate);
          }
        }}
      >
        {/* Selected range highlight - draggable to move entire range */}
        <div
          className={`absolute top-0 bottom-0 bg-accent/30 rounded ${
            isDragging === 'range' ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            left: `${startRatio * 100}%`,
            width: `${(endRatio - startRatio) * 100}%`,
          }}
          onMouseDown={handleRangeMouseDown}
          title={t('timeline.dragToMoveRange')}
        />

        {/* Start handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-ew-resize z-10 ${
            isDragging === 'start' ? 'bg-accent border-accent scale-125' : 'bg-bg-primary border-accent hover:scale-110'
          }`}
          style={{ left: `${startRatio * 100}%` }}
          onMouseDown={handleMouseDown('start')}
          title={startDate ? formatDate(startDate, locale) : formatDate(minDate, locale)}
        />

        {/* End handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-ew-resize z-10 ${
            isDragging === 'end' ? 'bg-accent border-accent scale-125' : 'bg-bg-primary border-accent hover:scale-110'
          }`}
          style={{ left: `${endRatio * 100}%` }}
          onMouseDown={handleMouseDown('end')}
          title={endDate ? formatDate(endDate, locale) : formatDate(maxDate, locale)}
        />
      </div>

      {/* End date input */}
      <input
        type="date"
        value={endDate ? formatDateForInput(endDate) : formatDateForInput(maxDate)}
        min={formatDateForInput(startDate || minDate)}
        max={formatDateForInput(maxDate)}
        onChange={handleEndDateInput}
        className="h-6 px-1.5 text-[10px] bg-bg-primary border border-border-default rounded text-text-primary"
      />

      {/* Clear button */}
      {isActive && (
        <button
          onClick={() => {
            stopAnimation();
            onClear();
          }}
          className="p-1 text-text-tertiary hover:text-error hover:bg-error/10 rounded"
          title={t('timeline.clearFilter')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
