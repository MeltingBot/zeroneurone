import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInvestigationStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore } from '../../stores';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { Calendar, ArrowUpDown, ZoomIn, ZoomOut, GitBranch, Filter } from 'lucide-react';
import { fileService } from '../../services/fileService';
import { ViewToolbar } from '../common/ViewToolbar';
import { toPng } from 'html-to-image';
import { TimelineRangeSlider } from './TimelineRangeSlider';

interface TimelineItem {
  id: string;
  label: string;
  sublabel?: string;
  start: Date;
  end?: Date;
  color: string;
  type: 'link' | 'event' | 'property';
  sourceId?: string; // For selection
  isDimmed?: boolean; // For filter dimming
  unresolvedCommentCount?: number; // Number of unresolved comments
  // Thumbnail info from source element
  thumbLetter: string;
  thumbColor: string;
  thumbShape: 'circle' | 'square' | 'diamond' | 'rectangle';
  thumbImageId?: string; // AssetId for image thumbnail
  // Destination thumbnail info (for links)
  destThumbLetter?: string;
  destThumbColor?: string;
  destThumbShape?: 'circle' | 'square' | 'diamond' | 'rectangle';
  destThumbImageId?: string;
}

// Constants
const MIN_ZOOM = 0.1; // pixels per day (allows viewing many years)
const MAX_ZOOM = 50; // pixels per day
const DEFAULT_ZOOM = 5; // pixels per day (better initial view)
const ROW_HEIGHT = 36;
const ROW_GAP = 8;
const AXIS_HEIGHT = 28;

// Zoom presets (pixels per day) with approximate visible range at 800px width
const ZOOM_PRESETS = [
  { labelKey: 'timeline.zoomPreset1Year', zoom: 0.8 },    // ~3 years visible
  { labelKey: 'timeline.zoomPreset6Months', zoom: 1.5 },  // ~1.5 years visible
  { labelKey: 'timeline.zoomPreset1Month', zoom: 8 },    // ~3 months visible
  { labelKey: 'timeline.zoomPreset1Week', zoom: 30 },   // ~3 weeks visible
] as const;

export function TimelineView() {
  const { t, i18n } = useTranslation('pages');
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { elements, links, comments } = useInvestigationStore();
  const { selectElement, selectLink, selectedElementIds, selectedLinkIds } = useSelectionStore();
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
  const showCommentBadges = useUIStore((state) => state.showCommentBadges);
  const registerCaptureHandler = useUIStore((state) => state.registerCaptureHandler);
  const unregisterCaptureHandler = useUIStore((state) => state.unregisterCaptureHandler);
  const { filters, hiddenElementIds, focusElementId, focusDepth } = useViewStore();
  const { highlightedElementIds: insightsHighlightedIds } = useInsightsStore();

  // Calculate dimmed element IDs based on filters, focus, and insights highlighting
  const dimmedElementIds = useMemo(() => {
    // If insights highlighting is active, dim everything except highlighted elements
    if (insightsHighlightedIds.size > 0) {
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!insightsHighlightedIds.has(el.id)) {
          dimmed.add(el.id);
        }
      });
      return dimmed;
    }

    // If in focus mode, dim everything except focus element and neighbors
    if (focusElementId) {
      const visibleIds = getNeighborIds(focusElementId, links, focusDepth);
      const dimmed = new Set<string>();
      elements.forEach((el) => {
        if (!visibleIds.has(el.id)) {
          dimmed.add(el.id);
        }
      });
      return dimmed;
    }

    // Otherwise use filter-based dimming
    return getDimmedElementIds(elements, filters, hiddenElementIds);
  }, [elements, links, filters, hiddenElementIds, focusElementId, focusDepth, insightsHighlightedIds]);

  // View state
  const [zoom, setZoom] = useState(DEFAULT_ZOOM); // pixels per day
  const [viewStart, setViewStart] = useState<Date>(() => {
    // Center on today: show ~80 days before today (at default zoom ~400px width)
    const d = new Date();
    d.setDate(d.getDate() - 80);
    return d;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartView, setDragStartView] = useState<Date>(new Date());
  const [newestFirst, setNewestFirst] = useState(false); // false = oldest at top (default)
  const [showCausality, setShowCausality] = useState(false); // Show potential causal links
  const [causalityMaxDays, setCausalityMaxDays] = useState(365); // Max days between events for causality
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null); // Show info panel on click

  // Temporal filter state
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

    // 1. Process links with dateRange
    links.forEach((link) => {
      if (!link.dateRange?.start) return;

      const fromElement = elements.find(el => el.id === link.fromId);
      const toElement = elements.find(el => el.id === link.toId);
      if (!fromElement || !toElement) return;

      // Skip if either element is hidden
      if (hiddenElementIds.has(fromElement.id) || hiddenElementIds.has(toElement.id)) return;

      const startDate = new Date(link.dateRange.start);
      const endDate = link.dateRange.end ? new Date(link.dateRange.end) : now;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      if (startTime < minTime) minTime = startTime;
      if (endTime > maxTime) maxTime = endTime;

      const fromLabel = fromElement.label || t('timeline.unnamed');
      const toLabel = toElement.label || t('timeline.unnamed');
      const linkLabel = link.label || t('timeline.relation');

      // Check if link should be dimmed (either connected element is dimmed)
      const isLinkDimmed = dimmedElementIds.has(fromElement.id) || dimmedElementIds.has(toElement.id);

      itemsList.push({
        id: `link-${link.id}`,
        label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
        sublabel: undefined,
        start: startDate,
        end: endDate,
        color: link.visual.color || '#6b7280',
        type: 'link',
        sourceId: link.id,
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
      // Skip hidden elements
      if (hiddenElementIds.has(element.id)) return;
      if (!element.events || element.events.length === 0) return;

      const isElementDimmed = dimmedElementIds.has(element.id);

      element.events.forEach((event, index) => {
        if (!event.date) return;

        const eventDate = new Date(event.date);
        if (isNaN(eventDate.getTime())) return;

        const eventTime = eventDate.getTime();
        if (eventTime < minTime) minTime = eventTime;
        if (eventTime > maxTime) maxTime = eventTime;

        const hasEnd = event.dateEnd && !isNaN(new Date(event.dateEnd).getTime());
        // If no end date, extend to today (ongoing event)
        const endDate = hasEnd ? new Date(event.dateEnd!) : now;

        const endTime = endDate.getTime();
        if (endTime > maxTime) maxTime = endTime;

        const elementLabel = element.label || t('timeline.unnamed');
        const eventLabel = event.label || '';
        const isDefaultName = element.label === t('timeline.newElement') || !element.label;

        // Format event properties as sublabel
        let eventSublabel: string | undefined;
        if (event.properties && event.properties.length > 0) {
          eventSublabel = event.properties
            .filter((p) => p.value !== null && p.value !== undefined && p.value !== '')
            .map((p) => `${p.key}: ${String(p.value)}`)
            .join(' | ');
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
          color: element.visual.color,
          type: 'event',
          sourceId: element.id,
          isDimmed: isElementDimmed,
          unresolvedCommentCount: getUnresolvedCommentCount(element.id, 'element'),
          thumbLetter: elementLabel.charAt(0).toUpperCase(),
          thumbColor: element.visual.color,
          thumbShape: element.visual.shape || 'circle',
          thumbImageId: element.assetIds?.[0] || undefined,
        });
      });
    });

    // 3. Process element properties with type "date"
    elements.forEach((element) => {
      // Skip hidden elements
      if (hiddenElementIds.has(element.id)) return;
      if (!element.properties || element.properties.length === 0) return;

      const isElementDimmed = dimmedElementIds.has(element.id);

      element.properties.forEach((prop, index) => {
        if (prop.type !== 'date' || !prop.value) return;

        // Parse the date value
        const propDate = prop.value instanceof Date ? prop.value : new Date(String(prop.value));
        if (isNaN(propDate.getTime())) return;

        const propTime = propDate.getTime();
        if (propTime < minTime) minTime = propTime;
        if (propTime > maxTime) maxTime = propTime;

        const elementLabel = element.label || t('timeline.unnamed');

        itemsList.push({
          id: `prop-${element.id}-${index}`,
          label: `${elementLabel}: ${prop.key}`,
          start: propDate,
          end: undefined, // Properties are point-in-time
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
      });
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
  }, [elements, links, comments, hiddenElementIds, dimmedElementIds]);

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
        } catch (e) {
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

  // Each item gets its own row for clarity
  // Sort order: oldest at top by default, or newest at top if newestFirst
  const itemsWithRows = useMemo(() => {
    const sortedItems = newestFirst ? [...filteredItems].reverse() : filteredItems;
    return sortedItems.map((item, index) => ({ ...item, row: index }));
  }, [filteredItems, newestFirst]);

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

  // Compute potential causal connections between visible events of linked elements
  const causalConnections = useMemo(() => {
    if (!showCausality) return [];
    // Only compute for visible items to avoid O(n²) on full dataset
    if (visibleItems.length > 500) return []; // Too many to compute

    const connections: Array<{
      fromItem: typeof visibleItems[0];
      toItem: typeof visibleItems[0];
    }> = [];

    // Build a set of linked element pairs for quick lookup
    const linkedPairs = new Set<string>();
    links.forEach((link) => {
      linkedPairs.add(`${link.fromId}|${link.toId}`);
      linkedPairs.add(`${link.toId}|${link.fromId}`);
    });

    for (let i = 0; i < visibleItems.length; i++) {
      for (let j = i + 1; j < visibleItems.length; j++) {
        const itemA = visibleItems[i];
        const itemB = visibleItems[j];

        if (itemA.sourceId === itemB.sourceId) continue;
        if (!itemA.sourceId || !itemB.sourceId) continue;
        if (!linkedPairs.has(`${itemA.sourceId}|${itemB.sourceId}`)) continue;

        const aEnd = itemA.end || itemA.start;
        const bStart = itemB.start;
        const bEnd = itemB.end || itemB.start;
        const aStart = itemA.start;

        // Check A→B
        if (aEnd.getTime() <= bStart.getTime()) {
          const daysDiff = (bStart.getTime() - aEnd.getTime()) / (24 * 60 * 60 * 1000);
          if (daysDiff <= causalityMaxDays) {
            connections.push({ fromItem: itemA, toItem: itemB });
          }
        }
        // Check B→A
        else if (bEnd.getTime() <= aStart.getTime()) {
          const daysDiff = (aStart.getTime() - bEnd.getTime()) / (24 * 60 * 60 * 1000);
          if (daysDiff <= causalityMaxDays) {
            connections.push({ fromItem: itemB, toItem: itemA });
          }
        }
      }
    }

    return connections;
  }, [showCausality, visibleItems, links, causalityMaxDays]);

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

    let step: 'day' | 'week' | 'month' | 'year';
    let format: Intl.DateTimeFormatOptions;

    // Pixel-based step selection for smooth transitions
    // Choose smallest time unit that gives adequate label spacing
    const MIN_LABEL_SPACING = 35; // minimum pixels between labels

    const daySpacing = zoom; // pixels per day
    const weekSpacing = zoom * 7; // pixels per week
    const monthSpacing = zoom * 30; // pixels per month (approx)

    if (daySpacing >= MIN_LABEL_SPACING) {
      // Enough space for daily labels
      step = 'day';
      format = { day: 'numeric', month: 'short' };
    } else if (weekSpacing >= MIN_LABEL_SPACING) {
      // Enough space for weekly labels
      step = 'week';
      format = { day: 'numeric', month: 'short' };
    } else if (monthSpacing >= MIN_LABEL_SPACING) {
      // Enough space for monthly labels
      step = 'month';
      format = { month: 'short', year: 'numeric' };
    } else {
      // Fall back to yearly
      step = 'year';
      format = { year: 'numeric' };
    }

    const current = new Date(viewStart);

    // Align to step boundary
    if (step === 'year') {
      current.setMonth(0, 1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'month') {
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    } else if (step === 'week') {
      // Align to Monday
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
        const isMain = step === 'year' ||
                       (step === 'month' && current.getMonth() === 0) ||
                       (step === 'week' && current.getDate() <= 7) ||
                       (step === 'day' && (current.getDate() === 1 || current.getDay() === 1)); // 1st of month or Monday
        labels.push({
          x,
          label: current.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', format),
          isMain,
        });
      }

      // Increment
      if (step === 'year') {
        current.setFullYear(current.getFullYear() + 1);
      } else if (step === 'month') {
        current.setMonth(current.getMonth() + 1);
      } else if (step === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setDate(current.getDate() + 1); // Daily
      }
    }

    return labels;
  }, [viewStart, zoom, dateToX, xToDate, getContainerWidth, i18n.language]);

  // Today marker position
  const todayX = useMemo(() => dateToX(new Date()), [dateToX]);

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
    // Toggle info panel
    setExpandedItemId(prev => prev === item.id ? null : item.id);
    // Also select the element/link
    if (item.type === 'link' && item.sourceId) {
      selectLink(item.sourceId);
    } else if ((item.type === 'event' || item.type === 'property') && item.sourceId) {
      selectElement(item.sourceId);
    }
  }, [selectElement, selectLink]);

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

  // Center on today at mount
  useEffect(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth || 800;
    const daysVisible = containerWidth / zoom;
    const now = new Date();
    setViewStart(new Date(now.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000));
  }, []); // Only on mount

  // Check if item is selected
  const isSelected = useCallback((item: TimelineItem): boolean => {
    if (item.type === 'link' && item.sourceId) {
      return selectedLinkIds.has(item.sourceId);
    } else if ((item.type === 'event' || item.type === 'property') && item.sourceId) {
      return selectedElementIds.has(item.sourceId);
    }
    return false;
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
        showFontToggle
        leftContent={
          <>
            <span className="text-xs text-text-secondary">
              {filterStartDate || filterEndDate
                ? t('timeline.filteredEventsCount', { filtered: filteredItems.length, total: items.length })
                : t('timeline.eventsCount', { count: items.length })
              }
            </span>
            <span className="text-[10px] text-text-tertiary hidden sm:inline">
              {t('timeline.zoomHint')}
            </span>
          </>
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
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => setShowCausality(!showCausality)}
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

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-hidden overflow-y-auto relative select-none"
        data-report-capture="timeline"
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={() => setExpandedItemId(null)}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Time axis - sticky to stay visible when scrolling */}
        <div className="sticky top-0 left-0 right-0 h-7 bg-bg-primary border-b border-border-default z-10 overflow-hidden">
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

        {/* Content area */}
        <div
          ref={contentRef}
          className="relative bg-bg-secondary"
          style={{ height: contentHeight }}
        >
          {/* Today marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 will-change-transform"
            style={{ transform: `translate3d(${todayX}px, 0, 0)` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
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
                    opacity: item.isDimmed ? 0.3 : 1,
                  }}
                  onClick={(e) => handleItemClick(item, e)}
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
                  {/* Comment indicator */}
                  {showCommentBadges && item.unresolvedCommentCount !== undefined && item.unresolvedCommentCount > 0 && (
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm z-10"
                      title={t('timeline.unresolvedComments', { count: item.unresolvedCommentCount })}
                    >
                      {item.unresolvedCommentCount}
                    </div>
                  )}
                </div>
              );
            }

            // Range items (links, events with duration)
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
                  opacity: item.isDimmed ? 0.3 : 1,
                }}
                onClick={(e) => handleItemClick(item, e)}
              >
                {/* Period bar with clear border frame */}
                <div
                  className="absolute inset-0 rounded"
                  style={{
                    backgroundColor: `${item.color}25`,
                    border: selected ? 'none' : `1.5px solid ${item.color}`,
                    boxShadow: selected ? undefined : `inset 0 0 0 1px ${item.color}30`,
                  }}
                />
                {/* Comment indicator */}
                {showCommentBadges && item.unresolvedCommentCount !== undefined && item.unresolvedCommentCount > 0 && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm z-10"
                    title={t('timeline.unresolvedComments', { count: item.unresolvedCommentCount })}
                  >
                    {item.unresolvedCommentCount}
                  </div>
                )}
                {/* Content */}
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
                      {item.sublabel && (
                        <span className="text-[10px] text-text-tertiary truncate">
                          {item.sublabel}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Destination thumbnail for links */}
                  {item.type === 'link' && item.destThumbLetter && (
                    <ItemThumbnail
                      imageUrl={item.destThumbImageId ? thumbnails[item.destThumbImageId] : undefined}
                      shape={item.destThumbShape || 'circle'}
                      color={item.destThumbColor || '#6b7280'}
                      letter={anonymousMode ? '?' : item.destThumbLetter}
                      blur={hideMedia}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Info panel for clicked item */}
          {expandedItemId && (() => {
            const expandedItem = visibleItems.find(i => i.id === expandedItemId);
            if (!expandedItem) return null;
            const x = Math.max(8, dateToX(expandedItem.start));
            const itemY = ROW_GAP + expandedItem.row * (ROW_HEIGHT + ROW_GAP);

            // Estimate panel height (title + sublabel + date + padding)
            const panelHeight = 80;

            // Calculate position below the item
            const yBelow = itemY + ROW_HEIGHT + 4;

            // Check if panel would be cut off at bottom
            // Compare with visible viewport (scrollTop + containerHeight - AXIS_HEIGHT)
            const visibleBottom = scrollTop + containerHeight - AXIS_HEIGHT;
            const wouldBeClipped = (yBelow + panelHeight) > visibleBottom;

            // If clipped, show above the item instead
            const y = wouldBeClipped ? itemY - panelHeight - 4 : yBelow;

            return (
              <div
                className="absolute z-30 bg-bg-primary border border-border-default rounded shadow-lg p-2 max-w-xs"
                style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-medium text-text-primary mb-1">
                  {expandedItem.label}
                </div>
                {expandedItem.sublabel && (
                  <div className="text-[10px] text-text-secondary mb-1">
                    {expandedItem.sublabel}
                  </div>
                )}
                <div className="text-[10px] text-text-tertiary">
                  {formatDateRange(expandedItem.start, expandedItem.end, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                </div>
                <button
                  onClick={() => setExpandedItemId(null)}
                  className="absolute top-1 right-1 p-0.5 text-text-tertiary hover:text-text-primary"
                >
                  ✕
                </button>
              </div>
            );
          })()}

          {/* Causal connections - rendered as SVG curves */}
          {showCausality && causalConnections.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none z-5"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* Gradient definitions for different time gaps */}
                <linearGradient id="causal-gradient-short" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="causal-gradient-medium" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="causal-gradient-long" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
                </linearGradient>
                {/* Arrow markers for each color */}
                <marker id="causal-arrow-short" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" fill="#10b981" fillOpacity="0.8" />
                </marker>
                <marker id="causal-arrow-medium" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" fill="#f59e0b" fillOpacity="0.8" />
                </marker>
                <marker id="causal-arrow-long" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,1 L6,4 L0,7 L2,4 Z" fill="#ef4444" fillOpacity="0.7" />
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
              {causalConnections.map((conn, idx) => {
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
                      stroke={`url(#causal-gradient-${colorCategory})`}
                      strokeWidth="4"
                      strokeOpacity="0.2"
                      filter="url(#causal-glow)"
                    />
                    {/* Main visible path */}
                    <path
                      d={path}
                      fill="none"
                      stroke={`url(#causal-gradient-${colorCategory})`}
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
                        fill="white"
                        fillOpacity="0.9"
                        stroke={colorCategory === 'short' ? '#10b981' : colorCategory === 'medium' ? '#f59e0b' : '#ef4444'}
                        strokeWidth="1"
                        strokeOpacity="0.5"
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="500"
                        fill={colorCategory === 'short' ? '#059669' : colorCategory === 'medium' ? '#d97706' : '#dc2626'}
                        style={{ pointerEvents: 'none' }}
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
      </div>
    </div>
  );
}

// Thumbnail component showing element image or shape with color
function ItemThumbnail({ imageUrl, shape, color, letter, blur, size }: {
  imageUrl?: string;
  shape: 'circle' | 'square' | 'diamond' | 'rectangle';
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

function formatDateRange(start: Date, end?: Date, locale: string = 'en-US'): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const startStr = start.toLocaleDateString(locale, opts);
  if (!end) return startStr;
  const endStr = end.toLocaleDateString(locale, opts);
  return `${startStr} → ${endStr}`;
}
