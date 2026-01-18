import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useInvestigationStore, useSelectionStore, useUIStore, useViewStore, useInsightsStore } from '../../stores';
import { getDimmedElementIds, getNeighborIds } from '../../utils/filterUtils';
import html2canvas from 'html2canvas';
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

  const { elements, links, assets, updateElement } = useInvestigationStore();
  const { selectedElementIds, selectElement, selectLink, clearSelection } = useSelectionStore();
  const hideMedia = useUIStore((state) => state.hideMedia);
  const anonymousMode = useUIStore((state) => state.anonymousMode);
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

  // Calculate time range from all events with geo coordinates
  const timeRange = useMemo(() => {
    const allDates: Date[] = [];

    elements.forEach((el) => {
      // Add dates from events that have geo coordinates
      if (el.events && el.events.length > 0) {
        el.events.forEach((event) => {
          if (event.geo) {
            if (event.date) allDates.push(new Date(event.date));
            if (event.dateEnd) allDates.push(new Date(event.dateEnd));
          }
        });
      }
      // Add element's own date if it has geo
      if (el.geo && el.date) {
        allDates.push(new Date(el.date));
      }
    });

    // Also consider link dates
    links.forEach((link) => {
      if (link.date) allDates.push(new Date(link.date));
      if (link.dateRange?.start) allDates.push(new Date(link.dateRange.start));
      if (link.dateRange?.end) allDates.push(new Date(link.dateRange.end));
    });

    if (allDates.length === 0) return null;

    const timestamps = allDates.map((d) => d.getTime());
    return {
      min: new Date(Math.min(...timestamps)),
      max: new Date(Math.max(...timestamps)),
    };
  }, [elements, links]);

  // Get position for an element at a specific time
  const getPositionAtTime = useCallback(
    (element: Element, date: Date | null): { geo: { lat: number; lng: number }; label?: string } | null => {
      // If no temporal mode or no date, use current geo
      if (!date || !temporalMode) {
        return element.geo ? { geo: element.geo } : null;
      }

      const targetTime = date.getTime();

      // Get events with geo coordinates (sorted by date)
      const geoEvents = (element.events || [])
        .filter((e) => e.geo)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (geoEvents.length > 0) {
        // Find the position valid at targetTime
        for (let i = geoEvents.length - 1; i >= 0; i--) {
          const event = geoEvents[i];
          const eventStart = new Date(event.date).getTime();
          const eventEnd = event.dateEnd ? new Date(event.dateEnd).getTime() : Infinity;

          if (targetTime >= eventStart && targetTime <= eventEnd && event.geo) {
            return { geo: { lat: event.geo.lat, lng: event.geo.lng }, label: event.label };
          }
        }

        // If target is before first event, no position
        if (targetTime < new Date(geoEvents[0].date).getTime()) {
          return null;
        }

        // If target is after last event with no end, use last known position
        const lastEvent = geoEvents[geoEvents.length - 1];
        if (!lastEvent.dateEnd && targetTime >= new Date(lastEvent.date).getTime() && lastEvent.geo) {
          return { geo: { lat: lastEvent.geo.lat, lng: lastEvent.geo.lng }, label: lastEvent.label };
        }
      }

      // Fall back to current geo if no event matches
      return element.geo ? { geo: element.geo } : null;
    },
    [temporalMode]
  );

  // Get elements with resolved geo positions (considering temporal mode)
  // Filter out hidden elements
  const resolvedGeoElements = useMemo((): ResolvedGeoElement[] => {
    const result: ResolvedGeoElement[] = [];

    elements.forEach((el) => {
      // Skip hidden elements
      if (hiddenElementIds.has(el.id)) return;

      const position = getPositionAtTime(el, selectedDate);
      if (position) {
        result.push({
          element: el,
          geo: position.geo,
          fromEvent: !!position.label,
          eventLabel: position.label,
        });
      }
    });

    return result;
  }, [elements, selectedDate, getPositionAtTime, hiddenElementIds]);

  // Legacy geoElements for compatibility (elements with current geo)
  const geoElements = useMemo(() => {
    return resolvedGeoElements.map((r) => ({
      ...r.element,
      geo: r.geo,
    }));
  }, [resolvedGeoElements]);

  // Get geo element IDs for quick lookup
  const geoElementIds = useMemo(() => new Set(geoElements.map(el => el.id)), [geoElements]);

  // Filter links where both elements have geo coordinates
  const geoLinks = useMemo(() => {
    return links.filter(link =>
      geoElementIds.has(link.fromId) && geoElementIds.has(link.toId)
    );
  }, [links, geoElementIds]);

  // Get thumbnail for element
  const getThumbnail = useCallback((element: Element): string | null => {
    const firstAssetId = element.assetIds?.[0];
    if (!firstAssetId) return null;
    return assetMap.get(firstAssetId) ?? null;
  }, [assetMap]);

  // Create custom marker HTML with name and thumbnail
  const createMarkerHtml = useCallback((element: Element, isSelected: boolean, isDimmed: boolean): string => {
    const color = element.visual.color || '#f5f5f4';
    const borderColor = element.visual.borderColor || '#a8a29e';
    const thumbnail = getThumbnail(element);
    const label = element.label || 'Sans nom';
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

    if (thumbnail) {
      // Marker with thumbnail - compact card (blur if hideMedia)
      const blurStyle = hideMedia ? 'filter: blur(8px);' : '';
      return `
        <div class="map-marker-card" style="
          background: var(--color-bg-primary, #ffffff);
          border: 1px solid ${isSelected ? 'var(--color-accent, #e07a5f)' : borderColor};
          border-radius: 4px;
          overflow: hidden;
          ${selectedStyle}
          ${dimmedStyle}
          width: 48px;
        ">
          <div style="
            width: 48px;
            height: 36px;
            background-image: url(${thumbnail});
            background-size: cover;
            background-position: center;
            background-color: var(--color-bg-secondary, #f7f4ef);
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
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          ${dimmedStyle}
        ">
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
  }, [getThumbnail, anonymousMode, hideMedia]);

  // Create custom icon
  const createIcon = useCallback((element: Element, isSelected: boolean, isDimmed: boolean) => {
    const thumbnail = getThumbnail(element);
    const hasThumb = !!thumbnail;

    return L.divIcon({
      className: 'custom-marker-container',
      html: createMarkerHtml(element, isSelected, isDimmed),
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
      const existingMarker = existingMarkers.get(element.id);

      if (existingMarker) {
        // Update position and icon
        existingMarker.setLatLng([element.geo.lat, element.geo.lng]);
        existingMarker.setIcon(createIcon(element, isSelected, isDimmed));
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
          icon: createIcon(element, isSelected, isDimmed),
          title: anonymousMode ? '' : element.label,
          zIndexOffset: isSelected ? 1000 : 0,
          draggable: true,
        });

        // Click to select
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectElement(element.id);
        });

        // Drag to update position
        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          updateElement(element.id, {
            geo: { lat: newPos.lat, lng: newPos.lng }
          });
          // Trigger clustering update
          setClusteringVersion(v => v + 1);
        });

        clusterGroup.addLayer(marker);
        existingMarkers.set(element.id, marker);
      }
    });
  }, [geoElements, selectedElementIds, dimmedElementIds, createIcon, selectElement, updateElement, anonymousMode, hideMedia]);

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
      console.log('Map capture: starting, geoElements count:', geoElements.length);

      if (!mapRef.current) {
        console.error('Map capture: mapRef not available');
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
      console.log('Map capture: waiting for tiles to load...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Capture
      const element = document.querySelector('[data-report-capture="map"]') as HTMLElement;
      if (!element) {
        console.error('Map capture: element not found');
        return null;
      }

      console.log('Map capture: element found, capturing...');

      try {
        const canvas = await html2canvas(element, {
          backgroundColor: '#e5e3df', // Match map background
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 10000, // Allow more time for tile images
          foreignObjectRendering: false, // Better compatibility
        });
        console.log('Map capture: success');
        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Map capture failed:', error);
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
        <p className="text-sm text-text-secondary">Aucun element geolocalisable</p>
        <p className="text-xs text-text-tertiary mt-2">
          Ajoutez des coordonnees aux elements pour les voir sur la carte
        </p>
      </div>
    );
  }

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!timeRange) return;
    const value = parseInt(e.target.value);
    const totalMs = timeRange.max.getTime() - timeRange.min.getTime();
    const newDate = new Date(timeRange.min.getTime() + (value / 100) * totalMs);
    setSelectedDate(newDate);
  };

  // Get slider value from selected date
  const sliderValue = useMemo(() => {
    if (!timeRange || !selectedDate) return 50;
    const totalMs = timeRange.max.getTime() - timeRange.min.getTime();
    if (totalMs === 0) return 50;
    const currentMs = selectedDate.getTime() - timeRange.min.getTime();
    return Math.round((currentMs / totalMs) * 100);
  }, [timeRange, selectedDate]);

  // Toggle temporal mode
  const handleToggleTemporal = () => {
    if (!temporalMode && timeRange) {
      setTemporalMode(true);
      setSelectedDate(timeRange.max); // Start at most recent
    } else {
      setTemporalMode(false);
      setSelectedDate(null);
      setIsPlaying(false);
    }
  };

  // Step forward/backward
  const handleStep = (direction: 'forward' | 'backward') => {
    if (!timeRange || !selectedDate) return;
    const totalMs = timeRange.max.getTime() - timeRange.min.getTime();
    const stepMs = totalMs / 20; // 5% steps
    const newTime = direction === 'forward'
      ? Math.min(selectedDate.getTime() + stepMs, timeRange.max.getTime())
      : Math.max(selectedDate.getTime() - stepMs, timeRange.min.getTime());
    setSelectedDate(new Date(newTime));
  };

  // Play animation
  useEffect(() => {
    if (!isPlaying || !timeRange || !selectedDate) return;

    const interval = setInterval(() => {
      setSelectedDate((prev) => {
        if (!prev || !timeRange) return prev;
        const totalMs = timeRange.max.getTime() - timeRange.min.getTime();
        const stepMs = totalMs / 100; // 1% per step
        const newTime = prev.getTime() + stepMs;

        if (newTime >= timeRange.max.getTime()) {
          setIsPlaying(false);
          return timeRange.max;
        }
        return new Date(newTime);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, timeRange]);

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Toolbar */}
      <ViewToolbar
        leftContent={
          <span className="text-xs text-text-secondary">
            {geoElements.length} element{geoElements.length > 1 ? 's' : ''} localise{geoElements.length > 1 ? 's' : ''}
            {geoLinks.length > 0 && (
              <span className="ml-2 text-text-tertiary">
                ({geoLinks.length} lien{geoLinks.length > 1 ? 's' : ''})
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
                title="Mode temporel"
              >
                <Clock size={12} />
                Temporel
              </button>
            )}
            {selectedElementIds.size > 0 && (
              <button
                onClick={handleZoomToSelected}
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
                title="Zoom sur la selection"
              >
                Selection
              </button>
            )}
            <button
              onClick={handleFit}
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title="Ajuster a tous les elements"
            >
              Ajuster
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
              title="Reculer"
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
              title={isPlaying ? 'Pause' : 'Lecture'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => handleStep('forward')}
              className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded"
              title="Avancer"
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Date range display */}
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            {formatDate(timeRange.min)}
          </span>

          {/* Slider */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={handleSliderChange}
            className="flex-1 h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-accent"
          />

          {/* Date range display */}
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            {formatDate(timeRange.max)}
          </span>

          {/* Current date */}
          {selectedDate && (
            <span className="text-xs font-medium text-accent whitespace-nowrap min-w-24 text-right">
              {formatDate(selectedDate)}
            </span>
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
