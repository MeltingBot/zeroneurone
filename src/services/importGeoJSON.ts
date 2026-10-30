/** GeoJSON import: features become located elements, with their properties */

import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { DossierId, Element, Position, GeoData, Confidence, ElementShape, TagSetDefaultVisual, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL } from '../types';
import { useTagSetStore } from '../stores/tagSetStore';
import { computePolygonCenter, computePolygonAreaKm2, openRing, isGeoInRange } from '../utils/geo';
import { isLambert93CrsName, lambert93ToWgs84 } from '../utils/lambert93';
import { isValidShape } from './importValidators';
import { importedDate } from './importDates';
import type { ImportResult } from './importService';

/**
 * Properties of a GeoJSON FeatureCollection that hold a value in at least one
 * feature, in file order, so the user can pick the one that names elements.
 * `suggested` is the first usual name key (name, nom, label…) found, else the
 * first field. Returns null when the content is not a FeatureCollection.
 */
export function analyzeGeoJSONFields(content: string): {
  featureCount: number;
  fields: Array<{ key: string; sample: string }>;
  suggested: string | null;
} | null {
  let data: { type?: unknown; features?: unknown };
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) return null;

  const samples = new Map<string, string>();
  for (const feature of data.features as Array<{ properties?: Record<string, unknown> | null }>) {
    for (const [key, value] of Object.entries(feature?.properties || {})) {
      if (!samples.has(key) && value !== null && value !== undefined && String(value).trim() !== '') {
        samples.set(key, String(value).trim());
      }
    }
  }
  const fields = [...samples].map(([key, sample]) => ({ key, sample }));
  const nameKeys = ['name', 'nom', 'label', 'libelle', 'title', 'titre', 'toponyme'];
  const suggested = nameKeys
    .map(k => fields.find(f => f.key.toLowerCase() === k))
    .find(Boolean)?.key ?? fields[0]?.key ?? null;
  return { featureCount: data.features.length, fields, suggested };
}

/**
 * Import from GeoJSON file (FeatureCollection with Points and Polygons)
 * Points → elements with geo point, Polygons → elements with geo zone.
 * `labelField` names the property used as element label; features where it
 * is empty fall back to the usual name keys. `fields`, when given, lists the
 * properties to import: the others are ignored (the label field is kept).
 */
export async function importFromGeoJSON(
  content: string,
  targetDossierId: DossierId,
  options: { labelField?: string; fields?: string[]; tag?: string } = {}
): Promise<ImportResult> {
  const { labelField } = options;
  // Tag given to every feature; an existing tag family lends its look, a
  // new name creates one (as the custom JSON import does)
  const tagName = options.tag?.trim() || '';
  let tagVisual: TagSetDefaultVisual | null = null;
  if (tagName) {
    const tagStore = useTagSetStore.getState();
    if (!tagStore.isLoaded) await tagStore.load();
    const tagSet = tagStore.getByName(tagName) ?? await tagStore.create({
      name: tagName, description: '', defaultVisual: { color: '#fcd34d', shape: 'circle', icon: null },
      suggestedProperties: [], isBuiltIn: false,
    });
    tagVisual = tagSet.defaultVisual;
  }
  const keptFields = options.fields ? new Set(options.fields) : null;
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  try {
    const data = JSON.parse(content);

    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      result.errors.push('Format GeoJSON invalide: FeatureCollection attendu');
      return result;
    }

    const features = data.features as Array<{
      type: string;
      id?: string;
      geometry?: {
        type: string;
        coordinates?: unknown;
      };
      properties?: Record<string, unknown>;
    }>;

    // Grid layout for canvas positions
    let gridX = 0;
    let gridY = 0;
    const gridSpacing = 200;
    const gridCols = 10;

    let multiPolygonsReduced = 0;
    let outOfRange = 0;

    // GeoJSON is WGS 84 degrees, but French public data often ships in
    // Lambert 93 with a legacy `crs` member: convert it on the fly.
    const toWgs84 = isLambert93CrsName(data.crs?.properties?.name) ? lambert93ToWgs84 : null;
    const reproject = (c: unknown): unknown =>
      Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
        ? toWgs84!([c[0], c[1]])
        : Array.isArray(c) ? c.map(reproject) : c;

    for (const [featureIndex, feature] of features.entries()) {
      if (!feature.geometry) {
        result.warnings.push('Feature sans géométrie ignorée');
        continue;
      }

      const props = keptFields
        ? Object.fromEntries(Object.entries(feature.properties || {})
            .filter(([key]) => keptFields.has(key) || key === labelField))
        : feature.properties || {};
      const chosenLabel = labelField ? props[labelField] : null;
      const label = chosenLabel !== null && chosenLabel !== undefined && String(chosenLabel).trim() !== ''
        ? String(chosenLabel).trim()
        : String(
        props.name || props.label || props.nom || props.title ||
        props.NAME || props.LABEL || props.NOM ||
        feature.id || `Feature ${featureIndex + 1}`
      );

      // Extract metadata from properties
      const notes = String(props.notes || props.description || props.desc || props.NOTES || '');
      const tags: string[] = [];
      if (props.tags) {
        if (Array.isArray(props.tags)) {
          tags.push(...props.tags.map(String));
        } else {
          tags.push(...String(props.tags).split(';').map(t => t.trim()).filter(Boolean));
        }
      }

      // Extract source
      const source = String(props.source || props.SOURCE || '');

      // Parse confidence
      let confidence: Confidence | null = null;
      const confVal = props.confidence ?? props.confiance;
      if (confVal !== undefined && confVal !== null) {
        let conf = typeof confVal === 'number' ? confVal : parseFloat(String(confVal));
        if (conf > 0 && conf <= 1) conf = Math.round(conf * 100);
        conf = Math.round(conf / 10) * 10;
        if (conf >= 0 && conf <= 100) confidence = conf as Confidence;
      }

      if (tagName && !tags.includes(tagName)) tags.push(tagName);

      // Extract color/shape from properties (for re-import of ZN geojson
      // exports), else from the chosen tag family
      const color = String(props.color || props.couleur || tagVisual?.color || DEFAULT_ELEMENT_VISUAL.color);
      const shapeRaw = String(props.shape || props.forme || '');
      const shape = isValidShape(shapeRaw) ? shapeRaw as ElementShape : (tagVisual?.shape ?? DEFAULT_ELEMENT_VISUAL.shape);

      // Build custom properties from remaining keys
      const knownProps = new Set([
        'name', 'label', 'nom', 'title', 'NAME', 'LABEL', 'NOM',
        'notes', 'description', 'desc', 'NOTES',
        'tags', 'source', 'SOURCE',
        'confidence', 'confiance',
        'color', 'couleur', 'shape', 'forme',
        'type', 'date',
      ]);
      const properties: Property[] = [];
      for (const [key, value] of Object.entries(props)) {
        if (!knownProps.has(key) && key !== labelField && value !== null && value !== undefined) {
          // Handle prop_ prefixed keys from ZN geojson export
          const propKey = key.startsWith('prop_') ? key.slice(5) : key;
          properties.push({ key: propKey, value: String(value), type: 'text' });
        }
      }

      // Parse date
      let date: Date | null = null;
      if (props.date) {
        const parsed = importedDate(String(props.date));
        if (!isNaN(parsed.getTime())) date = parsed;
      }

      // Build geo data based on geometry type
      let geo: GeoData | null = null;
      const geomType = feature.geometry.type;
      if (toWgs84) {
        feature.geometry.coordinates = reproject(feature.geometry.coordinates);
      }

      if (geomType === 'Point') {
        const coords = feature.geometry.coordinates as [number, number];
        if (Array.isArray(coords) && coords.length >= 2) {
          geo = { type: 'point', lat: coords[1], lng: coords[0] };
        }
      } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        // ZN holds one ring per element: outer ring of a Polygon, or of the
        // largest part of a MultiPolygon. Holes are dropped.
        const parts = (geomType === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates) as [number, number][][][];
        const outerRings = Array.isArray(parts)
          ? parts
              .filter(rings => Array.isArray(rings) && Array.isArray(rings[0]))
              .map(rings => openRing(rings[0]))
              .filter(ring => ring.length >= 3)
          : [];

        if (outerRings.length === 0) {
          result.warnings.push(`"${label}": polygone avec moins de 3 points, ignoré`);
          continue;
        }
        const coords = outerRings.reduce((largest, ring) =>
          computePolygonAreaKm2(ring) > computePolygonAreaKm2(largest) ? ring : largest
        );
        if (outerRings.length > 1) multiPolygonsReduced++;
        geo = {
          type: 'polygon',
          coordinates: coords,
          center: computePolygonCenter(coords),
        };
      } else if (geomType === 'MultiPoint') {
        // Import first point only
        const coords = feature.geometry.coordinates as [number, number][];
        if (Array.isArray(coords) && coords.length > 0) {
          geo = { type: 'point', lat: coords[0][1], lng: coords[0][0] };
          if (coords.length > 1) {
            result.warnings.push(`"${label}": MultiPoint réduit au premier point`);
          }
        }
      } else if (geomType === 'LineString') {
        // Skip links/linestrings — they are relationships, not elements
        // Could be ZN-exported links; skip silently
        continue;
      } else {
        result.warnings.push(`"${label}": géométrie "${geomType}" non supportée, ignorée`);
        continue;
      }

      if (!geo) {
        result.warnings.push(`"${label}": coordonnées invalides, ignoré`);
        continue;
      }
      if (!isGeoInRange(geo)) {
        outOfRange++;
        continue;
      }

      // Canvas position
      const position: Position = {
        x: gridX * gridSpacing,
        y: gridY * gridSpacing,
      };
      gridX++;
      if (gridX >= gridCols) {
        gridX = 0;
        gridY++;
      }

      const element: Element = {
        id: generateUUID(),
        dossierId: targetDossierId,
        label,
        notes,
        tags,
        properties,
        confidence,
        source,
        date,
        dateRange: null,
        position,
        isPositionLocked: false,
        geo,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color,
          shape,
          ...(tagVisual?.icon ? { icon: tagVisual.icon } : {}),
        },
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      result.elementsImported++;
    }

    if (outOfRange > 0) {
      // GeoJSON is WGS 84 degrees (RFC 7946); metres mean a projected file.
      const crsName = data.crs?.properties?.name;
      const message = `${outOfRange} entité(s) aux coordonnées hors WGS 84 (latitude/longitude en degrés)`
        + (crsName ? `, projection déclarée : ${crsName}` : '')
        + '. Reprojeter le fichier en EPSG:4326 (WGS 84) avant import.';
      if (result.elementsImported === 0) result.errors.push(message);
      else result.warnings.push(`${message} Ces entités sont ignorées.`);
    }

    if (multiPolygonsReduced > 0) {
      result.warnings.push(
        `${multiPolygonsReduced} MultiPolygon réduit(s) à leur plus grand polygone`
      );
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(`Erreur d'import GeoJSON: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  return result;
}
