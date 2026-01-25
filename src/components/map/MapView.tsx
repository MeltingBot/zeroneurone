import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useInvestigationStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore } from '../../stores';
import { useHistoryStore } from '../../stores/historyStore';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import { toPng } from 'html-to-image';
import type { Element } from '../../types';
import { MapPin, Clock, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { ViewToolbar } from '../common/ViewToolbar';

// Fix Leaflet default marker icon issue with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Element with geo coordinates (resolved for a specific time)
interface ResolvedGeoElement {
  element: Element;
  geo: { lat: number; lng: number };
  fromEvent: boolean;  // True if position comes from an event
  eventLabel?: string; // Label from event if applicable
}

// Link layer group type (polyline + optional tooltip + arrows)
interface LinkLayer {
  outline: L.Polyline;
  line: L.Polyline;
  arrowStart?: L.Marker;
  arrowEnd?: L.Marker;
}

export function MapView() {
  const { t, i18n } = useTranslation('pages');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const linkLayersRef = useRef<Map<string, LinkLayer>>(new Map());

  // Track clustering state for dynamic link positioning
  const [clusteringVersion, setClusteringVersion] = useState(0);

  // Temporal mode state
  const [temporalMode, setTemporalMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { elements, links, assets, comments, updateElement } = useInvestigationStore();
  const pushAction = useHistoryStore((s) => s.pushAction);
  const { selectedElementIds, selectElement, selectLink, clearSelection } = useSelectionStore();
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

  // Create asset lookup map for thumbnails
  const assetMap = useMemo(() => {
    const map = new Map<string, string | null>();
    assets.forEach((asset) => {
      map.set(asset.id, asset.thumbnailDataUrl);
    });
    return map;
  }, [assets]);

  // Calculate unresolved comment counts per element
  const unresolvedCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) => {
      if (comment.targetType === 'element' && !comment.resolved) {
        counts.set(comment.targetId, (counts.get(comment.targetId) || 0) + 1);
      }
    });
    return counts;
  }, [comments]);

  // Calculate time range and collect all unique event dates for discrete slider
  const { timeRange, eventDates } = useMemo(() => {
    const allDates: Date[] = [];

    elements.forEach((el) => {
      // Only consider elements that have geo (either base geo or events with geo)
      const hasBaseGeo = !!el.geo;
      const hasEventGeo = el.events?.some((e) => e.geo);

      if (hasBaseGeo || hasEventGeo) {
        // Add dates from ALL events (they can use element's base geo if they don't have their own)
        if (el.events && el.events.length > 0) {
          el.events.forEach((event) => {
            // Include event dates if: event has geo OR element has base geo
            if (event.geo || hasBaseGeo) {
              if (event.date) allDates.push(new Date(event.date));
              if (event.dateEnd) allDates.push(new Date(event.dateEnd));
            }
          });
        }
        // Add element's own date/dateRange if it has base geo
        if (hasBaseGeo) {
          if (el.date) allDates.push(new Date(el.date));
          if (el.dateRange?.start) allDates.push(new Date(el.dateRange.start));
          if (el.dateRange?.end) allDates.push(new Date(el.dateRange.end));
        }
      }
    });

    // Also consider link dates
    links.forEach((link) => {
      if (link.date) allDates.push(new Date(link.date));
      if (link.dateRange?.start) allDates.push(new Date(link.dateRange.start));
      if (link.dateRange?.end) allDates.push(new Date(link.dateRange.end));
    });

    if (allDates.length === 0) return { timeRange: null, eventDates: [] };

    // Get unique dates sorted chronologically
    const uniqueTimestamps = [...new Set(allDates.map((d) => d.getTime()))].sort((a, b) => a - b);
    const sortedDates = uniqueTimestamps.map((t) => new Date(t));

    return {
      timeRange: {
        min: sortedDates[0],
        max: sortedDates[sortedDates.length - 1],
      },
      eventDates: sortedDates,
    };
  }, [elements, links]);

  // Get position for an element at a specific time
  const getPositionAtTime = useCallback(
    (element: Element, date: Date | null): { geo: { lat: number; lng: number }; label?: string } | null => {
      // If no temporal mode or no date, show element at most recent position
      if (!date || !temporalMode) {
        // Get events with geo coordinates, sorted by date (most recent last)
        const geoEvents = (element.events || [])
          .filter((e) => e.geo && e.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Use most recent event's geo if available
        if (geoEvents.length > 0) {
          const mostRecent = geoEvents[geoEvents.length - 1];
          return { geo: { lat: mostRecent.geo!.lat, lng: mostRecent.geo!.lng }, label: mostRecent.label };
        }

        // Otherwise use element's base geo
        return element.geo ? { geo: element.geo } : null;
      }

      const targetTime = date.getTime();
      const hasBaseGeo = !!element.geo;

      // Get ALL events with dates (sorted by date)
      const datedEvents = (element.events || [])
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (datedEvents.length > 0) {
        // Element is visible FROM its first event onwards (not before)
        // Once it appears, it stays visible to maintain timeline coherence
        const firstEvent = datedEvents[0];
        const firstEventStart = new Date(firstEvent.date).getTime();

        // Before first event: element doesn't exist yet
        if (targetTime < firstEventStart) {
          return null;
        }

        // Find the most recent event that started before or at targetTime
        let activeEvent = firstEvent;
        for (const event of datedEvents) {
          const eventStart = new Date(event.date).getTime();
          if (eventStart <= targetTime) {
            activeEvent = event;
          } else {
            break; // Events are sorted, no need to continue
          }
        }

        // Use active event's geo if available, otherwise element's base geo
        const eventGeo = activeEvent.geo || element.geo;
        if (eventGeo) {
          return { geo: { lat: eventGeo.lat, lng: eventGeo.lng }, label: activeEvent.label };
        }
        return null;
      }

      // Element has no dated events - check if element has base geo with temporal data
      if (hasBaseGeo) {
        // If element has a dateRange, check if selected date is within it
        if (element.dateRange?.start) {
          const elStart = new Date(element.dateRange.start).getTime();
          const elEnd = element.dateRange.end
            ? new Date(element.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1 // End of day
            : Infinity;

          if (targetTime < elStart || targetTime > elEnd) {
            return null; // Element not active at this time
          }
        }
        // If element has only a single date (no range), check if it matches
        else if (element.date) {
          const elDate = new Date(element.date);
          const elStart = elDate.getTime();
          const elEnd = elStart + 24 * 60 * 60 * 1000 - 1; // Same day (end of day)

          if (targetTime < elStart || targetTime > elEnd) {
            return null; // Element not active at this time
          }
        }
        // No temporal data on element - always show
        return { geo: element.geo };
      }

      return null;
    },
    [temporalMode]
  );

  // Get any geo position for an element (for link-pulled visibility)
  // This returns a position even for future events
  const getAnyGeoPosition = useCallback(
    (element: Element): { geo: { lat: number; lng: number }; label?: string } | null => {
      // Try events with geo first (prefer closest to selected date or first)
      const geoEvents = (element.events || [])
        .filter((e) => e.geo && e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (geoEvents.length > 0) {
        // If in temporal mode with a date, find closest event
        if (temporalMode && selectedDate) {
          const targetTime = selectedDate.getTime();
          let closest = geoEvents[0];
          let closestDiff = Math.abs(new Date(closest.date).getTime() - targetTime);
          for (const event of geoEvents) {
            const diff = Math.abs(new Date(event.date).getTime() - targetTime);
            if (diff < closestDiff) {
              closestDiff = diff;
              closest = event;
            }
          }
          return { geo: { lat: closest.geo!.lat, lng: closest.geo!.lng }, label: closest.label };
        }
        // Otherwise use most recent
        const mostRecent = geoEvents[geoEvents.length - 1];
        return { geo: { lat: mostRecent.geo!.lat, lng: mostRecent.geo!.lng }, label: mostRecent.label };
      }

      // Fall back to base geo
      return element.geo ? { geo: element.geo } : null;
    },
    [temporalMode, selectedDate]
  );

  // Check if a link is active at the selected time
  const isLinkActiveAtTime = useCallback(
    (link: typeof links[0]): boolean => {
      if (!temporalMode || !selectedDate) return true;

      const targetTime = selectedDate.getTime();

      // Check link's own date
      if (link.date) {
        const linkDate = new Date(link.date).getTime();
        const linkEnd = linkDate + 24 * 60 * 60 * 1000 - 1;
        if (targetTime >= linkDate && targetTime <= linkEnd) return true;
      }

      // Check link's dateRange
      if (link.dateRange?.start) {
        const linkStart = new Date(link.dateRange.start).getTime();
        const linkEnd = link.dateRange.end
          ? new Date(link.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1
          : Infinity;
        if (targetTime >= linkStart && targetTime <= linkEnd) return true;
        // If link has dateRange but we're outside it, it's not active
        return false;
      }

      // No temporal data on link = always active
      return true;
    },
    [temporalMode, selectedDate]
  );

  // Calculate visibility windows for each element based on links
  // An element is visible during any link's active period that connects to it
  const elementLinkVisibility = useMemo(() => {
    const visibilityMap = new Map<string, { from: number; until: number }[]>();

    links.forEach((link) => {
      // Get the link's active period
      let linkFrom: number | null = null;
      let linkUntil: number | null = null;

      if (link.date) {
        linkFrom = new Date(link.date).getTime();
        linkUntil = linkFrom + 24 * 60 * 60 * 1000 - 1;
      }
      if (link.dateRange?.start) {
        const rangeStart = new Date(link.dateRange.start).getTime();
        const rangeEnd = link.dateRange.end
          ? new Date(link.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1
          : Infinity;
        // Merge with date if both exist
        if (linkFrom !== null) {
          linkFrom = Math.min(linkFrom, rangeStart);
          linkUntil = Math.max(linkUntil!, rangeEnd);
        } else {
          linkFrom = rangeStart;
          linkUntil = rangeEnd;
        }
      }

      if (linkFrom !== null && linkUntil !== null) {
        // Add visibility window for both connected elements
        [link.fromId, link.toId].forEach((elId) => {
          const existing = visibilityMap.get(elId) || [];
          existing.push({ from: linkFrom!, until: linkUntil! });
          visibilityMap.set(elId, existing);
        });
      }
    });

    return visibilityMap;
  }, [links]);

  // Check if element is visible via any link at a given time
  const isVisibleViaLink = useCallback(
    (elementId: string, targetTime: number): boolean => {
      const windows = elementLinkVisibility.get(elementId);
      if (!windows) return false;
      return windows.some((w) => targetTime >= w.from && targetTime <= w.until);
    },
    [elementLinkVisibility]
  );

  // Get elements with resolved geo positions (considering temporal mode)
  const resolvedGeoElements = useMemo((): ResolvedGeoElement[] => {
    const result: ResolvedGeoElement[] = [];
    const addedIds = new Set<string>();

    if (!temporalMode || !selectedDate) {
      // No temporal mode: show all elements with geo
      elements.forEach((el) => {
        if (hiddenElementIds.has(el.id)) return;
        const position = getPositionAtTime(el, null);
        if (position) {
          result.push({
            element: el,
            geo: position.geo,
            fromEvent: !!position.label,
            eventLabel: position.label,
          });
          addedIds.add(el.id);
        }
      });
      return result;
    }

    const targetTime = selectedDate.getTime();

    // In temporal mode: check each element's visibility
    elements.forEach((el) => {
      if (hiddenElementIds.has(el.id)) return;

      // Check if element is visible via an active link
      const visibleViaActiveLink = isVisibleViaLink(el.id, targetTime);

      // Get element's events
      const datedEvents = (el.events || [])
        .filter((e) => e.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Determine if element is visible based on its own temporal data
      let visibleByOwnData = false;

      if (datedEvents.length > 0) {
        // Element has events - visible from first event onwards
        const firstEventStart = new Date(datedEvents[0].date).getTime();
        if (targetTime >= firstEventStart) {
          visibleByOwnData = true;
        }
      } else if (el.geo) {
        // Element has no events but has base geo - check date/dateRange
        if (el.dateRange?.start) {
          const elStart = new Date(el.dateRange.start).getTime();
          const elEnd = el.dateRange.end
            ? new Date(el.dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1
            : Infinity;
          if (targetTime >= elStart && targetTime <= elEnd) {
            visibleByOwnData = true;
          }
        } else if (el.date) {
          const elStart = new Date(el.date).getTime();
          const elEnd = elStart + 24 * 60 * 60 * 1000 - 1;
          if (targetTime >= elStart && targetTime <= elEnd) {
            visibleByOwnData = true;
          }
        }
        // No temporal data = not visible by own data
      }

      // Element is visible if: visible by own data OR visible via active link
      if (visibleByOwnData || visibleViaActiveLink) {
        const position = getPositionAtTime(el, selectedDate) || getAnyGeoPosition(el);
        if (position) {
          result.push({
            element: el,
            geo: position.geo,
            fromEvent: !!position.label,
            eventLabel: position.label,
          });
          addedIds.add(el.id);
        }
      }
    });

    return result;
  }, [elements, selectedDate, getPositionAtTime, getAnyGeoPosition, hiddenElementIds, temporalMode, isVisibleViaLink]);

  // Legacy geoElements for compatibility (elements with current geo)
  const geoElements = useMemo(() => {
    return resolvedGeoElements.map((r) => ({
      ...r.element,
      geo: r.geo,
    }));
  }, [resolvedGeoElements]);

  // Get geo element IDs for quick lookup
  const geoElementIds = useMemo(() => new Set(geoElements.map(el => el.id)), [geoElements]);

  // Filter links where both elements have geo coordinates AND are active at selected time
  const geoLinks = useMemo(() => {
    return links.filter(link => {
      // Both elements must have geo at the current time
      if (!geoElementIds.has(link.fromId) || !geoElementIds.has(link.toId)) {
        return false;
      }

      // In temporal mode, filter by link's active state
      if (temporalMode && selectedDate) {
        return isLinkActiveAtTime(link);
      }

      return true;
    });
  }, [links, geoElementIds, temporalMode, selectedDate, isLinkActiveAtTime]);

  // Get thumbnail for element
  const getThumbnail = useCallback((element: Element): string | null => {
    const firstAssetId = element.assetIds?.[0];
    if (!firstAssetId) return null;
    return assetMap.get(firstAssetId) ?? null;
  }, [assetMap]);

  // Create custom marker HTML with name and thumbnail
  const createMarkerHtml = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, unresolvedCommentCount?: number): string => {
    const color = element.visual.color || '#f5f5f4';
    const borderColor = element.visual.borderColor || '#a8a29e';
    const thumbnail = getThumbnail(element);
    const label = element.label || t('map.unnamed');
    const truncatedLabel = label.length > 12 ? label.substring(0, 10) + '...' : label;

    // Anonymous mode: show redacted label
    const displayLabel = anonymousMode
      ? '<span style="display:inline-block;background:var(--color-text-primary,#3d3833);border-radius:2px;width:2.5em;height:0.8em;"></span>'
      : truncatedLabel;

    const selectedStyle = isSelected
      ? 'box-shadow: 0 0 0 2px var(--color-accent, #e07a5f), 0 2px 6px rgba(0,0,0,0.3);'
      : 'box-shadow: 0 1px 4px rgba(0,0,0,0.2);';

    // Dimmed style for filtered elements
    const dimmedStyle = isDimmed ? 'opacity: 0.3;' : '';

    // Comment indicator badge (only if showCommentBadges is enabled)
    const commentBadge = showCommentBadges && unresolvedCommentCount && unresolvedCommentCount > 0
      ? `<div style="
          position: absolute;
          top: -4px;
          right: -4px;
          width: 16px;
          height: 16px;
          background-color: #f59e0b;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: bold;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          z-index: 10;
        ">${unresolvedCommentCount}</div>`
      : '';

    if (thumbnail) {
      // Marker with thumbnail - compact card (blur if hideMedia)
      const blurStyle = hideMedia ? 'filter: blur(8px);' : '';
      return `
        <div class="map-marker-card" style="
          position: relative;
          background: var(--color-bg-primary, #ffffff);
          border: 1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};
          border-radius: 4px;
          overflow: visible;
          ${selectedStyle}
          ${dimmedStyle}
          width: 48px;
        ">
          ${commentBadge}
          <div style="
            width: 48px;
            height: 36px;
            background-image: url(${thumbnail});
            background-size: cover;
            background-position: center;
            background-color: var(--color-bg-secondary, #f7f4ef);
            border-radius: 4px 4px 0 0;
            ${blurStyle}
          "></div>
          <div style="
            padding: 2px 3px;
            background: var(--color-bg-primary, #ffffff);
            border-top: 1px solid var(--color-border-default, #e8e3db);
          ">
            <span style="
              font-size: 9px;
              font-weight: 500;
              color: var(--color-text-primary, #3d3833);
              display: block;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${displayLabel}</span>
          </div>
        </div>
      `;
    } else {
      // Marker without thumbnail - small dot with label
      return `
        <div class="map-marker-simple" style="
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          ${dimmedStyle}
        ">
          ${commentBadge}
          <div style="
            width: 16px;
            height: 16px;
            background-color: ${color};
            border: 2px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};
            border-radius: 50%;
            ${selectedStyle}
          "></div>
          <div style="
            background: var(--color-bg-primary, #ffffff);
            border: 1px solid var(--color-border-default, #e8e3db);
            border-radius: 3px;
            padding: 1px 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          ">
            <span style="
              font-size: 9px;
              font-weight: 500;
              color: var(--color-text-primary, #3d3833);
              white-space: nowrap;
            ">${displayLabel}</span>
          </div>
        </div>
      `;
    }
  }, [getThumbnail, anonymousMode, hideMedia, showCommentBadges, t]);

  // Create custom icon
  const createIcon = useCallback((element: Element, isSelected: boolean, isDimmed: boolean, unresolvedCommentCount?: number) => {
    const thumbnail = getThumbnail(element);
    const hasThumb = !!thumbnail;

    return L.divIcon({
      className: 'custom-marker-container',
      html: createMarkerHtml(element, isSelected, isDimmed, unresolvedCommentCount),
      iconSize: hasThumb ? [48, 52] : [60, 36],
      iconAnchor: hasThumb ? [24, 52] : [30, 36],
    });
  }, [createMarkerHtml, getThumbnail]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map centered on France by default
    mapRef.current = L.map(mapContainerRef.current, {
      center: [46.603354, 1.888334], // Center of France
      zoom: 6,
      zoomControl: false, // We'll add custom controls
    });

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Create marker cluster group with custom options
    clusterGroupRef.current = L.markerClusterGroup({
      maxClusterRadius: 50, // Cluster markers within 50px
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        let dimension = 30;

        if (count >= 10) {
          size = 'large';
          dimension = 44;
        } else if (count >= 5) {
          size = 'medium';
          dimension = 36;
        }

        return L.divIcon({
          html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
          className: 'custom-cluster-icon',
          iconSize: [dimension, dimension],
        });
      },
    });
    mapRef.current.addLayer(clusterGroupRef.current);

    // Track clustering changes to update link positions
    clusterGroupRef.current.on('animationend', () => {
      setClusteringVersion(v => v + 1);
    });
    clusterGroupRef.current.on('spiderfied', () => {
      setClusteringVersion(v => v + 1);
    });
    clusterGroupRef.current.on('unspiderfied', () => {
      setClusteringVersion(v => v + 1);
    });

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(mapRef.current);

    // Click on map to clear selection
    mapRef.current.on('click', () => {
      clearSelection();
    });

    // Track zoom level changes to update links
    mapRef.current.on('zoomend', () => {
      setClusteringVersion(v => v + 1);
    });

    return () => {
      if (clusterGroupRef.current) {
        clusterGroupRef.current.clearLayers();
        clusterGroupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
      linkLayersRef.current.clear();
    };
  }, [clearSelection]);

  // Track drag start position for undo/redo
  const dragStartGeoRef = useRef<{ id: string; geo: { lat: number; lng: number } } | null>(null);

  // Update markers when elements change
  useEffect(() => {
    if (!mapRef.current || !clusterGroupRef.current) return;

    const clusterGroup = clusterGroupRef.current;
    const existingMarkers = markersRef.current;
    const currentIds = new Set(geoElements.map((el) => el.id));

    // Remove markers for elements that no longer exist or lost geo
    existingMarkers.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        clusterGroup.removeLayer(marker);
        existingMarkers.delete(id);
      }
    });

    // Add or update markers
    geoElements.forEach((element) => {
      const isSelected = selectedElementIds.has(element.id);
      const isDimmed = dimmedElementIds.has(element.id);
      const commentCount = unresolvedCommentCounts.get(element.id);
      const existingMarker = existingMarkers.get(element.id);

      if (existingMarker) {
        // Update position and icon
        existingMarker.setLatLng([element.geo.lat, element.geo.lng]);
        existingMarker.setIcon(createIcon(element, isSelected, isDimmed, commentCount));
        // Update title (hover tooltip) based on anonymous mode
        const markerElement = existingMarker.getElement();
        if (markerElement) {
          markerElement.setAttribute('title', anonymousMode ? '' : (element.label || ''));
        }
        // Refresh cluster to reflect changes
        clusterGroup.refreshClusters(existingMarker);
      } else {
        // Create new marker (draggable)
        const marker = L.marker([element.geo.lat, element.geo.lng], {
          icon: createIcon(element, isSelected, isDimmed, commentCount),
          title: anonymousMode ? '' : element.label,
          zIndexOffset: isSelected ? 1000 : 0,
          draggable: true,
        });

        // Click to select
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectElement(element.id);
        });

        // Drag to update geo position (with undo/redo support)
        marker.on('dragstart', () => {
          const pos = marker.getLatLng();
          dragStartGeoRef.current = { id: element.id, geo: { lat: pos.lat, lng: pos.lng } };
        });
        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          const newGeo = { lat: newPos.lat, lng: newPos.lng };
          const oldGeo = dragStartGeoRef.current?.geo;
          updateElement(element.id, { geo: newGeo });
          if (oldGeo) {
            pushAction({
              type: 'update-element',
              undo: { elementId: element.id, changes: { geo: oldGeo } },
              redo: { elementId: element.id, changes: { geo: newGeo } },
            });
          }
          dragStartGeoRef.current = null;
          setClusteringVersion(v => v + 1);
        });

        clusterGroup.addLayer(marker);
        existingMarkers.set(element.id, marker);
      }
    });
  }, [geoElements, selectedElementIds, dimmedElementIds, unresolvedCommentCounts, createIcon, selectElement, updateElement, pushAction, anonymousMode, hideMedia]);

  // Get visible position for a marker (either marker position or cluster position)
  const getVisibleLatLng = useCallback((marker: L.Marker): L.LatLng => {
    if (!clusterGroupRef.current) {
      return marker.getLatLng();
    }
    const visibleParent = clusterGroupRef.current.getVisibleParent(marker);
    return visibleParent ? visibleParent.getLatLng() : marker.getLatLng();
  }, []);

  // Check if two markers are in the same cluster
  const areInSameCluster = useCallback((marker1: L.Marker, marker2: L.Marker): boolean => {
    if (!clusterGroupRef.current) return false;
    const parent1 = clusterGroupRef.current.getVisibleParent(marker1);
    const parent2 = clusterGroupRef.current.getVisibleParent(marker2);
    // If both have the same parent and it's not the marker itself, they're in the same cluster
    return parent1 === parent2 && parent1 !== marker1 && parent2 !== marker2;
  }, []);

  // Calculate angle between two points (in degrees)
  const calculateAngle = useCallback((from: L.LatLng, to: L.LatLng): number => {
    const dx = to.lng - from.lng;
    const dy = to.lat - from.lat;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  // Create arrow marker icon
  const createArrowIcon = useCallback((color: string, angle: number, size: number = 20) => {
    return L.divIcon({
      className: 'link-arrow-icon',
      html: `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="transform: rotate(${-angle + 90}deg);">
        <path d="M10 2 L18 18 L10 13 L2 18 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
      </svg>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }, []);

  // Get position along line (0 = start, 1 = end)
  const getPointOnLine = useCallback((from: L.LatLng, to: L.LatLng, ratio: number): L.LatLng => {
    return L.latLng(
      from.lat + (to.lat - from.lat) * ratio,
      from.lng + (to.lng - from.lng) * ratio
    );
  }, []);

  // Update links (polylines with outlines and labels) - reacts to clustering changes
  useEffect(() => {
    if (!mapRef.current || !clusterGroupRef.current) return;

    const map = mapRef.current;
    const markers = markersRef.current;
    const existingLinkLayers = linkLayersRef.current;
    const currentLinkIds = new Set(geoLinks.map((l) => l.id));

    // Remove link layers that no longer exist
    existingLinkLayers.forEach((linkLayer, id) => {
      if (!currentLinkIds.has(id)) {
        linkLayer.outline.remove();
        linkLayer.line.remove();
        linkLayer.arrowStart?.remove();
        linkLayer.arrowEnd?.remove();
        existingLinkLayers.delete(id);
      }
    });

    // Add or update link layers
    geoLinks.forEach((link) => {
      const fromMarker = markers.get(link.fromId);
      const toMarker = markers.get(link.toId);

      if (!fromMarker || !toMarker) return;

      // Check if link should be dimmed (either connected element is dimmed)
      const isLinkDimmed = dimmedElementIds.has(link.fromId) || dimmedElementIds.has(link.toId);
      const linkOpacity = isLinkDimmed ? 0.3 : 1;

      // Skip if both markers are in the same cluster (link would be invisible/redundant)
      if (areInSameCluster(fromMarker, toMarker)) {
        const existingLayer = existingLinkLayers.get(link.id);
        if (existingLayer) {
          existingLayer.outline.setStyle({ opacity: 0 });
          existingLayer.line.setStyle({ opacity: 0 });
          existingLayer.line.closeTooltip();
          existingLayer.arrowStart?.setOpacity(0);
          existingLayer.arrowEnd?.setOpacity(0);
        }
        return;
      }

      // Get visible positions (marker or cluster)
      const fromLatLng = getVisibleLatLng(fromMarker);
      const toLatLng = getVisibleLatLng(toMarker);

      const existingLinkLayer = existingLinkLayers.get(link.id);

      // Determine line style from link visual properties
      const color = link.visual.color || '#6b6560';
      const weight = Math.max(2, (link.visual.thickness || 2));
      const dashArray = link.visual.style === 'dashed' ? '10, 6' :
                       link.visual.style === 'dotted' ? '3, 6' : undefined;

      // Determine link direction
      const direction = link.direction || (link.directed ? 'forward' : 'none');
      const needsEndArrow = direction === 'forward' || direction === 'both';
      const needsStartArrow = direction === 'backward' || direction === 'both';
      const angle = calculateAngle(fromLatLng, toLatLng);

      // Tooltip content with anonymous mode support
      const tooltipContent = link.label
        ? (anonymousMode
            ? '<span style="display:inline-block;background:var(--color-text-primary,#3d3833);border-radius:2px;width:2.5em;height:0.8em;vertical-align:middle;"></span>'
            : link.label)
        : null;

      if (existingLinkLayer) {
        // Update existing layers with new positions
        existingLinkLayer.outline.setLatLngs([fromLatLng, toLatLng]);
        existingLinkLayer.outline.setStyle({ weight: weight + 4, opacity: 0.9 * linkOpacity });

        existingLinkLayer.line.setLatLngs([fromLatLng, toLatLng]);
        existingLinkLayer.line.setStyle({ color, weight, dashArray, opacity: linkOpacity });

        // Update tooltip content (label may have changed or anonymousMode toggled)
        const existingTooltip = existingLinkLayer.line.getTooltip();
        if (tooltipContent) {
          if (existingTooltip) {
            // Update existing tooltip content
            existingTooltip.setContent(tooltipContent);
            existingLinkLayer.line.openTooltip();
          } else {
            // Bind new tooltip if label was added
            existingLinkLayer.line.bindTooltip(tooltipContent, {
              permanent: true,
              direction: 'center',
              className: 'link-label-tooltip',
            });
          }
        } else if (existingTooltip) {
          // Remove tooltip if label was cleared
          existingLinkLayer.line.unbindTooltip();
        }

        // Update arrows
        // End arrow (pointing to target)
        if (needsEndArrow) {
          const endPos = getPointOnLine(fromLatLng, toLatLng, 0.92);
          if (existingLinkLayer.arrowEnd) {
            existingLinkLayer.arrowEnd.setLatLng(endPos);
            existingLinkLayer.arrowEnd.setIcon(createArrowIcon(color, angle));
            existingLinkLayer.arrowEnd.setOpacity(linkOpacity);
          } else {
            existingLinkLayer.arrowEnd = L.marker(endPos, {
              icon: createArrowIcon(color, angle),
              interactive: false,
              opacity: linkOpacity,
            }).addTo(map);
          }
        } else if (existingLinkLayer.arrowEnd) {
          existingLinkLayer.arrowEnd.remove();
          existingLinkLayer.arrowEnd = undefined;
        }

        // Start arrow (pointing to source)
        if (needsStartArrow) {
          const startPos = getPointOnLine(fromLatLng, toLatLng, 0.08);
          if (existingLinkLayer.arrowStart) {
            existingLinkLayer.arrowStart.setLatLng(startPos);
            existingLinkLayer.arrowStart.setIcon(createArrowIcon(color, angle + 180));
            existingLinkLayer.arrowStart.setOpacity(linkOpacity);
          } else {
            existingLinkLayer.arrowStart = L.marker(startPos, {
              icon: createArrowIcon(color, angle + 180),
              interactive: false,
              opacity: linkOpacity,
            }).addTo(map);
          }
        } else if (existingLinkLayer.arrowStart) {
          existingLinkLayer.arrowStart.remove();
          existingLinkLayer.arrowStart = undefined;
        }
      } else {
        // Create white outline for visibility (underneath)
        const outline = L.polyline([fromLatLng, toLatLng], {
          color: '#ffffff',
          weight: weight + 4,
          opacity: 0.9 * linkOpacity,
          lineCap: 'round',
          lineJoin: 'round',
        });
        outline.addTo(map);

        // Create main line with actual style
        const line = L.polyline([fromLatLng, toLatLng], {
          color,
          weight,
          dashArray,
          opacity: linkOpacity,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'link-line',
        });

        // Add permanent tooltip for label
        if (tooltipContent) {
          line.bindTooltip(tooltipContent, {
            permanent: true,
            direction: 'center',
            className: 'link-label-tooltip',
          });
        }

        // Click to select link
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectLink(link.id);
        });

        line.addTo(map);

        // Create arrow markers
        let arrowEnd: L.Marker | undefined;
        let arrowStart: L.Marker | undefined;

        if (needsEndArrow) {
          const endPos = getPointOnLine(fromLatLng, toLatLng, 0.92);
          arrowEnd = L.marker(endPos, {
            icon: createArrowIcon(color, angle),
            interactive: false,
            opacity: linkOpacity,
          }).addTo(map);
        }

        if (needsStartArrow) {
          const startPos = getPointOnLine(fromLatLng, toLatLng, 0.08);
          arrowStart = L.marker(startPos, {
            icon: createArrowIcon(color, angle + 180),
            interactive: false,
            opacity: linkOpacity,
          }).addTo(map);
        }

        existingLinkLayers.set(link.id, { outline, line, arrowStart, arrowEnd });
      }
    });
  }, [geoLinks, selectLink, clusteringVersion, getVisibleLatLng, areInSameCluster, calculateAngle, createArrowIcon, getPointOnLine, anonymousMode, dimmedElementIds]);

  // Fit map to markers
  const handleFit = useCallback(() => {
    if (!mapRef.current || geoElements.length === 0) return;

    const bounds = L.latLngBounds(
      geoElements.map((el) => [el.geo.lat, el.geo.lng] as L.LatLngTuple)
    );
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [geoElements]);

  // Zoom to selected element
  const handleZoomToSelected = useCallback(() => {
    if (!mapRef.current || selectedElementIds.size === 0) return;

    const selectedGeoElements = geoElements.filter((el) => selectedElementIds.has(el.id));
    if (selectedGeoElements.length === 0) return;

    if (selectedGeoElements.length === 1) {
      mapRef.current.setView(
        [selectedGeoElements[0].geo.lat, selectedGeoElements[0].geo.lng],
        14
      );
    } else {
      const bounds = L.latLngBounds(
        selectedGeoElements.map((el) => [el.geo.lat, el.geo.lng] as L.LatLngTuple)
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [geoElements, selectedElementIds]);

  // Register capture handler for report screenshots
  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {
      if (!mapRef.current) {
        return null;
      }

      // Fit bounds to show all elements
      if (geoElements.length > 0) {
        const bounds = L.latLngBounds(
          geoElements.map((el) => [el.geo.lat, el.geo.lng] as L.LatLngTuple)
        );
        mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: false });
        // Force map to update multiple times to ensure rendering
        mapRef.current.invalidateSize();
        await new Promise(resolve => setTimeout(resolve, 200));
        mapRef.current.invalidateSize();
      }

      // Wait for tiles to load (longer wait for map tiles)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Capture
      const element = document.querySelector('[data-report-capture="map"]') as HTMLElement;
      if (!element) {
        return null;
      }

      try {
        return await toPng(element, {
          backgroundColor: '#e5e3df',
          pixelRatio: 2,
          skipFonts: true,
        });
      } catch {
        return null;
      }
    };

    registerCaptureHandler('map', captureHandler);
    return () => unregisterCaptureHandler('map');
  }, [geoElements, registerCaptureHandler, unregisterCaptureHandler]);

  // No geo elements
  if (geoElements.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-secondary">
        <MapPin size={48} className="text-text-tertiary mb-4" />
        <p className="text-sm text-text-secondary">{t('map.noGeoElements')}</p>
        <p className="text-xs text-text-tertiary mt-2">
          {t('map.addLocation')}
        </p>
      </div>
    );
  }

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Get current event index from selected date
  const currentEventIndex = useMemo(() => {
    if (eventDates.length === 0 || !selectedDate) return 0;
    const selectedTime = selectedDate.getTime();
    // Find closest event date
    let closestIdx = 0;
    let closestDiff = Math.abs(eventDates[0].getTime() - selectedTime);
    for (let i = 1; i < eventDates.length; i++) {
      const diff = Math.abs(eventDates[i].getTime() - selectedTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  }, [eventDates, selectedDate]);

  // Handle slider change - jump to event date by index
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (eventDates.length === 0) return;
    const index = parseInt(e.target.value);
    setSelectedDate(eventDates[index]);
  };

  // Toggle temporal mode
  const handleToggleTemporal = () => {
    if (!temporalMode && eventDates.length > 0) {
      setTemporalMode(true);
      // Start at the event date closest to today (allows navigating both past and future)
      const now = Date.now();
      let closestDate = eventDates[0];
      let closestDiff = Math.abs(eventDates[0].getTime() - now);
      for (const ed of eventDates) {
        const diff = Math.abs(ed.getTime() - now);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestDate = ed;
        }
      }
      setSelectedDate(closestDate);
    } else {
      setTemporalMode(false);
      setSelectedDate(null);
      setIsPlaying(false);
    }
  };

  // Step forward/backward through events
  const handleStep = (direction: 'forward' | 'backward') => {
    if (eventDates.length === 0) return;
    const newIndex = direction === 'forward'
      ? Math.min(currentEventIndex + 1, eventDates.length - 1)
      : Math.max(currentEventIndex - 1, 0);
    setSelectedDate(eventDates[newIndex]);
  };

  // Play animation - step through events
  useEffect(() => {
    if (!isPlaying || eventDates.length === 0) return;

    const interval = setInterval(() => {
      setSelectedDate((prev) => {
        if (!prev) return eventDates[0];

        // Find current index and move to next
        const currentTime = prev.getTime();
        let currentIdx = 0;
        for (let i = 0; i < eventDates.length; i++) {
          if (eventDates[i].getTime() <= currentTime) {
            currentIdx = i;
          }
        }

        const nextIdx = currentIdx + 1;
        if (nextIdx >= eventDates.length) {
          setIsPlaying(false);
          return eventDates[eventDates.length - 1];
        }
        return eventDates[nextIdx];
      });
    }, 800); // Slower for discrete events

    return () => clearInterval(interval);
  }, [isPlaying, eventDates]);

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Toolbar */}
      <ViewToolbar
        leftContent={
          <span className="text-xs text-text-secondary">
            {t('map.elementsLocated', { count: geoElements.length })}
            {geoLinks.length > 0 && (
              <span className="ml-2 text-text-tertiary">
                {t('map.linksCount', { count: geoLinks.length })}
              </span>
            )}
          </span>
        }
        rightContent={
          <>
            {/* Temporal mode toggle */}
            {timeRange && (
              <button
                onClick={handleToggleTemporal}
                className={`px-2 py-1 text-xs flex items-center gap-1 rounded transition-colors ${
                  temporalMode
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
                title={t('map.temporalMode')}
              >
                <Clock size={12} />
                {t('map.temporal')}
              </button>
            )}
            {selectedElementIds.size > 0 && (
              <button
                onClick={handleZoomToSelected}
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                title={t('map.zoomToSelection')}
              >
                {t('map.selection')}
              </button>
            )}
            <button
              onClick={handleFit}
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.fitAll')}
            >
              {t('map.fit')}
            </button>
          </>
        }
      />

      {/* Temporal slider */}
      {temporalMode && timeRange && (
        <div className="px-4 py-2 border-b border-border-default bg-bg-primary flex items-center gap-3">
          {/* Play controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStep('backward')}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.stepBack')}
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-1 rounded ${
                isPlaying
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
              title={isPlaying ? t('map.pause') : t('map.play')}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => handleStep('forward')}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title={t('map.stepForward')}
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Date range display */}
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            {formatDate(timeRange.min)}
          </span>

          {/* Slider - discrete steps on event dates */}
          <input
            type="range"
            min="0"
            max={Math.max(0, eventDates.length - 1)}
            value={currentEventIndex}
            onChange={handleSliderChange}
            className="flex-1 h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
          />

          {/* Date range display */}
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            {formatDate(timeRange.max)}
          </span>

          {/* Event counter */}
          <span className="text-[10px] text-text-tertiary whitespace-nowrap">
            {currentEventIndex + 1}/{eventDates.length}
          </span>

          {/* Current date - editable input (allows any date to see what's visible at that time) */}
          {selectedDate && (
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                if (!isNaN(newDate.getTime())) {
                  // Set the exact date entered - allows exploring any point in time
                  setSelectedDate(newDate);
                }
              }}
              className="text-xs font-medium text-accent bg-transparent border border-border-default rounded px-2 py-0.5 min-w-28"
            />
          )}
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" data-report-capture="map" />

      {/* Custom styles */}
      <style>{`
        .custom-marker-container {
          background: transparent;
          border: none;
        }
        .map-marker-card,
        .map-marker-simple {
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .map-marker-card:hover,
        .map-marker-simple:hover {
          transform: scale(1.05);
        }
        .leaflet-tooltip {
          background: var(--color-bg-primary, #ffffff);
          border: 1px solid var(--color-border-default, #e5e7eb);
          border-radius: 4px;
          color: var(--color-text-primary, #111827);
          font-size: 12px;
          padding: 4px 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .leaflet-tooltip-top:before {
          border-top-color: var(--color-border-default, #e5e7eb);
        }
        .link-tooltip {
          background: var(--color-bg-tertiary, #f0ece4);
          border: 1px solid var(--color-border-sketchy, #b8b0a4);
          font-size: 11px;
          padding: 2px 6px;
        }
        /* Permanent link labels */
        .link-label-tooltip {
          background: var(--color-bg-primary, #ffffff) !important;
          border: 1px solid var(--color-border-strong, #d4cec4) !important;
          border-radius: 3px !important;
          color: var(--color-text-primary, #3d3833) !important;
          font-size: 10px !important;
          font-weight: 500 !important;
          padding: 2px 6px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
          white-space: nowrap !important;
        }
        .link-label-tooltip::before {
          display: none !important;
        }
        /* Make links look clickable */
        .leaflet-interactive.link-line {
          cursor: pointer;
        }
        /* Link arrow icons */
        .link-arrow-icon {
          background: transparent !important;
          border: none !important;
          z-index: 500 !important;
        }
        .link-arrow-icon svg {
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
        }
        /* Cluster icons */
        .custom-cluster-icon {
          background: transparent;
        }
        .cluster-icon {
          background: var(--color-accent, #e07a5f);
          border: 2px solid var(--color-bg-primary, #ffffff);
          border-radius: 50%;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .cluster-icon:hover {
          transform: scale(1.1);
        }
        .cluster-small {
          width: 30px;
          height: 30px;
          font-size: 12px;
        }
        .cluster-medium {
          width: 36px;
          height: 36px;
          font-size: 13px;
        }
        .cluster-large {
          width: 44px;
          height: 44px;
          font-size: 14px;
        }
        /* Override default markercluster styles */
        .marker-cluster-small,
        .marker-cluster-medium,
        .marker-cluster-large {
          background: transparent !important;
        }
        .marker-cluster-small div,
        .marker-cluster-medium div,
        .marker-cluster-large div {
          background: var(--color-accent, #e07a5f) !important;
        }
      `}</style>
    </div>
  );
}
