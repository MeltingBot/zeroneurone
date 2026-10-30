import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDossierStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore, useTabStore, useQueryStore } from '../../stores';
import { useEvaluationModel } from '../../hooks/useEvaluationModel';
import { getDimmedElementIds } from '../../utils/filterUtils';
import { useHiddenElementIds } from '../../hooks/useHiddenElementIds';
import { datePropertyRules, propertyDateSpans } from '../../utils/temporalUtils';
import { Calendar, ArrowUpDown, ZoomIn, ZoomOut, GitBranch, Filter, BarChart3, ChartColumnBig, Upload, Clock } from 'lucide-react';
import { fileService } from '../../services/fileService';
import { ViewToolbar } from '../common/ViewToolbar';

import { TimelineRangeSlider } from './TimelineRangeSlider';
import { SwimlaneToolbar } from './SwimlaneToolbar';
import { TimelineSwimlane } from './TimelineSwimlane';
import { useSwimlaneGrouping } from './useSwimlaneGrouping';
import { ActivityHistogramBar } from './ActivityHistogramBar';
import { histogramBucket, type HistogramMode } from './activityHistogram';
import { computeCausalConnections } from './causality';
import type { DatePrecision, Element as ZNElement } from '../../types';
import { toLocalDateKey, dateLocale, effectivePrecision, endOfPrecision, formatPropertyValue } from '../../utils/dates';
import { formatItemDates, itemTooltip } from './timelineDates';
import { useTabFilterIds } from '../../hooks/useTabFilterIds';
import { emitExport } from '../../plugins/pluginEventBus';
import { downloadBlob } from '../../utils/download';
import { escapeCsvField } from '../../utils/csv';

export interface TimelineItem {
  id: string;
  label: string;
  sublabel?: string;
  start: Date;
  end?: Date;
  /** End as entered, for labels (`end` extends to the end of its period, or to now) */
  displayEnd?: Date;
  /** Precision of start/end ("2019", "mars 2019"…); inferred when absent */
  precision?: DatePrecision;
  approximate?: boolean;
  /** Source zone of the hours (shown in parentheses) */
  timeZone?: string;
  color: string;
  type: 'link' | 'event' | 'property' | 'created';
  sourceId?: string; // For selection
  eventId?: string; // For type === 'event': the ElementEvent.id, used to focus the event in the side panel
  parentElementIds?: string[]; // Element IDs this item belongs to (for swimlane grouping)
  isDimmed?: boolean; // For filter dimming
  unresolvedCommentCount?: number; // Number of unresolved comments
  // Thumbnail info from source element
  thumbLetter: string;
  thumbColor: string;
  thumbShape: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon' | 'hexagon';
  thumbImageId?: string; // AssetId for image thumbnail
  // Destination thumbnail info (for links)
  destThumbLetter?: string;
  destThumbColor?: string;
  destThumbShape?: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  destThumbImageId?: string;
}

// Constants
const MIN_ZOOM = 0.002; // pixels per day (allows viewing centuries)
const MAX_ZOOM = 1000; // pixels per day (900 = ~1h visible at 800px width)
const ROW_HEIGHT = 36;
// Selection held when the timeline was last left (the store replaces the Set
// on every change, so identity tells whether it changed in another view)
let selectionWhenTimelineLeft: ReadonlySet<string> | null = null;
const ROW_GAP = 8;
// Scatter mode: a bar too short for its content shows it just after the bar
// (each item has its own row, so the space on the right is free)
const OUTSIDE_LABEL_GAP = 6;
const LABEL_CHAR_PX = 6.5;
const DENSITY_HEIGHT = 20;

// Zoom presets (pixels per day) with approximate visible range at 800px width
const ZOOM_PRESETS = [
  { labelKey: 'timeline.zoomPresetCentury', zoom: 0.007 },  // ~300 years visible
  { labelKey: 'timeline.zoomPresetDecade', zoom: 0.07 },    // ~30 years visible
  { labelKey: 'timeline.zoomPreset1Year', zoom: 0.8 },      // ~3 years visible
  { labelKey: 'timeline.zoomPreset6Months', zoom: 1.5 },    // ~1.5 years visible
  { labelKey: 'timeline.zoomPreset1Month', zoom: 8 },       // ~3 months visible
  { labelKey: 'timeline.zoomPreset1Week', zoom: 30 },       // ~3 weeks visible
  { labelKey: 'timeline.zoomPreset6h', zoom: 200 },         // ~5 days visible, 6h labels
  { labelKey: 'timeline.zoomPreset1h', zoom: 900 },         // ~1 day visible, 1h labels
] as const;

export function TimelineView() {
  const { t, i18n } = useTranslation('pages');
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { elements, links, comments, currentDossier } = useDossierStore();
  const evaluationModel = useEvaluationModel();
  const { selectElement, selectLink, selectedElementIds, selectedLinkIds, setFocusedEventId } = useSelectionStore();
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const registerCaptureHandler = useUIStore((state) => state.registerCaptureHandler);
  const themeMode = useUIStore((state) => state.themeMode);
  const unregisterCaptureHandler = useUIStore((state) => state.unregisterCaptureHandler);
  const { filters, hiddenElementIds } = useViewStore();
  // Hidden by hand, or outside the filters when the user chose to hide them
  const viewHiddenIds = useHiddenElementIds();
  const { includedDateProperties, excludedDateProperties, dateRangeProperties } = filters;
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore();
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const queryMatchLinkIds = useQueryStore((s) => s.matchingLinkIds);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabGhostIds = useTabStore((s) => s.ghostIds);

  // Calculate dimmed element IDs based on filters, focus, insights, and query
  const tabFilterIds = useTabFilterIds();
  const dimmedElementIds = useMemo(() => {
    let dimmed: Set<string>;
    if (insightsHighlightedIds.size > 0) {
      dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) dimmed.add(el.id);
      });
    } else {
      dimmed = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, tabFilterIds);
    }
    // ZNQuery filter: dim elements not matching the query
    if (queryFilterActive && queryMatchElementIds.size > 0) {
      for (const el of elements) {
        if (!queryMatchElementIds.has(el.id)) {
          dimmed.add(el.id);
        }
      }
    }
    return dimmed;
  }, [elements, links, filters, hiddenElementIds, insightsHighlightedIds, queryFilterActive, queryMatchElementIds, evaluationModel, tabFilterIds]);

  // Persisted timeline state (survives view switches)
  const tl = useViewStore((s) => s.timeline);
  const setTimeline = useViewStore((s) => s.setTimeline);

  // Derive zoom/viewStart from store
  const zoom = tl.zoom;
  const setZoom = useCallback((v: number | ((prev: number) => number)) => {
    setTimeline({ zoom: typeof v === 'function' ? v(tl.zoom) : v });
  }, [tl.zoom, setTimeline]);

  const viewStart = useMemo(() => new Date(tl.viewStartMs || Date.now() - 80 * 24 * 60 * 60 * 1000), [tl.viewStartMs]);
  const setViewStart = useCallback((d: Date) => {
    setTimeline({ viewStartMs: d.getTime() });
  }, [setTimeline]);

  // Derive other persisted values
  const newestFirst = tl.newestFirst;
  const setNewestFirst = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setTimeline({ newestFirst: typeof v === 'function' ? v(tl.newestFirst) : v });
  }, [tl.newestFirst, setTimeline]);
  const showDensity = tl.showDensity;
  const setShowDensity = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setTimeline({ showDensity: typeof v === 'function' ? v(tl.showDensity) : v });
  }, [tl.showDensity, setTimeline]);
  const showHistogram = tl.showHistogram;
  const histogramMode = tl.histogramMode;
  // Selected histogram bar (local): highlights the matching items
  const [histogramSelection, setHistogramSelection] = useState<number | null>(null);
  // Event whose potential causes and consequences are shown (causality overlay, on demand)
  const [causalFocusId, setCausalFocusId] = useState<string | null>(null);
  const setHistogramMode = useCallback((mode: HistogramMode) => {
    setTimeline({ histogramMode: mode });
    setHistogramSelection(null);
  }, [setTimeline]);
  const toggleHistogram = useCallback(() => {
    setTimeline({ showHistogram: !tl.showHistogram });
    setHistogramSelection(null);
  }, [tl.showHistogram, setTimeline]);
  const showCausality = tl.showCausality;
  const setShowCausality = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setTimeline({ showCausality: typeof v === 'function' ? v(tl.showCausality) : v });
  }, [tl.showCausality, setTimeline]);
  const causalityMaxDays = tl.causalityMaxDays;
  const setCausalityMaxDays = useCallback((v: number) => {
    setTimeline({ causalityMaxDays: v });
  }, [setTimeline]);
  const timelineMode = tl.mode;
  const setTimelineMode = useCallback((v: 'scatter' | 'swimlane') => {
    setTimeline({ mode: v });
  }, [setTimeline]);
  const groupingCriterion = tl.groupingCriterion;
  const setGroupingCriterion = useCallback((v: string) => {
    setTimeline({ groupingCriterion: v });
  }, [setTimeline]);
  const activeTags = tl.activeTags;
  const setActiveTags = useCallback((v: string[] | null) => {
    setTimeline({ activeTags: v });
  }, [setTimeline]);
  const laneOrder = tl.laneOrder;
  const setLaneOrder = useCallback((v: string[] | null) => {
    setTimeline({ laneOrder: v });
  }, [setTimeline]);
  const showLinksInSwimlane = tl.showLinksInSwimlane;
  const setShowLinksInSwimlane = useCallback((v: boolean) => {
    setTimeline({ showLinksInSwimlane: v });
  }, [setTimeline]);
  const showCreatedAt = tl.showCreatedAt;
  const setShowCreatedAt = useCallback((v: boolean) => {
    setTimeline({ showCreatedAt: v });
  }, [setTimeline]);

  // Collapsed lanes (local, resets on remount)
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsedLanes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Local-only state (not worth persisting)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartView, setDragStartView] = useState<Date>(new Date());
  const [showTemporalFilter, setShowTemporalFilter] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);

  // Build timeline items from links and element events
  const { items, timeBounds } = useMemo(() => {
    const itemsList: TimelineItem[] = [];
    const now = new Date();
    let minTime = Infinity;
    let maxTime = -Infinity;

    // Helper to count unresolved comments for a target
    const getUnresolvedCommentCount = (targetId: string, targetType: 'element' | 'link'): number => {
      return comments.filter(
        c => c.targetId === targetId && c.targetType === targetType && !c.resolved
      ).length;
    };

    // === Mode "Investigation chronology": show elements & links by createdAt ===
    if (showCreatedAt) {
      // Elements by createdAt
      elements.forEach((element) => {
        if (viewHiddenIds.has(element.id)) return;
        if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;

        const createdDate = new Date(element.createdAt);
        if (isNaN(createdDate.getTime())) return;

        const createdTime = createdDate.getTime();
        if (createdTime < minTime) minTime = createdTime;
        if (createdTime > maxTime) maxTime = createdTime;

        const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));
        const elementLabel = element.label || t('timeline.unnamed');

        itemsList.push({
          id: `created-el-${element.id}`,
          label: elementLabel,
          start: createdDate,
          end: undefined,
          color: element.visual.color,
          type: 'created',
          sourceId: element.id,
          isDimmed: isElementDimmed,
          unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
          thumbLetter: elementLabel.charAt(0).toUpperCase(),
          thumbColor: element.visual.color,
          thumbShape: element.visual.shape || 'circle',
          thumbImageId: element.assetIds?.[0] || undefined,
        });
      });

      // Links by createdAt
      links.forEach((link) => {
        const fromElement = elements.find(el => el.id === link.fromId);
        const toElement = elements.find(el => el.id === link.toId);
        if (!fromElement || !toElement) return;
        if (viewHiddenIds.has(fromElement.id) || viewHiddenIds.has(toElement.id)) return;
        if (activeTabId !== null) {
          const fromVisible = tabMemberSet.has(fromElement.id) || tabGhostIds.has(fromElement.id);
          const toVisible = tabMemberSet.has(toElement.id) || tabGhostIds.has(toElement.id);
          if (!fromVisible || !toVisible) return;
        }

        const createdDate = new Date(link.createdAt);
        if (isNaN(createdDate.getTime())) return;

        const createdTime = createdDate.getTime();
        if (createdTime < minTime) minTime = createdTime;
        if (createdTime > maxTime) maxTime = createdTime;

        const fromLabel = fromElement.label || t('timeline.unnamed');
        const toLabel = toElement.label || t('timeline.unnamed');
        const linkLabel = link.label || t('timeline.relation');

        const endpointDimmed = dimmedElementIds.has(fromElement.id) || dimmedElementIds.has(toElement.id)
          || (activeTabId !== null && (tabGhostIds.has(fromElement.id) || tabGhostIds.has(toElement.id)));
        const isLinkDimmed = endpointDimmed && !(queryFilterActive && queryMatchLinkIds.has(link.id));

        itemsList.push({
          id: `created-lk-${link.id}`,
          label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
          start: createdDate,
          end: undefined,
          color: link.visual.color || '#6b7280',
          type: 'created',
          sourceId: link.id,
          parentElementIds: [fromElement.id, toElement.id],
          isDimmed: isLinkDimmed,
          unresolvedCommentCount: getUnresolvedCommentCount(link.id, 'link'),
          thumbLetter: fromLabel.charAt(0).toUpperCase(),
          thumbColor: fromElement.visual.color,
          thumbShape: fromElement.visual.shape || 'circle',
          thumbImageId: fromElement.assetIds?.[0] || undefined,
          destThumbLetter: toLabel.charAt(0).toUpperCase(),
          destThumbColor: toElement.visual.color,
          destThumbShape: toElement.visual.shape || 'circle',
          destThumbImageId: toElement.assetIds?.[0] || undefined,
        });
      });

      // Sort, bounds and return
      itemsList.sort((a, b) => a.start.getTime() - b.start.getTime());
      if (minTime === Infinity) {
        const nowMs = Date.now();
        minTime = nowMs - 365 * 24 * 60 * 60 * 1000;
        maxTime = nowMs + 30 * 24 * 60 * 60 * 1000;
      }
      const range = maxTime - minTime || 365 * 24 * 60 * 60 * 1000;
      const padding = range * 0.1;
      return {
        items: itemsList,
        timeBounds: { min: new Date(minTime - padding), max: new Date(maxTime + padding) },
      };
    }

    // === Normal mode: links dateRange, element events, date properties ===

    // 1. Process links with dateRange
    links.forEach((link) => {
      if (!link.dateRange?.start) return;

      const fromElement = elements.find(el => el.id === link.fromId);
      const toElement = elements.find(el => el.id === link.toId);
      if (!fromElement || !toElement) return;

      // Skip if either element is hidden
      if (viewHiddenIds.has(fromElement.id) || viewHiddenIds.has(toElement.id)) return;
      // Skip if either element is not visible in active tab
      if (activeTabId !== null) {
        const fromVisible = tabMemberSet.has(fromElement.id) || tabGhostIds.has(fromElement.id);
        const toVisible = tabMemberSet.has(toElement.id) || tabGhostIds.has(toElement.id);
        if (!fromVisible || !toVisible) return;
      }

      const startDate = new Date(link.dateRange.start);
      const enteredEnd = link.dateRange.end ? new Date(link.dateRange.end) : null;
      // A bound covers its whole period: an end "2021" lasts until 31 Dec 2021
      const endDate = enteredEnd
        ? new Date(endOfPrecision(enteredEnd, effectivePrecision(enteredEnd, link.dateRange.precision)))
        : now;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      if (startTime < minTime) minTime = startTime;
      if (endTime > maxTime) maxTime = endTime;

      const fromLabel = fromElement.label || t('timeline.unnamed');
      const toLabel = toElement.label || t('timeline.unnamed');
      const linkLabel = link.label || t('timeline.relation');

      // Check if link should be dimmed (either connected element is dimmed, or ghost in active tab)
      // Exception: if the link itself matches the active query, keep it visible
      const endpointDimmed = dimmedElementIds.has(fromElement.id) || dimmedElementIds.has(toElement.id)
        || (activeTabId !== null && (tabGhostIds.has(fromElement.id) || tabGhostIds.has(toElement.id)));
      const isLinkDimmed = endpointDimmed && !(queryFilterActive && queryMatchLinkIds.has(link.id));

      itemsList.push({
        id: `link-${link.id}`,
        label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
        sublabel: undefined,
        start: startDate,
        end: endDate,
        displayEnd: enteredEnd ?? undefined,
        precision: link.dateRange.precision,
        approximate: link.dateRange.approximate,
        timeZone: link.dateRange.timeZone,
        color: link.visual.color || '#6b7280',
        type: 'link',
        sourceId: link.id,
        parentElementIds: [fromElement.id, toElement.id],
        isDimmed: isLinkDimmed,
        unresolvedCommentCount: getUnresolvedCommentCount(link.id, 'link'),
        thumbLetter: fromLabel.charAt(0).toUpperCase(),
        thumbColor: fromElement.visual.color,
        thumbShape: fromElement.visual.shape || 'circle',
        thumbImageId: fromElement.assetIds?.[0] || undefined,
        // Destination element thumbnail
        destThumbLetter: toLabel.charAt(0).toUpperCase(),
        destThumbColor: toElement.visual.color,
        destThumbShape: toElement.visual.shape || 'circle',
        destThumbImageId: toElement.assetIds?.[0] || undefined,
      });
    });

    // 2. Process element events
    elements.forEach((element) => {
      // Skip hidden elements or elements not in active tab
      if (viewHiddenIds.has(element.id)) return;
      if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;
      if (!element.events || element.events.length === 0) return;

      const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));

      element.events.forEach((event, index) => {
        if (!event.date) return;

        const eventDate = new Date(event.date);
        if (isNaN(eventDate.getTime())) return;

        const eventTime = eventDate.getTime();
        if (eventTime < minTime) minTime = eventTime;
        if (eventTime > maxTime) maxTime = eventTime;

        const hasEnd = event.dateEnd && !isNaN(new Date(event.dateEnd).getTime());
        const enteredEnd = hasEnd ? new Date(event.dateEnd!) : null;
        // If no end date, extend to today (ongoing event); an end covers its
        // whole period ("2021" lasts until 31 Dec 2021)
        const endDate = enteredEnd
          ? new Date(endOfPrecision(enteredEnd, effectivePrecision(enteredEnd, event.precision)))
          : now;

        const endTime = endDate.getTime();
        if (endTime > maxTime) maxTime = endTime;

        const elementLabel = element.label || t('timeline.unnamed');
        const eventLabel = event.label || '';
        const isDefaultName = element.label === t('timeline.newElement') || !element.label;

        // Event properties: one per line, shown on hover only (inline they
        // drown the labels as soon as an import brings many of them)
        let eventSublabel: string | undefined;
        if (event.properties && event.properties.length > 0) {
          eventSublabel = event.properties
            .filter((p) => p.value !== null && p.value !== undefined && p.value !== '')
            .map((p) => `${p.key}: ${formatPropertyValue(p.value, p.type, i18n.language, p.timeZone)}`)
            .join('\n') || undefined;
        }

        // Build label: prefer event label alone if element has default name
        let itemLabel: string;
        if (eventLabel && isDefaultName) {
          itemLabel = eventLabel;
        } else if (eventLabel) {
          itemLabel = `${elementLabel}: ${eventLabel}`;
        } else {
          itemLabel = elementLabel;
        }

        itemsList.push({
          id: `ev-${element.id}-${index}`,
          label: itemLabel,
          sublabel: eventSublabel,
          start: eventDate,
          end: endDate,
          displayEnd: enteredEnd ?? undefined,
          precision: event.precision,
          approximate: event.approximate,
          timeZone: event.timeZone,
          color: element.visual.color,
          type: 'event',
          sourceId: element.id,
          eventId: event.id,
          isDimmed: isElementDimmed,
          unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
          thumbLetter: elementLabel.charAt(0).toUpperCase(),
          thumbColor: element.visual.color,
          thumbShape: element.visual.shape || 'circle',
          thumbImageId: element.assetIds?.[0] || undefined,
        });
      });
    });

    // 3. Process element properties with type "date" or "datetime", as chosen
    // in the filters panel; a pair declared as a period gives one bar
    const dateRules = datePropertyRules({ includedDateProperties, excludedDateProperties, dateRangeProperties });
    elements.forEach((element) => {
      // Skip hidden elements or elements not in active tab
      if (viewHiddenIds.has(element.id)) return;
      if (activeTabId !== null && !tabMemberSet.has(element.id) && !tabGhostIds.has(element.id)) return;
      if (!element.properties || element.properties.length === 0) return;

      const isElementDimmed = dimmedElementIds.has(element.id) || (activeTabId !== null && tabGhostIds.has(element.id));

      // Imported text is read like everywhere else (UTC midnight = a local day)
      for (const span of propertyDateSpans(element, dateRules)) {
        const startTime = span.start.getTime();
        const endTime = (span.end ?? span.start).getTime();
        if (startTime < minTime) minTime = startTime;
        if (endTime > maxTime) maxTime = endTime;

        const elementLabel = element.label || t('timeline.unnamed');

        itemsList.push({
          id: `prop-${element.id}-${span.index}`,
          label: span.endKey
            ? `${elementLabel}: ${span.key} → ${span.endKey}`
            : `${elementLabel}: ${span.key}`,
          start: span.start,
          end: span.end, // A point unless a pair is declared as a period
          precision: span.datetime ? 'minute' : 'day',
          ...(span.datetime && span.timeZone ? { timeZone: span.timeZone } : {}),
          color: element.visual.color,
          type: 'property',
          sourceId: element.id,
          isDimmed: isElementDimmed,
          unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
          thumbLetter: elementLabel.charAt(0).toUpperCase(),
          thumbColor: element.visual.color,
          thumbShape: element.visual.shape || 'circle',
          thumbImageId: element.assetIds?.[0] || undefined,
        });
      }
    });

    // Sort by start date (oldest first by default, will be reversed in itemsWithRows if newestFirst)
    itemsList.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Calculate bounds with padding
    if (minTime === Infinity) {
      const now = Date.now();
      minTime = now - 365 * 24 * 60 * 60 * 1000;
      maxTime = now + 30 * 24 * 60 * 60 * 1000;
    }
    const range = maxTime - minTime || 365 * 24 * 60 * 60 * 1000;
    const padding = range * 0.1;

    return {
      items: itemsList,
      timeBounds: {
        min: new Date(minTime - padding),
        max: new Date(maxTime + padding),
      },
    };
  }, [elements, links, comments, viewHiddenIds, dimmedElementIds, activeTabId, tabMemberSet, tabGhostIds, queryFilterActive, queryMatchLinkIds, showCreatedAt, i18n.language, includedDateProperties, excludedDateProperties, dateRangeProperties]);

  // Load thumbnails for items with images
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadThumbnails = async () => {
      // Collect all image IDs including destination thumbnails
      const imageIds = new Set<string>();
      items.forEach(i => {
        if (i.thumbImageId) imageIds.add(i.thumbImageId);
        if (i.destThumbImageId) imageIds.add(i.destThumbImageId);
      });

      if (imageIds.size === 0) return;

      const newThumbnails: Record<string, string> = {};

      for (const assetId of imageIds) {
        try {
          const asset = await fileService.getAssetById(assetId);
          if (asset?.thumbnailDataUrl) {
            newThumbnails[assetId] = asset.thumbnailDataUrl;
          }
        } catch {
          console.warn('Failed to load thumbnail:', assetId);
        }
      }

      setThumbnails(prev => ({ ...prev, ...newThumbnails }));
    };

    loadThumbnails();
  }, [items]);

  // Register capture handler for report screenshots
  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {
      if (!containerRef.current || items.length === 0) {
        return null;
      }

      // Calculate zoom to fit all items in view
      const containerWidth = containerRef.current.clientWidth || 800;
      const timeRangeMs = timeBounds.max.getTime() - timeBounds.min.getTime();
      const timeRangeDays = timeRangeMs / (24 * 60 * 60 * 1000);

      // Calculate zoom to fit, with some padding
      const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (containerWidth - 100) / timeRangeDays));

      // Update view to show all items
      setZoom(targetZoom);
      setViewStart(timeBounds.min);

      // Wait longer for render to complete
      await new Promise(resolve => setTimeout(resolve, 800));

      // Capture
      const element = document.querySelector('[data-report-capture="timeline"]') as HTMLElement;
      if (!element) {
        return null;
      }

      try {
        // Chargement a la demande : la capture PNG n'est pas sur le chemin nominal.
        const { toPng } = await import('html-to-image');
        return await toPng(element, {
          backgroundColor: '#faf8f5',
          pixelRatio: 2,
          skipFonts: true,
        });
      } catch {
        return null;
      }
    };

    registerCaptureHandler('timeline', captureHandler);
    return () => unregisterCaptureHandler('timeline');
  }, [items, timeBounds, registerCaptureHandler, unregisterCaptureHandler]);

  // Apply temporal filter to items
  const filteredItems = useMemo(() => {
    if (!filterStartDate && !filterEndDate) return items;

    return items.filter((item) => {
      const itemStart = item.start.getTime();

      // Filter by item START date being within the selected range
      if (filterStartDate && itemStart < filterStartDate.getTime()) return false;
      if (filterEndDate && itemStart > filterEndDate.getTime()) return false;

      return true;
    });
  }, [items, filterStartDate, filterEndDate]);

  // Histogram bar selection: dim the items outside the selected bucket
  const displayedItems = useMemo(() => {
    if (!showHistogram || histogramSelection === null) return filteredItems;
    return filteredItems.map((item) =>
      item.isDimmed || histogramBucket(item, histogramMode) === histogramSelection
        ? item
        : { ...item, isDimmed: true });
  }, [filteredItems, showHistogram, histogramSelection, histogramMode]);

  // Swimlane: optionally filter out links
  const swimlaneItems = useMemo(
    () => showLinksInSwimlane ? displayedItems : displayedItems.filter(i => i.type !== 'link'),
    [displayedItems, showLinksInSwimlane],
  );
  const elementsMap = useMemo(
    () => new Map(elements.map(el => [el.id, el])) as Map<string, ZNElement>,
    [elements],
  );
  const { availableCriteria, lanes: rawSwimlanes, availableTags } = useSwimlaneGrouping(
    swimlaneItems,
    elementsMap,
    groupingCriterion,
    activeTags,
  );

  // Apply custom lane order if set
  const swimlaneLanes = useMemo(() => {
    if (!laneOrder || laneOrder.length === 0) return rawSwimlanes;
    const orderMap = new Map(laneOrder.map((key, i) => [key, i]));
    return [...rawSwimlanes].sort((a, b) => {
      const ai = orderMap.get(a.key) ?? 9999;
      const bi = orderMap.get(b.key) ?? 9999;
      return ai - bi;
    });
  }, [rawSwimlanes, laneOrder]);

  // Reset lane order when criterion changes
  useEffect(() => {
    setLaneOrder(null);
  }, [groupingCriterion, setLaneOrder]);

  // Lane reorder callback
  const handleLaneReorder = useCallback((fromKey: string, toKey: string) => {
    const keys = swimlaneLanes.map(l => l.key);
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, fromKey);
    setLaneOrder(keys);
  }, [swimlaneLanes, setLaneOrder]);

  // Auto-fallback: if current criterion produces no lanes, switch to first available
  useEffect(() => {
    if (timelineMode === 'swimlane' && swimlaneLanes.length === 0 && availableCriteria.length > 0) {
      setGroupingCriterion(availableCriteria[0].id);
    }
  }, [timelineMode, swimlaneLanes.length, availableCriteria]);

  // Each item gets its own row for clarity
  // Sort order: oldest at top by default, or newest at top if newestFirst
  const itemsWithRows = useMemo(() => {
    const sortedItems = newestFirst ? [...displayedItems].reverse() : displayedItems;
    return sortedItems.map((item, index) => ({ ...item, row: index }));
  }, [displayedItems, newestFirst]);

  const totalRows = filteredItems.length || 1;

  // Virtualization: only render items visible in viewport (horizontal + vertical)
  const [containerWidth, setContainerWidth] = useState(800);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
      setContainerHeight(entries[0].contentRect.height);
    });
    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);
    setContainerHeight(containerRef.current.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Track scroll position for vertical virtualization
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Filter items to only those visible (horizontal + vertical)
  const visibleItems = useMemo(() => {
    const buffer = 100; // Extra pixels to render outside viewport
    const viewEndDate = new Date(viewStart.getTime() + ((containerWidth + buffer) / zoom) * 24 * 60 * 60 * 1000);
    const viewStartBuffer = new Date(viewStart.getTime() - (buffer / zoom) * 24 * 60 * 60 * 1000);

    // Vertical bounds
    const rowSize = ROW_HEIGHT + ROW_GAP;
    const vBuffer = 200; // Extra pixels vertically
    const minRow = Math.max(0, Math.floor((scrollTop - vBuffer) / rowSize));
    const maxRow = Math.ceil((scrollTop + containerHeight + vBuffer) / rowSize);

    return itemsWithRows.filter((item) => {
      // Vertical check first (cheaper)
      if (item.row < minRow || item.row > maxRow) return false;
      // Horizontal check
      const itemEnd = item.end || item.start;
      return itemEnd >= viewStartBuffer && item.start <= viewEndDate;
    });
  }, [itemsWithRows, viewStart, zoom, containerWidth, scrollTop, containerHeight]);

  // Potential causal connections between visible events of linked elements (nearest cause per
  // linked element, see causality.ts)
  const causalConnections = useMemo(() => {
    if (!showCausality) return [];
    // Only compute for visible items to keep the overlay cheap
    if (visibleItems.length > 500) return [];
    return computeCausalConnections(visibleItems, links, causalityMaxDays);
  }, [showCausality, visibleItems, links, causalityMaxDays]);

  // Number of potential causes and consequences of each event (badge shown at rest)
  const causalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { fromItem, toItem } of causalConnections) {
      counts.set(fromItem.id, (counts.get(fromItem.id) ?? 0) + 1);
      counts.set(toItem.id, (counts.get(toItem.id) ?? 0) + 1);
    }
    return counts;
  }, [causalConnections]);

  // Connections of the focused event only, and the events they involve (others are dimmed)
  const focusedCausalConnections = useMemo(
    () => (causalFocusId
      ? causalConnections.filter((c) => c.fromItem.id === causalFocusId || c.toItem.id === causalFocusId)
      : []),
    [causalConnections, causalFocusId]
  );
  const causalFocusSet = useMemo(() => {
    if (!causalFocusId) return null;
    const ids = new Set<string>([causalFocusId]);
    for (const { fromItem, toItem } of focusedCausalConnections) {
      ids.add(fromItem.id);
      ids.add(toItem.id);
    }
    return ids;
  }, [causalFocusId, focusedCausalConnections]);

  // Escape leaves the focus (turning the overlay off forgets it, see its button)
  useEffect(() => {
    if (!causalFocusId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCausalFocusId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [causalFocusId]);

  // Convert date to X position
  const dateToX = useCallback((date: Date): number => {
    const days = (date.getTime() - viewStart.getTime()) / (24 * 60 * 60 * 1000);
    return days * zoom;
  }, [viewStart, zoom]);

  // Convert X position to date
  const xToDate = useCallback((x: number): Date => {
    const days = x / zoom;
    return new Date(viewStart.getTime() + days * 24 * 60 * 60 * 1000);
  }, [viewStart, zoom]);

  // Get container width
  const getContainerWidth = useCallback((): number => {
    return containerRef.current?.clientWidth || 800;
  }, []);

  // Generate axis labels based on zoom level
  const axisLabels = useMemo(() => {
    const labels: { x: number; label: string; isMain: boolean }[] = [];
    const containerWidth = getContainerWidth();
    const viewEnd = xToDate(containerWidth);

    let step: 'hour' | 'hour6' | 'day' | 'week' | 'month' | 'year' | 'decade' | 'century';
    let format: Intl.DateTimeFormatOptions;

    // Pixel-based step selection for smooth transitions: choose the smallest time unit whose
    // labels fit between two ticks. Minimum spacing per step, from its label width at 10px
    // ("12:00", "12 sept.", "sept." / "2025")
    const SPACING = { hour: 40, day: 48, month: 36, year: 36 };

    const hourSpacing = zoom / 24; // pixels per hour
    const hour6Spacing = zoom / 4; // pixels per 6 hours
    const daySpacing = zoom; // pixels per day
    const weekSpacing = zoom * 7; // pixels per week
    const monthSpacing = zoom * 30; // pixels per month (approx)
    const yearSpacing = zoom * 365; // pixels per year
    const decadeSpacing = zoom * 3652; // pixels per decade

    if (hourSpacing >= SPACING.hour) {
      step = 'hour';
      format = { hour: '2-digit', minute: '2-digit' };
    } else if (hour6Spacing >= SPACING.hour) {
      step = 'hour6';
      format = { hour: '2-digit', minute: '2-digit' };
    } else if (daySpacing >= SPACING.day) {
      step = 'day';
      format = { day: 'numeric', month: 'short' };
    } else if (weekSpacing >= SPACING.day) {
      step = 'week';
      format = { day: 'numeric', month: 'short' };
    } else if (monthSpacing >= SPACING.month) {
      // Short month only; January (main tick) shows the year instead
      step = 'month';
      format = { month: 'short' };
    } else if (yearSpacing >= SPACING.year) {
      step = 'year';
      format = { year: 'numeric' };
    } else if (decadeSpacing >= SPACING.year) {
      step = 'decade';
      format = { year: 'numeric' };
    } else {
      step = 'century';
      format = { year: 'numeric' };
    }

    const current = new Date(viewStart);

    // Align to step boundary
    if (step === 'hour') {
      current.setMinutes(0, 0, 0);
    } else if (step === 'hour6') {
      current.setHours(Math.floor(current.getHours() / 6) * 6, 0, 0, 0);
    } else if (step === 'century') {
      current.setFullYear(Math.floor(current.getFullYear() / 100) * 100);
      current.setMonth(0, 1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'decade') {
      current.setFullYear(Math.floor(current.getFullYear() / 10) * 10);
      current.setMonth(0, 1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'year') {
      current.setMonth(0, 1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'month') {
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'week') {
      const dayOfWeek = current.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      current.setDate(current.getDate() + daysToMonday);
      current.setHours(0, 0, 0, 0);
    } else {
      current.setHours(0, 0, 0, 0);
    }

    while (current <= viewEnd) {
      const x = dateToX(current);
      if (x >= -50 && x <= containerWidth + 50) {
        const isMain = step === 'century' ||
                       (step === 'decade' && current.getFullYear() % 100 === 0) ||
                       step === 'year' ||
                       (step === 'month' && current.getMonth() === 0) ||
                       (step === 'week' && current.getDate() <= 7) ||
                       (step === 'day' && (current.getDate() === 1 || current.getDay() === 1)) ||
                       (step === 'hour6' && current.getHours() === 0) ||
                       (step === 'hour' && current.getHours() % 6 === 0);
        // For year/decade/century: use getFullYear() directly to show negative years (BC)
        // For hour steps: show date at midnight ticks, time otherwise
        const locale = dateLocale(i18n.language);
        let label: string;
        if (step === 'century' || step === 'decade' || step === 'year' || (step === 'month' && isMain)) {
          label = String(current.getFullYear());
        } else if (step === 'hour' || step === 'hour6') {
          label = isMain
            ? current.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
            : `${String(current.getHours()).padStart(2, '0')}:00`;
        } else {
          label = current.toLocaleDateString(locale, format);
        }
        labels.push({ x, label, isMain });
      }

      // Increment
      if (step === 'hour') {
        current.setHours(current.getHours() + 1);
      } else if (step === 'hour6') {
        current.setHours(current.getHours() + 6);
      } else if (step === 'century') {
        current.setFullYear(current.getFullYear() + 100);
      } else if (step === 'decade') {
        current.setFullYear(current.getFullYear() + 10);
      } else if (step === 'year') {
        current.setFullYear(current.getFullYear() + 1);
      } else if (step === 'month') {
        current.setMonth(current.getMonth() + 1);
      } else if (step === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setDate(current.getDate() + 1);
      }
    }

    return labels;
  }, [viewStart, zoom, dateToX, xToDate, getContainerWidth, i18n.language]);

  // Today marker position
  const todayX = useMemo(() => dateToX(new Date()), [dateToX]);

  // Density heatmap — adaptive bucket size based on zoom
  const densityData = useMemo(() => {
    if (items.length === 0) return { buckets: [] as { start: Date; end: Date; count: number }[], maxCount: 0 };

    // Choose bucket size so each cell is at least 4px wide
    const minDays = 4 / zoom;
    let bucketDays: number;
    if (minDays <= 7) bucketDays = 7;
    else if (minDays <= 14) bucketDays = 14;
    else if (minDays <= 30) bucketDays = 30;
    else if (minDays <= 90) bucketDays = 90;
    else if (minDays <= 365) bucketDays = 365;
    else if (minDays <= 3652) bucketDays = 3652;
    else bucketDays = 36525;

    const start = timeBounds.min.getTime();
    const end = timeBounds.max.getTime();
    const rangeMs = end - start;
    // Ensure at most 5000 buckets regardless of zoom level (avoids spread RangeError)
    const minBucketDays = rangeMs / (5000 * 24 * 60 * 60 * 1000);
    if (minBucketDays > bucketDays) {
      if (minBucketDays <= 14) bucketDays = 14;
      else if (minBucketDays <= 30) bucketDays = 30;
      else if (minBucketDays <= 90) bucketDays = 90;
      else if (minBucketDays <= 365) bucketDays = 365;
      else if (minBucketDays <= 3652) bucketDays = 3652;
      else bucketDays = 36525;
    }
    const bucketMs = bucketDays * 24 * 60 * 60 * 1000;
    const numBuckets = Math.ceil(rangeMs / bucketMs);

    const counts = new Array(numBuckets).fill(0);
    for (const item of items) {
      const idx = Math.floor((item.start.getTime() - start) / bucketMs);
      if (idx >= 0 && idx < numBuckets) counts[idx]++;
    }

    const maxCount = counts.reduce((max, v) => v > max ? v : max, 1);
    const buckets = counts.map((count, i) => ({
      start: new Date(start + i * bucketMs),
      end: new Date(start + (i + 1) * bucketMs),
      count,
    }));

    return { buckets, maxCount };
  }, [items, timeBounds, zoom]);

  // Only render density cells in the visible horizontal range
  const visibleDensityCells = useMemo(() => {
    const { buckets } = densityData;
    if (buckets.length === 0) return [];
    const buffer = 50;
    const viewEndMs = viewStart.getTime() + ((containerWidth + buffer) / zoom) * 24 * 60 * 60 * 1000;
    const viewStartMs = viewStart.getTime() - (buffer / zoom) * 24 * 60 * 60 * 1000;
    return buckets.filter(b => b.end.getTime() >= viewStartMs && b.start.getTime() <= viewEndMs);
  }, [densityData, viewStart, zoom, containerWidth]);

  // Click density cell → apply temporal filter to that bucket
  const handleDensityCellClick = useCallback((bucketStart: Date, bucketEnd: Date) => {
    setShowTemporalFilter(true);
    setFilterStartDate(bucketStart);
    setFilterEndDate(bucketEnd);
  }, []);

  // Handle wheel zoom - use ref to avoid stale closures
  const zoomRef = useRef(zoom);
  const viewStartRef = useRef(viewStart);
  useEffect(() => {
    zoomRef.current = zoom;
    viewStartRef.current = viewStart;
  }, [zoom, viewStart]);

  // Wheel zoom with native event listener for proper preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      // Convert X to date using current refs
      const currentZoom = zoomRef.current;
      const currentViewStart = viewStartRef.current;
      const days = mouseX / currentZoom;
      const dateAtMouse = new Date(currentViewStart.getTime() + days * 24 * 60 * 60 * 1000);

      const zoomFactor = e.deltaY > 0 ? 0.8 : 1.25;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * zoomFactor));

      // Adjust viewStart to keep mouse position stable
      const newDaysFromStart = mouseX / newZoom;
      const newViewStart = new Date(dateAtMouse.getTime() - newDaysFromStart * 24 * 60 * 60 * 1000);

      // Update refs immediately so rapid successive wheel events accumulate correctly
      // (the useEffect sync only runs after React re-renders, causing stale reads)
      zoomRef.current = newZoom;
      viewStartRef.current = newViewStart;

      setZoom(newZoom);
      setViewStart(newViewStart);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // RAF-based panning for smooth performance
  const rafRef = useRef<number | null>(null);
  const pendingViewStartRef = useRef<Date | null>(null);

  // Handle mouse drag for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartView(viewStart);
  }, [viewStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaDays = -deltaX / zoom;
    const newViewStart = new Date(dragStartView.getTime() + deltaDays * 24 * 60 * 60 * 1000);

    // Use RAF for smoother updates
    pendingViewStartRef.current = newViewStart;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        if (pendingViewStartRef.current) {
          setViewStart(pendingViewStartRef.current);
        }
        rafRef.current = null;
      });
    }
  }, [isDragging, dragStartX, dragStartView, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Handle item click
  const handleItemClick = useCallback((item: TimelineItem, e: React.MouseEvent) => {
    e.stopPropagation();
    // With the causality overlay on, the clicked event becomes its subject (click again to leave)
    if (showCausality) setCausalFocusId((prev) => (prev === item.id ? null : item.id));
    // Select the element/link (its details open in the side panel)
    if (!item.sourceId) return;
    if (item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'))) {
      selectLink(item.sourceId);
    } else {
      selectElement(item.sourceId);
      // For event items, focus the underlying event in the side panel (auto-expand + scroll)
      setFocusedEventId(item.type === 'event' && item.eventId ? item.eventId : null);
    }
  }, [selectElement, selectLink, setFocusedEventId, showCausality]);

  // Navigation handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z * 1.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z / 1.5));
  }, []);

  const handleToday = useCallback(() => {
    const containerWidth = getContainerWidth();
    const daysVisible = containerWidth / zoom;
    const now = new Date();
    setViewStart(new Date(now.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000));
  }, [zoom, getContainerWidth]);

  const handleFitAll = useCallback(() => {
    if (!timeBounds) return;
    const containerWidth = getContainerWidth();
    const totalDays = (timeBounds.max.getTime() - timeBounds.min.getTime()) / (24 * 60 * 60 * 1000);
    // Add 10% padding on each side
    const paddedDays = totalDays * 1.2;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / paddedDays));
    // Start 10% before min
    const paddingMs = (timeBounds.max.getTime() - timeBounds.min.getTime()) * 0.1;
    setZoom(newZoom);
    setViewStart(new Date(timeBounds.min.getTime() - paddingMs));
  }, [timeBounds, getContainerWidth]);

  // Bring an item on screen: its start date centred and, one row per item
  // (not in swimlanes, where rows are lanes), its row scrolled to the middle
  const revealItem = useCallback((item: { start: Date; row: number }) => {
    const daysVisible = getContainerWidth() / zoom;
    setViewStart(new Date(item.start.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000));
    const container = containerRef.current;
    if (container && timelineMode !== 'swimlane') {
      container.scrollTop = Math.max(0, item.row * (ROW_HEIGHT + ROW_GAP) - container.clientHeight / 2);
    }
  }, [zoom, getContainerWidth, setViewStart, timelineMode]);

  // ── Listen for scrollToElement events (from search modal) ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const elementId = (e as CustomEvent).detail?.elementId as string | undefined;
      if (!elementId) return;
      // Find the first timeline item for this element
      const item = itemsWithRows.find(it => it.sourceId === elementId);
      if (item) revealItem(item);
    };
    window.addEventListener('timeline:scrollToElement', handler);
    return () => window.removeEventListener('timeline:scrollToElement', handler);
  }, [itemsWithRows, revealItem]);

  // Arriving on the timeline with an element selected elsewhere (canvas, map):
  // bring it on screen, unless it already is. A selection unchanged since the
  // timeline was left keeps its position. Once per opening of the view.
  const revealedOnOpenRef = useRef(false);
  // Decided on the first mount only: refs survive StrictMode's remount,
  // whose cleanup would otherwise record the selection as already seen
  const selectionChangedRef = useRef<boolean | null>(null);
  useEffect(() => {
    selectionChangedRef.current ??= useSelectionStore.getState().selectedElementIds !== selectionWhenTimelineLeft;
    return () => { selectionWhenTimelineLeft = useSelectionStore.getState().selectedElementIds; };
  }, []);
  useEffect(() => {
    if (revealedOnOpenRef.current || itemsWithRows.length === 0) return;
    revealedOnOpenRef.current = true;
    if (selectedElementIds.size === 0 || !selectionChangedRef.current) return;
    const item = itemsWithRows.find(it => it.sourceId !== undefined && selectedElementIds.has(it.sourceId));
    if (!item) return;
    const viewEndMs = viewStart.getTime() + (getContainerWidth() / zoom) * 24 * 60 * 60 * 1000;
    const startMs = item.start.getTime();
    const onScreenX = startMs >= viewStart.getTime() && startMs <= viewEndMs;
    const container = containerRef.current;
    const top = item.row * (ROW_HEIGHT + ROW_GAP);
    const onScreenY = timelineMode === 'swimlane' || !container
      || (top >= container.scrollTop && top + ROW_HEIGHT <= container.scrollTop + container.clientHeight);
    if (!onScreenX || !onScreenY) revealItem(item);
  }, [itemsWithRows, selectedElementIds, viewStart, zoom, getContainerWidth, timelineMode, revealItem]);

  // Cleanup mouse events and RAF
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Fit all items on first-ever visit (viewStartMs === 0); otherwise keep persisted position
  useEffect(() => {
    if (tl.viewStartMs !== 0) return; // Already has a persisted position
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth || 800;
    const totalDays = (timeBounds.max.getTime() - timeBounds.min.getTime()) / (24 * 60 * 60 * 1000);
    if (totalDays <= 0) return;
    const paddedDays = totalDays * 1.2;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / paddedDays));
    const paddingMs = (timeBounds.max.getTime() - timeBounds.min.getTime()) * 0.1;
    setZoom(newZoom);
    setViewStart(new Date(timeBounds.min.getTime() - paddingMs));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fit all on first mount only

  // Check if item is selected
  const isSelected = useCallback((item: TimelineItem): boolean => {
    if (!item.sourceId) return false;
    if (item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'))) {
      return selectedLinkIds.has(item.sourceId);
    }
    return selectedElementIds.has(item.sourceId);
  }, [selectedElementIds, selectedLinkIds]);

  // Empty state
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-secondary">
        <Calendar size={48} className="text-text-tertiary mb-4" />
        <p className="text-sm text-text-secondary">{t('timeline.noTemporalData')}</p>
        <p className="text-xs text-text-tertiary mt-2 text-center max-w-sm px-4">
          {t('timeline.howToAddTimeline')}<br/>
          - {t('timeline.addPeriodToLinks')}<br/>
          - {t('timeline.addEventsToHistory')}
        </p>
      </div>
    );
  }

  const contentHeight = totalRows * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Toolbar */}
      <ViewToolbar
        leftContent={
          <SwimlaneToolbar
            mode={timelineMode}
            onModeChange={setTimelineMode}
            criterion={groupingCriterion}
            onCriterionChange={setGroupingCriterion}
            availableCriteria={availableCriteria}
            availableTags={availableTags}
            activeTags={activeTags}
            onActiveTagsChange={setActiveTags}
            showLinks={showLinksInSwimlane}
            onShowLinksChange={setShowLinksInSwimlane}
          />
        }
        rightContent={
          <>
            {/* Zoom presets */}
            <div className="flex items-center border border-border-default rounded overflow-hidden mr-2">
              {ZOOM_PRESETS.map((preset) => {
                const isActive = Math.abs(zoom - preset.zoom) < preset.zoom * 0.3;
                return (
                  <button
                    key={preset.labelKey}
                    onClick={() => {
                      const containerWidth = getContainerWidth();
                      const daysVisible = containerWidth / preset.zoom;
                      const center = xToDate(containerWidth / 2);
                      const newViewStart = new Date(center.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000);
                      setZoom(preset.zoom);
                      setViewStart(newViewStart);
                    }}
                    className={`px-2 h-6 text-[10px] ${isActive ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                  >
                    {t(preset.labelKey)}
                  </button>
                );
              })}
            </div>
            <button onClick={handleZoomOut} className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded" title={t('timeline.zoomOut')}>
              <ZoomOut size={16} />
            </button>
            <button onClick={handleZoomIn} className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded" title={t('timeline.zoomIn')}>
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button onClick={handleToday} className="px-2 h-6 text-[10px] text-text-secondary hover:bg-bg-tertiary rounded border border-border-default" title={t('timeline.centerOnToday')}>{t('timeline.todayShort')}</button>
            <button onClick={handleFitAll} className="px-2 h-6 text-[10px] text-text-secondary hover:bg-bg-tertiary rounded border border-border-default" title={t('timeline.viewAll')}>{t('timeline.fitAll')}</button>
            {timelineMode === 'scatter' && (
              <>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => setNewestFirst(!newestFirst)}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                newestFirst
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={newestFirst ? t('timeline.newestFirst') : t('timeline.oldestFirst')}
            >
              <ArrowUpDown size={10} />
              {newestFirst ? t('timeline.recentUp') : t('timeline.oldUp')}
            </button>
            {!showCreatedAt && (
              <>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => {
                setShowCausality(!showCausality);
                setCausalFocusId(null);
              }}
              className={`px-2 h-6 text-[10px] border flex items-center gap-1 ${
                showCausality
                  ? 'bg-accent text-white border-accent rounded-l'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default rounded'
              }`}
              title={t('timeline.causalityHint')}
            >
              <GitBranch size={10} />
              {t('timeline.causality')}
            </button>
            {/* Causality time threshold presets */}
            {showCausality && (
              <div className="flex items-center border border-l-0 border-border-default rounded-r overflow-hidden">
                {[
                  { label: '30j', days: 30 },
                  { label: '90j', days: 90 },
                  { label: '1an', days: 365 },
                  { label: '5ans', days: 1825 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    onClick={() => setCausalityMaxDays(preset.days)}
                    className={`px-1.5 h-6 text-[9px] ${
                      causalityMaxDays === preset.days
                        ? 'bg-accent/20 text-accent font-medium'
                        : 'text-text-tertiary hover:bg-bg-tertiary'
                    }`}
                    title={t('timeline.maxDaysBetweenEvents', { days: preset.label })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
              </>
            )}
              </>
            )}
            <button
              onClick={() => setShowCreatedAt(!showCreatedAt)}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                showCreatedAt
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={t('timeline.createdAtHint')}
            >
              <Clock size={10} />
              {t('timeline.createdAt')}
            </button>
            <button
              onClick={() => setShowDensity(!showDensity)}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                showDensity
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={t('timeline.densityHint')}
            >
              <BarChart3 size={10} />
              {t('timeline.density')}
            </button>
            <button
              onClick={toggleHistogram}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                showHistogram
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={t('timeline.histogramHint')}
            >
              <ChartColumnBig size={10} />
              {t('timeline.histogram')}
            </button>
            <div className="w-px h-4 bg-border-default mx-1" />
            {/* Temporal filter toggle */}
            <button
              onClick={() => setShowTemporalFilter(!showTemporalFilter)}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                showTemporalFilter || filterStartDate || filterEndDate
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={t('timeline.temporalFilterHint')}
            >
              <Filter size={10} />
              {t('timeline.filter')}
            </button>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => {
                const name = currentDossier?.name || 'timeline';
                const date = toLocalDateKey(new Date());
                exportTimelineToCSV(filteredItems, `${name}_timeline_${date}.csv`);
              }}
              disabled={filteredItems.length === 0}
              className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('timeline.exportCSV')}
            >
              <Upload size={16} />
            </button>
          </>
        }
      />

      {/* Temporal filter slider */}
      {showTemporalFilter && timeBounds && (
        <TimelineRangeSlider
          minDate={timeBounds.min}
          maxDate={timeBounds.max}
          startDate={filterStartDate}
          endDate={filterEndDate}
          onRangeChange={(start, end) => {
            setFilterStartDate(start);
            setFilterEndDate(end);
          }}
          onClear={() => {
            setFilterStartDate(null);
            setFilterEndDate(null);
          }}
        />
      )}

      {showHistogram && (
        <ActivityHistogramBar
          items={filteredItems}
          mode={histogramMode}
          onModeChange={setHistogramMode}
          selected={histogramSelection}
          onSelect={setHistogramSelection}
        />
      )}

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-hidden overflow-y-auto relative select-none"
        data-report-capture="timeline"
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Time axis + density bar - sticky */}
        <div className="sticky top-0 left-0 right-0 z-10">
          {/* Axis */}
          <div className="h-7 bg-bg-primary border-b border-border-default overflow-hidden relative">
            {axisLabels.map((label, i) => (
              <div
                key={i}
                className="absolute top-0 h-full flex items-end pb-1 will-change-transform"
                style={{ transform: `translate3d(${label.x}px, 0, 0)` }}
              >
                <span className={`text-[10px] whitespace-nowrap ${label.isMain ? 'text-text-primary font-medium' : 'text-text-tertiary'}`}>
                  {label.label}
                </span>
                <div
                  className={`absolute bottom-0 w-px h-2 ${label.isMain ? 'bg-border-strong' : 'bg-border-default'}`}
                />
              </div>
            ))}
          </div>
          {/* Density heatmap bar */}
          {showDensity && visibleDensityCells.length > 0 && (
            <div className="bg-bg-primary border-b border-border-default overflow-hidden relative" style={{ height: DENSITY_HEIGHT }}>
              {visibleDensityCells.map((bucket, i) => {
                const x = dateToX(bucket.start);
                const cellWidth = dateToX(bucket.end) - x;
                const gap = cellWidth > 3 ? 1 : 0;
                const locale = dateLocale(i18n.language);
                const fmt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
                const label = `${bucket.start.toLocaleDateString(locale, fmt)} – ${bucket.end.toLocaleDateString(locale, fmt)}: ${bucket.count}`;
                return (
                  <div
                    key={i}
                    className="absolute top-0.5 bottom-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      transform: `translate3d(${x}px, 0, 0)`,
                      width: Math.max(1, cellWidth - gap),
                      backgroundColor: getDensityColor(bucket.count, densityData.maxCount),
                      borderRadius: 1,
                    }}
                    title={label}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDensityCellClick(bucket.start, bucket.end);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Content area: scatter or swimlane */}
        {timelineMode === 'swimlane' ? (
          <TimelineSwimlane
            lanes={swimlaneLanes}
            dateToX={dateToX}
            containerWidth={containerWidth}
            scrollTop={scrollTop}
            containerHeight={containerHeight}
            axisLabels={axisLabels}
            onItemClick={(item, e) => {
              e.stopPropagation();
              if (item.sourceId) {
                if (item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'))) {
                  selectLink(item.sourceId);
                } else {
                  selectElement(item.sourceId);
                  setFocusedEventId(item.type === 'event' && item.eventId ? item.eventId : null);
                }
              }
            }}
            isSelected={(item) => {
              if (!item.sourceId) return false;
              return selectedElementIds.has(item.sourceId) || selectedLinkIds.has(item.sourceId);
            }}
            selectedElementIds={selectedElementIds}
            anonymousMode={anonymousMode}
            containerRef={containerRef}
            onLaneReorder={handleLaneReorder}
            collapsedLanes={collapsedLanes}
            onToggleCollapse={handleToggleCollapse}
          />
        ) : (
        <div
          ref={contentRef}
          className="relative bg-bg-secondary"
          style={{ height: contentHeight }}
        >
          {/* Today marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-error z-20 will-change-transform"
            style={{ transform: `translate3d(${todayX}px, 0, 0)` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-error rounded-full" />
          </div>

          {/* Items - virtualized, only renders visible items */}
          {visibleItems.map((item) => {
            const x = dateToX(item.start);
            const endX = item.end ? dateToX(item.end) : x + 20;
            const width = Math.max(20, endX - x);
            const y = ROW_GAP + item.row * (ROW_HEIGHT + ROW_GAP);
            const selected = isSelected(item);
            const isRange = !!item.end;
            const hasThumbImage = item.thumbImageId && thumbnails[item.thumbImageId];
            const dimmed = item.isDimmed || (causalFocusSet !== null && !causalFocusSet.has(item.id));
            const causalCount = showCausality ? causalCounts.get(item.id) ?? 0 : 0;
            const causalBadge = causalCount > 0 ? (
              <div
                className={`absolute -top-1.5 -left-1.5 h-4 min-w-4 px-0.5 rounded-full flex items-center justify-center gap-px text-[9px] font-medium z-10 border ${
                  causalFocusId === item.id
                    ? 'bg-accent text-white border-accent'
                    : 'bg-bg-primary text-text-secondary border-border-strong'
                }`}
                title={t('timeline.causalityBadge', { count: causalCount })}
              >
                <GitBranch size={8} />
                {causalCount}
              </div>
            ) : null;

            // Calculate content offset to keep it visible when item extends beyond left edge
            // contentOffset pushes the content to the right when item starts before viewport
            const contentOffset = Math.max(0, Math.min(-x, width - 200)); // Max offset leaves at least 200px for content

            // For point-in-time items with an image, show the thumbnail instead of colored circle
            if (!isRange) {
              return (
                <div
                  key={item.id}
                  className={`absolute cursor-pointer will-change-transform ${
                    selected ? 'ring-2 ring-accent ring-offset-1' : ''
                  }`}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, 0)`,
                    width: ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    opacity: dimmed ? 0.3 : 1,
                  }}
                  onClick={(e) => handleItemClick(item, e)}
                  title={anonymousMode ? formatItemDates(item, i18n.language) : itemTooltip(item, i18n.language)}
                >
                  {hasThumbImage ? (
                    // Show image thumbnail for property items
                    <div
                      className="w-full h-full rounded-full bg-cover bg-center border-2 border-white shadow-sm overflow-hidden"
                      style={{
                        backgroundImage: `url(${thumbnails[item.thumbImageId!]})`,
                        filter: hideMedia ? 'blur(8px)' : undefined,
                      }}
                    />
                  ) : (
                    // Fallback to colored shape with letter
                    <ItemThumbnail
                      shape={item.thumbShape}
                      color={item.thumbColor}
                      letter={anonymousMode ? '?' : item.thumbLetter}
                      size={ROW_HEIGHT}
                    />
                  )}
                  {/* Label after the point (its row is free on the right) */}
                  <div
                    className="absolute top-0 h-full flex items-center whitespace-nowrap"
                    style={{ left: ROW_HEIGHT + OUTSIDE_LABEL_GAP }}
                  >
                    {anonymousMode ? (
                      <span className="inline-block bg-text-primary rounded-sm h-3" style={{ width: '4em' }} />
                    ) : (
                      <span className="text-xs text-text-primary font-medium">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {causalBadge}
                  {/* Comment indicator */}
                  {showCommentBadges && item.unresolvedCommentCount !== undefined && item.unresolvedCommentCount > 0 && (
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm z-10"
                      title={t('timeline.unresolvedComments', { count: item.unresolvedCommentCount })}
                    >
                      {item.unresolvedCommentCount}
                    </div>
                  )}
                </div>
              );
            }

            // Range items (links, events with duration). Short bars keep their
            // true length; their thumbnail and label move just after the bar.
            const isLinkItem = item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'));
            const contentWidth = 8 + 24 + 8 + Math.min(item.label.length, 80) * LABEL_CHAR_PX + 8 + (isLinkItem ? 32 : 0);
            const labelOutside = width < contentWidth;
            return (
              <div
                key={item.id}
                className={`absolute cursor-pointer will-change-transform ${
                  selected ? 'ring-2 ring-accent ring-offset-1' : ''
                }`}
                style={{
                  transform: `translate3d(${x}px, ${y}px, 0)`,
                  width: width,
                  height: ROW_HEIGHT,
                  opacity: dimmed ? 0.3 : 1,
                }}
                onClick={(e) => handleItemClick(item, e)}
                title={anonymousMode ? formatItemDates(item, i18n.language) : itemTooltip(item, i18n.language)}
              >
                {/* Period bar with clear border frame */}
                <div
                  className="absolute inset-0 rounded"
                  style={{
                    backgroundColor: `${item.color}${themeMode === 'light' ? '40' : '25'}`,
                    border: selected
                      ? 'none'
                      : `1.5px solid ${themeMode === 'light' ? `color-mix(in srgb, ${item.color}, black 30%)` : item.color}`,
                    boxShadow: selected ? undefined : `inset 0 0 0 1px ${item.color}30`,
                  }}
                />
                {causalBadge}
                {/* Comment indicator */}
                {showCommentBadges && item.unresolvedCommentCount !== undefined && item.unresolvedCommentCount > 0 && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm z-10"
                    title={t('timeline.unresolvedComments', { count: item.unresolvedCommentCount })}
                  >
                    {item.unresolvedCommentCount}
                  </div>
                )}
                {labelOutside ? (
                  <div
                    className="absolute top-0 h-full flex items-center gap-1.5 whitespace-nowrap"
                    style={{ left: width + OUTSIDE_LABEL_GAP }}
                  >
                    <ItemThumbnail
                      imageUrl={item.thumbImageId ? thumbnails[item.thumbImageId] : undefined}
                      shape={item.thumbShape}
                      color={item.thumbColor}
                      letter={anonymousMode ? '?' : item.thumbLetter}
                      blur={hideMedia}
                    />
                    {anonymousMode ? (
                      <span className="inline-block bg-text-primary rounded-sm h-3" style={{ width: '4em' }} />
                    ) : (
                      <span className="text-xs text-text-primary font-medium">
                        {item.label}
                      </span>
                    )}
                  </div>
                ) : (
                  // Content inside the bar
                  <div
                    className="relative h-full flex items-center overflow-hidden gap-2 pr-2"
                    style={{ paddingLeft: contentOffset + 8 }}
                  >
                    {/* Source thumbnail - image or shape (blur images if hideMedia enabled) */}
                    <ItemThumbnail
                      imageUrl={item.thumbImageId ? thumbnails[item.thumbImageId] : undefined}
                      shape={item.thumbShape}
                      color={item.thumbColor}
                      letter={anonymousMode ? '?' : item.thumbLetter}
                      blur={hideMedia}
                    />
                    {anonymousMode ? (
                      <span className="flex items-center gap-1">
                        <span className="inline-block bg-text-primary rounded-sm h-3" style={{ width: '2em' }} />
                        <span className="text-xs text-text-tertiary">→</span>
                        <span className="inline-block bg-text-primary rounded-sm h-3" style={{ width: '3em' }} />
                        <span className="text-xs text-text-tertiary">→</span>
                        <span className="inline-block bg-text-primary rounded-sm h-3" style={{ width: '2em' }} />
                      </span>
                    ) : (
                      <div className="flex flex-col flex-1 min-w-0 justify-center">
                        <span className="text-xs text-text-primary truncate font-medium">
                          {item.label}
                        </span>
                      </div>
                    )}
                    {/* Destination thumbnail for links */}
                    {(item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'))) && item.destThumbLetter && (
                      <ItemThumbnail
                        imageUrl={item.destThumbImageId ? thumbnails[item.destThumbImageId] : undefined}
                        shape={item.destThumbShape || 'circle'}
                        color={item.destThumbColor || '#6b7280'}
                        letter={anonymousMode ? '?' : item.destThumbLetter}
                        blur={hideMedia}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Causal connections - rendered as SVG curves */}
          {showCausality && focusedCausalConnections.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none z-5"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* Arrow markers for each color */}
                <marker id="causal-arrow-short" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" style={{ fill: CAUSAL_COLORS.short }} fillOpacity="0.8" />
                </marker>
                <marker id="causal-arrow-medium" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" style={{ fill: CAUSAL_COLORS.medium }} fillOpacity="0.8" />
                </marker>
                <marker id="causal-arrow-long" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" style={{ fill: CAUSAL_COLORS.long }} fillOpacity="0.7" />
                </marker>
                {/* Glow filter */}
                <filter id="causal-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {focusedCausalConnections.map((conn, idx) => {
                // Calculate positions
                const fromEndX = dateToX(conn.fromItem.end || conn.fromItem.start);
                const fromY = ROW_GAP + conn.fromItem.row * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;
                const toStartX = dateToX(conn.toItem.start);
                const toY = ROW_GAP + conn.toItem.row * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;

                // Calculate days between events
                const fromEnd = conn.fromItem.end || conn.fromItem.start;
                const daysBetween = Math.round((conn.toItem.start.getTime() - fromEnd.getTime()) / (24 * 60 * 60 * 1000));

                // Determine color category based on days between
                let colorCategory: 'short' | 'medium' | 'long';
                if (daysBetween <= 30) {
                  colorCategory = 'short';
                } else if (daysBetween <= 180) {
                  colorCategory = 'medium';
                } else {
                  colorCategory = 'long';
                }

                // Calculate better bezier control points for natural curves
                const horizontalDist = toStartX - fromEndX;
                const verticalDist = toY - fromY;
                const absVerticalDist = Math.abs(verticalDist);

                // Control point offset scales with both horizontal and vertical distance
                const cpOffsetX = Math.min(horizontalDist * 0.4, 150);
                const cpOffsetY = absVerticalDist > 50 ? absVerticalDist * 0.3 : 20;

                // Create a more natural S-curve when items are far apart vertically
                let path: string;
                if (absVerticalDist < ROW_HEIGHT * 2) {
                  // Simple curve for items close together
                  const midX = (fromEndX + toStartX) / 2;
                  path = `M ${fromEndX + 4} ${fromY}
                          Q ${midX} ${fromY + (verticalDist > 0 ? cpOffsetY : -cpOffsetY)},
                            ${toStartX - 10} ${toY}`;
                } else {
                  // S-curve for items far apart
                  const cp1x = fromEndX + cpOffsetX;
                  const cp1y = fromY;
                  const cp2x = toStartX - cpOffsetX;
                  const cp2y = toY;
                  path = `M ${fromEndX + 4} ${fromY}
                          C ${cp1x} ${cp1y},
                            ${cp2x} ${cp2y},
                            ${toStartX - 10} ${toY}`;
                }

                // Calculate midpoint for label placement
                const midX = (fromEndX + toStartX) / 2;
                const midY = (fromY + toY) / 2;

                // Format duration label
                let durationLabel: string;
                if (daysBetween < 1) {
                  durationLabel = '<1j';
                } else if (daysBetween < 30) {
                  durationLabel = `${daysBetween}j`;
                } else if (daysBetween < 365) {
                  const months = Math.round(daysBetween / 30);
                  durationLabel = `${months}m`;
                } else {
                  const years = (daysBetween / 365).toFixed(1);
                  durationLabel = `${years}a`;
                }

                const tooltip = `${t('timeline.potentialCausality')}\n${conn.fromItem.label}\n→ ${conn.toItem.label}\n${t('timeline.daysAfter', { count: daysBetween })}`;

                return (
                  <g key={idx} className="cursor-help causal-connection" style={{ pointerEvents: 'auto' }}>
                    {/* Invisible wider path for easier hover */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="16"
                    >
                      <title>{tooltip}</title>
                    </path>
                    {/* Glow effect path */}
                    <path
                      d={path}
                      fill="none"
                      style={{ stroke: CAUSAL_COLORS[colorCategory] }}
                      strokeWidth="4"
                      strokeOpacity="0.2"
                      filter="url(#causal-glow)"
                    />
                    {/* Main visible path */}
                    <path
                      d={path}
                      fill="none"
                      style={{ stroke: CAUSAL_COLORS[colorCategory] }}
                      strokeOpacity="0.6"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      markerEnd={`url(#causal-arrow-${colorCategory})`}
                      className="transition-opacity"
                    >
                      <title>{tooltip}</title>
                    </path>
                    {/* Duration label group with tooltip */}
                    <g className="cursor-help">
                      <title>{tooltip}</title>
                      <rect
                        x={midX - 14}
                        y={midY - 8}
                        width="28"
                        height="16"
                        rx="3"
                        style={{ fill: 'var(--color-bg-primary)', stroke: CAUSAL_COLORS[colorCategory] }}
                        fillOpacity="0.9"
                        strokeWidth="1"
                        strokeOpacity="0.5"
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="500"
                        style={{ fill: CAUSAL_COLORS[colorCategory], pointerEvents: 'none' }}
                      >
                        {durationLabel}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Grid lines - rendered on top of items with pointer-events-none */}
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {axisLabels.map((label, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 will-change-transform ${
                  label.isMain
                    ? 'w-px bg-text-tertiary/40'
                    : 'w-px bg-text-tertiary/20'
                }`}
                style={{ transform: `translate3d(${label.x}px, 0, 0)` }}
              />
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// Thumbnail component showing element image or shape with color
function ItemThumbnail({ imageUrl, shape, color, letter, blur, size }: {
  imageUrl?: string;
  shape: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  color: string;
  letter: string;
  blur?: boolean;
  size?: number; // Custom size in pixels
}) {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  // If we have an image, show it (blurred if hideMedia)
  if (imageUrl) {
    return (
      <div
        className={`${size ? '' : 'w-7 h-7'} rounded shrink-0 bg-cover bg-center border border-border-default overflow-hidden`}
        style={{
          ...sizeStyle,
          backgroundImage: `url(${imageUrl})`,
          filter: blur ? 'blur(8px)' : undefined,
        }}
      />
    );
  }

  // Otherwise show shape with letter
  const baseClasses = `${size ? '' : 'w-6 h-6'} flex items-center justify-center font-bold text-white shrink-0 border border-white/30`;
  const fontSize = size ? Math.max(10, size * 0.35) : 10;

  const shapeClasses: Record<string, string> = {
    circle: 'rounded-full',
    square: 'rounded-sm',
    diamond: 'rounded-sm rotate-45',
    rectangle: 'rounded-sm',
    hexagon: 'sketchy-hexagon',
  };

  return (
    <div
      className={`${baseClasses} ${shapeClasses[shape] || 'rounded-full'}`}
      style={{
        ...sizeStyle,
        backgroundColor: color,
        fontSize: `${fontSize}px`,
      }}
    >
      <span className={shape === 'diamond' ? '-rotate-45' : ''}>
        {letter}
      </span>
    </div>
  );
}

function exportTimelineToCSV(items: TimelineItem[], filename: string): void {
  const typeLabels: Record<string, string> = { link: 'lien', event: 'evenement', property: 'propriete', created: 'ajout' };
  const formatDate = (d: Date) => toLocalDateKey(d);

  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());

  const header = 'date_debut,date_fin,type,label,sublabel,couleur';
  const rows = sorted.map(item => [
    formatDate(item.start),
    item.end ? formatDate(item.end) : '',
    typeLabels[item.type] || item.type,
    escapeCsvField(item.label),
    escapeCsvField((item.sublabel || '').replace(/\n/g, ' | ')),
    item.color,
  ].join(','));

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
  emitExport('timeline-csv');
}

/** Gap between two causally linked events: short, medium, long */
const CAUSAL_COLORS = {
  short: 'var(--color-success)',
  medium: 'var(--color-warning)',
  long: 'var(--color-error)',
} as const;

const accentShade = (percent: number) => `color-mix(in srgb, var(--color-accent) ${percent}%, transparent)`;

function getDensityColor(count: number, max: number): string {
  if (count === 0) return accentShade(4);
  const ratio = count / max;
  if (ratio < 0.2) return accentShade(15);
  if (ratio < 0.4) return accentShade(30);
  if (ratio < 0.6) return accentShade(50);
  if (ratio < 0.8) return accentShade(70);
  return accentShade(90);
}
