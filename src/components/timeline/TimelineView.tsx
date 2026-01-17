import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useInvestigationStore, useSelectionStore, useUIStore } from '../../stores';
import { Calendar, ArrowUpDown, ZoomIn, ZoomOut } from 'lucide-react';
import { fileService } from '../../services/fileService';
import { ViewToolbar } from '../common/ViewToolbar';

interface TimelineItem {
  id: string;
  label: string;
  sublabel?: string;
  start: Date;
  end?: Date;
  color: string;
  type: 'link' | 'event' | 'property';
  sourceId?: string; // For selection
  // Thumbnail info from source element
  thumbLetter: string;
  thumbColor: string;
  thumbShape: 'circle' | 'square' | 'diamond' | 'rectangle' | 'hexagon';
  thumbImageId?: string; // AssetId for image thumbnail
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
  { label: '1 an', zoom: 0.8 },    // ~3 years visible
  { label: '6 mois', zoom: 1.5 },  // ~1.5 years visible
  { label: '1 mois', zoom: 8 },    // ~3 months visible
  { label: '1 sem.', zoom: 30 },   // ~3 weeks visible
] as const;

export function TimelineView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { elements, links } = useInvestigationStore();
  const { selectElement, selectLink, selectedElementIds, selectedLinkIds } = useSelectionStore();
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);

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

  // Build timeline items from links and element events
  const { items, timeBounds } = useMemo(() => {
    const itemsList: TimelineItem[] = [];
    const now = new Date();
    let minTime = Infinity;
    let maxTime = -Infinity;

    // 1. Process links with dateRange
    links.forEach((link) => {
      if (!link.dateRange?.start) return;

      const fromElement = elements.find(el => el.id === link.fromId);
      const toElement = elements.find(el => el.id === link.toId);
      if (!fromElement || !toElement) return;

      const startDate = new Date(link.dateRange.start);
      const endDate = link.dateRange.end ? new Date(link.dateRange.end) : now;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      if (startTime < minTime) minTime = startTime;
      if (endTime > maxTime) maxTime = endTime;

      const fromLabel = fromElement.label || 'Sans nom';
      const toLabel = toElement.label || 'Sans nom';
      const linkLabel = link.label || 'relation';

      itemsList.push({
        id: `link-${link.id}`,
        label: `${fromLabel} → ${linkLabel} → ${toLabel}`,
        sublabel: undefined,
        start: startDate,
        end: endDate,
        color: link.visual.color || '#6b7280',
        type: 'link',
        sourceId: link.id,
        thumbLetter: fromLabel.charAt(0).toUpperCase(),
        thumbColor: fromElement.visual.color,
        thumbShape: fromElement.visual.shape || 'circle',
        thumbImageId: fromElement.assetIds?.[0] || undefined,
      });
    });

    // 2. Process element events
    elements.forEach((element) => {
      if (!element.events || element.events.length === 0) return;

      element.events.forEach((event, index) => {
        if (!event.date) return;

        const eventDate = new Date(event.date);
        if (isNaN(eventDate.getTime())) return;

        const eventTime = eventDate.getTime();
        if (eventTime < minTime) minTime = eventTime;
        if (eventTime > maxTime) maxTime = eventTime;

        const hasEnd = event.dateEnd && !isNaN(new Date(event.dateEnd).getTime());
        const endDate = hasEnd ? new Date(event.dateEnd!) : undefined;

        if (endDate) {
          const endTime = endDate.getTime();
          if (endTime > maxTime) maxTime = endTime;
        }

        const elementLabel = element.label || 'Sans nom';
        const eventLabel = event.label || 'Événement';

        itemsList.push({
          id: `ev-${element.id}-${index}`,
          label: `${elementLabel}: ${eventLabel}`,
          start: eventDate,
          end: endDate,
          color: element.visual.color,
          type: 'event',
          sourceId: element.id,
          thumbLetter: elementLabel.charAt(0).toUpperCase(),
          thumbColor: element.visual.color,
          thumbShape: element.visual.shape || 'circle',
          thumbImageId: element.assetIds?.[0] || undefined,
        });
      });
    });

    // 3. Process element properties with type "date"
    elements.forEach((element) => {
      if (!element.properties || element.properties.length === 0) return;

      element.properties.forEach((prop, index) => {
        if (prop.type !== 'date' || !prop.value) return;

        // Parse the date value
        const propDate = prop.value instanceof Date ? prop.value : new Date(String(prop.value));
        if (isNaN(propDate.getTime())) return;

        const propTime = propDate.getTime();
        if (propTime < minTime) minTime = propTime;
        if (propTime > maxTime) maxTime = propTime;

        const elementLabel = element.label || 'Sans nom';

        itemsList.push({
          id: `prop-${element.id}-${index}`,
          label: `${elementLabel}: ${prop.key}`,
          start: propDate,
          end: undefined, // Properties are point-in-time
          color: element.visual.color,
          type: 'property',
          sourceId: element.id,
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
  }, [elements, links]);

  // Load thumbnails for items with images
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadThumbnails = async () => {
      const imageIds = [...new Set(items.filter(i => i.thumbImageId).map(i => i.thumbImageId!))];
      if (imageIds.length === 0) return;

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

  // Each item gets its own row for clarity
  // Sort order: oldest at top by default, or newest at top if newestFirst
  const itemsWithRows = useMemo(() => {
    const sortedItems = newestFirst ? [...items].reverse() : items;
    return sortedItems.map((item, index) => ({ ...item, row: index }));
  }, [items, newestFirst]);

  const totalRows = items.length || 1;

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

    const msPerDay = 24 * 60 * 60 * 1000;
    const daysVisible = (viewEnd.getTime() - viewStart.getTime()) / msPerDay;

    let step: 'day' | 'week' | 'month' | 'year';
    let format: Intl.DateTimeFormatOptions;

    if (daysVisible < 60) {
      step = 'day';
      format = { day: 'numeric', month: 'short' };
    } else if (daysVisible < 365) {
      step = 'month';
      format = { month: 'short', year: 'numeric' };
    } else {
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
    } else {
      current.setHours(0, 0, 0, 0);
    }

    while (current <= viewEnd) {
      const x = dateToX(current);
      if (x >= -50 && x <= containerWidth + 50) {
        const isMain = step === 'year' ||
                       (step === 'month' && current.getMonth() === 0) ||
                       (step === 'day' && current.getDate() === 1);
        labels.push({
          x,
          label: current.toLocaleDateString('fr-FR', format),
          isMain,
        });
      }

      // Increment
      if (step === 'year') {
        current.setFullYear(current.getFullYear() + 1);
      } else if (step === 'month') {
        current.setMonth(current.getMonth() + 1);
      } else {
        current.setDate(current.getDate() + 7); // Weekly for days
      }
    }

    return labels;
  }, [viewStart, zoom, dateToX, xToDate, getContainerWidth]);

  // Today marker position
  const todayX = useMemo(() => dateToX(new Date()), [dateToX]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const dateAtMouse = xToDate(mouseX);

    const zoomFactor = e.deltaY > 0 ? 0.8 : 1.25;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));

    // Adjust viewStart to keep mouse position stable
    const newDaysFromStart = mouseX / newZoom;
    const newViewStart = new Date(dateAtMouse.getTime() - newDaysFromStart * 24 * 60 * 60 * 1000);

    setZoom(newZoom);
    setViewStart(newViewStart);
  }, [zoom, xToDate]);

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
    setViewStart(newViewStart);
  }, [isDragging, dragStartX, dragStartView, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle item click
  const handleItemClick = useCallback((item: TimelineItem, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Cleanup mouse events
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
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
        <p className="text-sm text-text-secondary">Aucune donnee temporelle</p>
        <p className="text-xs text-text-tertiary mt-2 text-center max-w-sm px-4">
          Pour voir des elements sur la timeline :<br/>
          - Ajoutez une <b>periode</b> aux liens (date debut/fin)<br/>
          - Ajoutez des <b>evenements</b> dans l'historique des elements
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
              {items.length} evenement{items.length > 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-text-tertiary hidden sm:inline">
              Ctrl+molette: zoom | Glisser: deplacer
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
                    key={preset.label}
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
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <button onClick={handleZoomOut} className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded" title="Zoom arriere">
              <ZoomOut size={16} />
            </button>
            <button onClick={handleZoomIn} className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded" title="Zoom avant">
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button onClick={handleToday} className="px-2 h-6 text-[10px] text-text-secondary hover:bg-bg-tertiary rounded border border-border-default" title="Centrer sur aujourd'hui">Auj.</button>
            <button onClick={handleFitAll} className="px-2 h-6 text-[10px] text-text-secondary hover:bg-bg-tertiary rounded border border-border-default" title="Voir tout">Tout</button>
            <div className="w-px h-4 bg-border-default mx-1" />
            <button
              onClick={() => setNewestFirst(!newestFirst)}
              className={`px-2 h-6 text-[10px] rounded border flex items-center gap-1 ${
                newestFirst
                  ? 'bg-accent text-white border-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary border-border-default'
              }`}
              title={newestFirst ? 'Plus recent en haut' : 'Plus ancien en haut'}
            >
              <ArrowUpDown size={10} />
              {newestFirst ? 'Recent ↑' : 'Ancien ↑'}
            </button>
          </>
        }
      />

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Time axis */}
        <div className="absolute top-0 left-0 right-0 h-7 bg-bg-primary border-b border-border-default z-10">
          {axisLabels.map((label, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-end pb-1"
              style={{ left: label.x }}
            >
              <span className={`text-[10px] whitespace-nowrap ${label.isMain ? 'text-text-primary font-medium' : 'text-text-tertiary'}`}>
                {label.label}
              </span>
              <div
                className={`absolute bottom-0 w-px h-2 ${label.isMain ? 'bg-border-strong' : 'bg-border-default'}`}
                style={{ left: 0 }}
              />
            </div>
          ))}
        </div>

        {/* Content area */}
        <div
          ref={contentRef}
          className="absolute left-0 right-0 bg-bg-secondary"
          style={{ top: AXIS_HEIGHT, height: contentHeight }}
        >
          {/* Grid lines */}
          {axisLabels.filter(l => l.isMain).map((label, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-border-default opacity-30"
              style={{ left: label.x }}
            />
          ))}

          {/* Today marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
            style={{ left: todayX }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
          </div>

          {/* Items */}
          {itemsWithRows.map((item) => {
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
                  className={`absolute cursor-pointer transition-shadow ${
                    selected ? 'ring-2 ring-accent ring-offset-1' : ''
                  }`}
                  style={{
                    left: x,
                    top: y,
                    width: ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                  onClick={(e) => handleItemClick(item, e)}
                  title={anonymousMode ? '' : `${item.label}${item.sublabel ? ` (${item.sublabel})` : ''}\n${formatDateRange(item.start, item.end)}`}
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
                </div>
              );
            }

            // Range items (links, events with duration)
            return (
              <div
                key={item.id}
                className={`absolute rounded cursor-pointer transition-shadow ${
                  selected ? 'ring-2 ring-accent ring-offset-1' : ''
                }`}
                style={{
                  left: x,
                  top: y,
                  width: width,
                  height: ROW_HEIGHT,
                  backgroundColor: `${item.color}25`,
                  borderLeft: `3px solid ${item.color}`,
                  borderRadius: '2px',
                }}
                onClick={(e) => handleItemClick(item, e)}
                title={anonymousMode ? '' : `${item.label}${item.sublabel ? ` (${item.sublabel})` : ''}\n${formatDateRange(item.start, item.end)}`}
              >
                <div
                  className="h-full flex items-center overflow-hidden gap-2 pr-2"
                  style={{ paddingLeft: contentOffset + 6 }}
                >
                  {/* Thumbnail - image or shape (blur images if hideMedia enabled) */}
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
                    <span className="text-xs text-text-primary truncate font-medium">
                      {item.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
    hexagon: 'rounded-sm',
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

function formatDateRange(start: Date, end?: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const startStr = start.toLocaleDateString('fr-FR', opts);
  if (!end) return startStr;
  const endStr = end.toLocaleDateString('fr-FR', opts);
  return `${startStr} → ${endStr}`;
}
