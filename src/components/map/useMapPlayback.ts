import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import * as maplibregl from 'maplibre-gl';

import { toMinuteStart, shiftNavigator, type TimeInterval } from '../../utils/temporalUtils';
import type { ResolvedGeoElement } from './useMapTemporalGeo';
import type { MapRef } from './mapHookTypes';

export interface MapPlaybackParams {
  mapRef: MapRef;
  eventDates: Date[];
  temporalMode: boolean;
  selectedDate: Date | null;
  setSelectedDate: Dispatch<SetStateAction<Date | null>>;
  periodEnd: Date | null;
  setPeriodEnd: Dispatch<SetStateAction<Date | null>>;
  isPlaying: boolean;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  isPlayingRef: RefObject<boolean>;
  temporalFollowCamera: boolean;
  resolvedGeoElements: ResolvedGeoElement[];
  propertyIntervals: Map<string, TimeInterval[]>;
}

/**
 * Temporal playback: steps the time cursor (or slides the period) at a fixed
 * pace, or, with the follow camera, after each flight to the events of the step.
 * Refs and setters received as parameters are listed in the dependency
 * arrays: stable, they trigger nothing.
 */
export function useMapPlayback({
  mapRef,
  eventDates,
  temporalMode,
  selectedDate,
  setSelectedDate,
  periodEnd,
  setPeriodEnd,
  isPlaying,
  setIsPlaying,
  isPlayingRef,
  temporalFollowCamera,
  resolvedGeoElements,
  propertyIntervals,
}: MapPlaybackParams) {
  // Play animation — fixed interval only when follow camera is OFF
  // When follow camera is ON, advancement is chained via moveend below
  // This interval handles the non-follow-camera case + kick-starts the chain
  const selectionRef = useRef({ selectedDate, periodEnd });
  useEffect(() => { selectionRef.current = { selectedDate, periodEnd }; }, [selectedDate, periodEnd]);
  const advanceDate = useCallback(() => {
    const { selectedDate: start, periodEnd: end } = selectionRef.current;
    if (!start) { setSelectedDate(eventDates[0]); return; }
    // Instant: next date; period: slide the window one step, keeping its width
    const next = shiftNavigator(eventDates, start, end, 1);
    if (!next) { setIsPlaying(false); return; }
    setSelectedDate(next.start);
    setPeriodEnd(next.periodEnd);
  }, [eventDates, setIsPlaying, setPeriodEnd, setSelectedDate]);

  useEffect(() => {
    if (!isPlaying || eventDates.length === 0) return;
    if (temporalFollowCamera) {
      // Kick-start the moveend chain by advancing once
      const kickstart = setTimeout(advanceDate, 200);
      return () => clearTimeout(kickstart);
    }
    const interval = setInterval(advanceDate, 800);
    return () => clearInterval(interval);
  }, [isPlaying, eventDates, temporalFollowCamera, advanceDate]);

  // Temporal follow camera: animate to events, then chain to next date on moveend
  useEffect(() => {
    if (!temporalMode || !selectedDate || !temporalFollowCamera || !mapRef.current) return;
    if (resolvedGeoElements.length === 0) return;

    const map = mapRef.current;
    // Period mode: follow the leading edge of the window
    const targetMinute = toMinuteStart(periodEnd ?? selectedDate).getTime();
    let cancelled = false;
    let advanceTimeout: ReturnType<typeof setTimeout>;

    // Find elements that have an event specifically at this minute
    const activeCoords: [number, number][] = [];
    for (const r of resolvedGeoElements) {
      const el = r.element;
      const hasEventNow = (el.events || []).some(e => e.date && toMinuteStart(e.date).getTime() === targetMinute);
      const startsNow = (el.dateRange?.start && toMinuteStart(el.dateRange.start).getTime() === targetMinute)
        || (propertyIntervals.get(el.id) ?? []).some((i) => i.from === targetMinute);
      if (hasEventNow || startsNow) {
        activeCoords.push([r.geo.lng, r.geo.lat]);
      }
    }

    // No events at this date — advance quickly if playing
    if (activeCoords.length === 0) {
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 400);
      }
      return () => { cancelled = true; clearTimeout(advanceTimeout); };
    }

    // Check if all active coords are co-located (same spot, e.g. family house)
    const allSameSpot = activeCoords.every(
      c => Math.abs(c[0] - activeCoords[0][0]) < 0.001 && Math.abs(c[1] - activeCoords[0][1]) < 0.001
    );
    const targetCenter = allSameSpot
      ? activeCoords[0]
      : undefined;
    // Count ALL geo elements near the target to detect if it will be a cluster
    const nearbyTotal = targetCenter
      ? resolvedGeoElements.filter(r =>
          Math.abs(r.geo.lng - targetCenter[0]) < 0.001 && Math.abs(r.geo.lat - targetCenter[1]) < 0.001
        ).length
      : 0;
    // Zoom 22 to guarantee Math.floor > Supercluster maxZoom (20), 16 for isolated point
    const targetZoom = targetCenter && nearbyTotal > 1 ? 22 : 16;

    // Check if camera is already at target — moveend won't fire, advance directly
    if (targetCenter) {
      const cur = map.getCenter();
      const alreadyThere = Math.abs(cur.lng - targetCenter[0]) < 0.0005
        && Math.abs(cur.lat - targetCenter[1]) < 0.0005
        && Math.abs(map.getZoom() - targetZoom) < 0.5;
      if (alreadyThere) {
        if (isPlayingRef.current) {
          advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 1200);
        }
        return () => { cancelled = true; clearTimeout(advanceTimeout); };
      }
    }

    // After camera animation ends, pause for tiles to load, then advance
    // Use timestamp to ignore spurious moveend from interrupted previous animation
    const animStart = Date.now();
    const onMoveEnd = () => {
      if (cancelled) return;
      if (Date.now() - animStart < 400) return;
      map.off('moveend', onMoveEnd);
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 800);
      }
    };

    map.on('moveend', onMoveEnd);

    // Animate: flyTo with natural arc — no maxDuration so long distances get full dezoom
    if (targetCenter) {
      map.flyTo({
        center: targetCenter,
        zoom: targetZoom,
        speed: 0.6,
        curve: 1.42,
        essential: true,
      });
    } else {
      const bounds = activeCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(activeCoords[0], activeCoords[0])
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 3000 });
    }

    // Safety: if moveend doesn't fire within 15s, advance anyway
    const safetyTimeout = setTimeout(() => {
      if (cancelled) return;
      map.off('moveend', onMoveEnd);
      if (isPlayingRef.current) {
        advanceTimeout = setTimeout(() => { if (!cancelled) advanceDate(); }, 800);
      }
    }, 15000);

    return () => {
      cancelled = true;
      map.off('moveend', onMoveEnd);
      clearTimeout(advanceTimeout);
      clearTimeout(safetyTimeout);
    };
  }, [temporalMode, selectedDate, periodEnd, resolvedGeoElements, temporalFollowCamera, advanceDate, propertyIntervals, isPlayingRef, mapRef]);
}
