/** CSV import: one file with a type column, elements and links */

import { db } from '../db/database';
import { generateUUID } from '../utils';
import type { DateRange, DossierId, Element, ElementId, Link, Position, GeoData, Confidence, ElementShape, ElementVisual, ElementEvent, LinkStyle, Property } from '../types';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import { useTagSetStore } from '../stores/tagSetStore';
import { splitCSVRecords, detectCSVDelimiter, parseCSVLine, stripBom } from '../utils/csv';
import { isNumericColumn, parseNumericText } from '../utils/numericText';
import { sanitizeEvaluation } from '../utils/evaluation';

import type { CSVImportOptions, ImportResult, ImportService } from './importService';
import { isValidLinkStyle, isValidShape } from './importValidators';
import { importedDate, importedPrecision, importedTimeZone } from './importDates';

/**
 * Properties of a CSV row from its free columns. A column whose every value
 * is a number gives number properties (phone numbers, postcodes and long ids
 * stay text); the others give text properties.
 */
function csvPropertyReader(columns: { index: number; name: string }[], rows: string[][]): (values: string[]) => Property[] {
  const numeric = new Set(columns.filter(({ index }) => isNumericColumn(rows.map((row) => row[index]))).map(({ index }) => index));
  return (values) => {
    const props: Property[] = [];
    for (const { index, name } of columns) {
      const value = values[index]?.trim();
      if (!value) continue;
      const n = numeric.has(index) ? parseNumericText(value) : null;
      props.push(n !== null ? { key: name, value: n, type: 'number' } : { key: name, value });
    }
    return props;
  };
}

/**
 * Import unified CSV file with type column (elements and links in one file)
 */
export async function importFromCSV(
  svc: ImportService,
  content: string,
  targetDossierId: DossierId,
  options: Partial<CSVImportOptions> = {}
): Promise<ImportResult> {
  // TagSets give the fallback visual of tagged rows (buildCsvElementVisual)
  if (!useTagSetStore.getState().isLoaded) await useTagSetStore.getState().load();
  content = normalizeCSVContent(content);
  const opts: CSVImportOptions = {
    hasHeaders: true,
    delimiter: options.delimiter ?? detectCSVDelimiter(content),
    createMissingElements: true,
    ...options,
  };

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
    const lines = splitCSVRecords(content);
    if (lines.length === 0) {
      result.errors.push('Fichier CSV vide');
      return result;
    }

    const headers = parseCSVLine(lines[0], opts.delimiter).map(h => h.toLowerCase());
    const dataLines = lines.slice(1);

    // Check if this is a unified format (has 'type' column)
    const typeIdx = headers.findIndex((h) => h === 'type');

    if (typeIdx === -1) {
      // No type column - use legacy detection
      const isLinksCSV = headers.includes('de') || headers.includes('vers') ||
        headers.includes('from') || headers.includes('to') || headers.includes('source') || headers.includes('target');

      if (isLinksCSV) {
        return importLinksFromCSV(svc, content, targetDossierId, opts);
      } else {
        return importElementsFromCSV(svc, content, targetDossierId, opts);
      }
    }

    // Unified format with type column
    const labelIdx = headers.findIndex((h) => ['label', 'nom', 'name'].includes(h));
    const deIdx = headers.findIndex((h) => ['de', 'from', 'source'].includes(h));
    const versIdx = headers.findIndex((h) => ['vers', 'to', 'target'].includes(h));
    const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h));
    const tagsIdx = headers.findIndex((h) => ['tags', 'etiquettes'].includes(h));
    const confidenceIdx = headers.findIndex((h) => ['confiance', 'confidence'].includes(h));
    const evalScaleIdx = headers.findIndex((h) => ['cotation_echelle', 'evaluation_scale'].includes(h));
    const evalSourceIdx = headers.findIndex((h) => ['cotation_source', 'evaluation_source'].includes(h));
    const evalInfoIdx = headers.findIndex((h) => ['cotation_info', 'evaluation_info'].includes(h));
    const parseEvaluation = (values: string[]) =>
      evalScaleIdx >= 0
        ? sanitizeEvaluation({
            scale: values[evalScaleIdx]?.trim().toLowerCase(),
            source: evalSourceIdx >= 0 ? values[evalSourceIdx] : null,
            info: evalInfoIdx >= 0 ? values[evalInfoIdx] : null,
          })
        : null;
    const sourceIdx = headers.findIndex((h) => h === 'source' && deIdx !== headers.indexOf(h)); // Avoid conflict with 'de'
    const dateIdx = headers.findIndex((h) => h === 'date');
    const dateStartIdx = headers.findIndex((h) => ['date_debut', 'date_start'].includes(h));
    const dateEndIdx = headers.findIndex((h) => ['date_fin', 'date_end'].includes(h));
    const timeZoneIdx = headers.findIndex((h) => ['fuseau', 'timezone', 'time_zone'].includes(h));
    const rowTimeZone = (values: string[]) => (timeZoneIdx >= 0 ? importedTimeZone(values[timeZoneIdx]) : undefined);
    const latIdx = headers.findIndex((h) => ['latitude', 'lat'].includes(h));
    const lngIdx = headers.findIndex((h) => ['longitude', 'lng', 'lon'].includes(h));
    const posXIdx = headers.findIndex((h) => ['position_x', 'x', 'posx'].includes(h));
    const posYIdx = headers.findIndex((h) => ['position_y', 'y', 'posy'].includes(h));
    const directedIdx = headers.findIndex((h) => ['dirige', 'directed'].includes(h));
    const colorIdx = headers.findIndex((h) => ['couleur', 'color'].includes(h));
    const shapeIdx = headers.findIndex((h) => ['forme', 'shape'].includes(h));
    const styleIdx = headers.findIndex((h) => h === 'style');
    const isGroupIdx = headers.findIndex((h) => ['est_groupe', 'is_group', 'isgroup'].includes(h));
    const parentGroupIdx = headers.findIndex((h) => ['groupe_parent', 'parent_group', 'parentgroup'].includes(h));

    // Known headers (reserved columns) - any other column becomes a property
    const knownHeaders = new Set([
      'type', 'label', 'nom', 'name', 'de', 'from', 'source', 'vers', 'to', 'target',
      'notes', 'description', 'tags', 'etiquettes', 'confiance', 'confidence',
      'cotation_echelle', 'evaluation_scale', 'cotation_source', 'evaluation_source', 'cotation_info', 'evaluation_info',
      'date', 'date_debut', 'date_start', 'date_fin', 'date_end',
      'latitude', 'lat', 'longitude', 'lng', 'lon',
      'position_x', 'x', 'posx', 'position_y', 'y', 'posy',
      'dirige', 'directed', 'couleur', 'color', 'forme', 'shape', 'style',
      'est_groupe', 'is_group', 'isgroup', 'groupe_parent', 'parent_group', 'parentgroup',
    ]);

    // Find custom property columns (columns not in knownHeaders)
    const customPropertyIndices: { index: number; name: string }[] = [];
    headers.forEach((header, index) => {
      if (!knownHeaders.has(header) && header.trim()) {
        customPropertyIndices.push({ index, name: header });
      }
    });
    const customProperties = csvPropertyReader(
      customPropertyIndices,
      dataLines.map((line) => parseCSVLine(line, opts.delimiter)),
    );

    // Track created elements by label for linking
    const elementsByLabel = new Map<string, Element>();

    // First, get existing elements
    const existingElements = await db.elements
      .where({ dossierId: targetDossierId })
      .toArray();
    existingElements.forEach((el) => {
      elementsByLabel.set(el.label.toLowerCase(), el);
    });

    // First pass: create all elements
    let rowNum = 2;
    for (const line of dataLines) {
      const values = parseCSVLine(line, opts.delimiter);
      if (values.length === 0) {
        rowNum++;
        continue;
      }

      const type = values[typeIdx]?.toLowerCase().trim();
      if (type !== 'element') {
        rowNum++;
        continue;
      }

      const label = labelIdx >= 0 ? values[labelIdx]?.trim() : '';
      if (!label) {
        result.warnings.push(`Ligne ${rowNum}: label vide, élément ignoré`);
        rowNum++;
        continue;
      }

      // Skip if element already exists
      if (elementsByLabel.has(label.toLowerCase())) {
        rowNum++;
        continue;
      }

      // Parse geo coordinates
      let geo: GeoData | null = null;
      if (latIdx >= 0 && lngIdx >= 0 && values[latIdx] && values[lngIdx]) {
        const lat = parseFloat(values[latIdx]);
        const lng = parseFloat(values[lngIdx]);
        if (!isNaN(lat) && !isNaN(lng)) {
          geo = { type: 'point', lat, lng };
        }
      }

      // Parse date
      let date: Date | null = null;
      if (dateIdx >= 0 && values[dateIdx]) {
        const parsed = importedDate(values[dateIdx]);
        if (!isNaN(parsed.getTime())) {
          date = parsed;
        }
      }

      // Parse confidence
      let confidence: Confidence | null = null;
      if (confidenceIdx >= 0 && values[confidenceIdx]) {
        const conf = parseInt(values[confidenceIdx]);
        if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
          confidence = conf as Confidence;
        }
      }

      // Parse custom properties from additional columns
      const properties = customProperties(values);

      // Parse position
      let posX = Math.random() * 500;
      let posY = Math.random() * 500;
      if (posXIdx >= 0 && values[posXIdx]) {
        const parsed = parseFloat(values[posXIdx]);
        if (!isNaN(parsed)) posX = parsed;
      }
      if (posYIdx >= 0 && values[posYIdx]) {
        const parsed = parseFloat(values[posYIdx]);
        if (!isNaN(parsed)) posY = parsed;
      }

      // Parse group fields
      const isGroup = isGroupIdx >= 0 && ['oui', 'yes', 'true', '1'].includes(values[isGroupIdx]?.toLowerCase().trim());
      const parentGroupId = parentGroupIdx >= 0 && values[parentGroupIdx]?.trim() ? values[parentGroupIdx].trim() : null;

      const tags = tagsIdx >= 0 && values[tagsIdx] ? values[tagsIdx].split(';').map(t => t.trim()).filter(Boolean) : [];

      const element: Element = {
        id: generateUUID(),
        dossierId: targetDossierId,
        label,
        notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
        tags,
        properties,
        confidence,
        evaluation: parseEvaluation(values),
        source: sourceIdx >= 0 ? values[sourceIdx] || '' : '',
        date,
        dateRange: null,
        position: { x: posX, y: posY },
        isPositionLocked: false,
        geo,
        visual: buildCsvElementVisual(
          tags,
          colorIdx >= 0 ? values[colorIdx] : undefined,
          shapeIdx >= 0 ? values[shapeIdx] : undefined,
        ),
        assetIds: [],
        parentGroupId,
        isGroup,
        isAnnotation: false,
        childIds: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.elements.add(element);
      elementsByLabel.set(label.toLowerCase(), element);
      result.elementsImported++;
      rowNum++;
    }

    // Second pass: create all links
    rowNum = 2;
    for (const line of dataLines) {
      const values = parseCSVLine(line, opts.delimiter);
      if (values.length === 0) {
        rowNum++;
        continue;
      }

      const type = values[typeIdx]?.toLowerCase().trim();
      if (type !== 'lien' && type !== 'link') {
        rowNum++;
        continue;
      }

      const deValue = deIdx >= 0 ? values[deIdx]?.trim().toLowerCase() : '';
      const versValue = versIdx >= 0 ? values[versIdx]?.trim().toLowerCase() : '';

      if (!deValue || !versValue) {
        result.warnings.push(`Ligne ${rowNum}: de/vers vide, lien ignoré`);
        rowNum++;
        continue;
      }

      let fromElement = elementsByLabel.get(deValue);
      let toElement = elementsByLabel.get(versValue);

      // Create missing elements if option enabled
      if (!fromElement && opts.createMissingElements) {
        fromElement = {
          id: generateUUID(),
          dossierId: targetDossierId,
          label: values[deIdx].trim(),
          notes: '',
          tags: [],
          properties: [],
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          position: { x: Math.random() * 500, y: Math.random() * 500 },
          isPositionLocked: false,
          geo: null,
          visual: { ...DEFAULT_ELEMENT_VISUAL },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.elements.add(fromElement);
        elementsByLabel.set(deValue, fromElement);
        result.elementsImported++;
      }

      if (!toElement && opts.createMissingElements) {
        toElement = {
          id: generateUUID(),
          dossierId: targetDossierId,
          label: values[versIdx].trim(),
          notes: '',
          tags: [],
          properties: [],
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          position: { x: Math.random() * 500, y: Math.random() * 500 },
          isPositionLocked: false,
          geo: null,
          visual: { ...DEFAULT_ELEMENT_VISUAL },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.elements.add(toElement);
        elementsByLabel.set(versValue, toElement);
        result.elementsImported++;
      }

      if (!fromElement || !toElement) {
        result.warnings.push(`Ligne ${rowNum}: élément(s) non trouvé(s): ${!fromElement ? deValue : ''} ${!toElement ? versValue : ''}`);
        rowNum++;
        continue;
      }

      // Parse directed
      const directedValue = directedIdx >= 0 ? values[directedIdx]?.toLowerCase() : '';
      const isDirected = ['true', 'oui', 'yes', '1'].includes(directedValue);

      // Parse confidence
      let linkConfidence: Confidence | null = null;
      if (confidenceIdx >= 0 && values[confidenceIdx]) {
        const conf = parseInt(values[confidenceIdx]);
        if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
          linkConfidence = conf as Confidence;
        }
      }

      // Parse date range
      let dateRange: DateRange | null = null;
      if (dateStartIdx >= 0 && values[dateStartIdx]) {
        const startDate = importedDate(values[dateStartIdx], rowTimeZone(values));
        const endDate = dateEndIdx >= 0 && values[dateEndIdx] ? importedDate(values[dateEndIdx], rowTimeZone(values)) : startDate;
        if (!isNaN(startDate.getTime())) {
          dateRange = {
            start: startDate,
            end: !isNaN(endDate.getTime()) ? endDate : startDate,
            ...importedPrecision(values[dateStartIdx]),
            ...(rowTimeZone(values) ? { timeZone: rowTimeZone(values) } : {}),
          };
        }
      }

      // Parse custom properties from additional columns
      const linkProperties = customProperties(values);

      const link: Link = {
        id: generateUUID(),
        dossierId: targetDossierId,
        fromId: fromElement.id,
        toId: toElement.id,
        sourceHandle: null,
        targetHandle: null,
        label: labelIdx >= 0 ? values[labelIdx] || '' : '',
        notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
        tags: [],
        properties: linkProperties,
        confidence: linkConfidence,
        evaluation: parseEvaluation(values),
        source: '',
        date: null,
        dateRange,
        directed: isDirected,
        direction: isDirected ? 'forward' : 'none',
        visual: {
          ...DEFAULT_LINK_VISUAL,
          color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_LINK_VISUAL.color,
          style: styleIdx >= 0 && isValidLinkStyle(values[styleIdx]) ? values[styleIdx] as LinkStyle : DEFAULT_LINK_VISUAL.style,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.links.add(link);
      result.linksImported++;
      rowNum++;
    }

    // Third pass: create events attached to elements (type=event)
    // An event row references its parent element via the `de`/`from`/`source` column
    // and reuses date / date_fin / label / notes / latitude / longitude / source columns.
    const eventsByElementId = new Map<string, ElementEvent[]>();
    rowNum = 2;
    for (const line of dataLines) {
      const values = parseCSVLine(line, opts.delimiter);
      if (values.length === 0) {
        rowNum++;
        continue;
      }

      const type = values[typeIdx]?.toLowerCase().trim();
      if (type !== 'event' && type !== 'evenement' && type !== 'événement') {
        rowNum++;
        continue;
      }

      const parentValue = deIdx >= 0 ? values[deIdx]?.trim().toLowerCase() : '';
      if (!parentValue) {
        result.warnings.push(`Ligne ${rowNum}: élément parent (de) vide, événement ignoré`);
        rowNum++;
        continue;
      }

      let parentElement = elementsByLabel.get(parentValue);
      if (!parentElement && opts.createMissingElements) {
        parentElement = {
          id: generateUUID(),
          dossierId: targetDossierId,
          label: values[deIdx].trim(),
          notes: '',
          tags: [],
          properties: [],
          confidence: null,
          source: '',
          date: null,
          dateRange: null,
          position: { x: Math.random() * 500, y: Math.random() * 500 },
          isPositionLocked: false,
          geo: null,
          visual: { ...DEFAULT_ELEMENT_VISUAL },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          events: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.elements.add(parentElement);
        elementsByLabel.set(parentValue, parentElement);
        result.elementsImported++;
      }

      if (!parentElement) {
        result.warnings.push(`Ligne ${rowNum}: élément parent introuvable: ${parentValue}`);
        rowNum++;
        continue;
      }

      // Parse event date (required) — prefer `date`, fallback to `date_debut`
      let eventDate: Date | null = null;
      let eventDateText: string | undefined;
      if (dateIdx >= 0 && values[dateIdx]) {
        const parsed = importedDate(values[dateIdx], rowTimeZone(values));
        if (!isNaN(parsed.getTime())) { eventDate = parsed; eventDateText = values[dateIdx]; }
      }
      if (!eventDate && dateStartIdx >= 0 && values[dateStartIdx]) {
        const parsed = importedDate(values[dateStartIdx], rowTimeZone(values));
        if (!isNaN(parsed.getTime())) { eventDate = parsed; eventDateText = values[dateStartIdx]; }
      }
      if (!eventDate) {
        result.warnings.push(`Ligne ${rowNum}: date manquante ou invalide, événement ignoré`);
        rowNum++;
        continue;
      }

      // Parse optional end date
      let eventDateEnd: Date | undefined;
      if (dateEndIdx >= 0 && values[dateEndIdx]) {
        const parsed = importedDate(values[dateEndIdx], rowTimeZone(values));
        if (!isNaN(parsed.getTime())) eventDateEnd = parsed;
      }

      // Parse geo coordinates
      let eventGeo: GeoData | undefined;
      if (latIdx >= 0 && lngIdx >= 0 && values[latIdx] && values[lngIdx]) {
        const lat = parseFloat(values[latIdx]);
        const lng = parseFloat(values[lngIdx]);
        if (!isNaN(lat) && !isNaN(lng)) {
          eventGeo = { type: 'point', lat, lng };
        }
      }

      // Parse custom properties from additional columns
      const eventProperties = customProperties(values);

      const event: ElementEvent = {
        id: generateUUID(),
        date: eventDate,
        ...(eventDateEnd ? { dateEnd: eventDateEnd } : {}),
        label: labelIdx >= 0 ? values[labelIdx]?.trim() || '' : '',
        ...(notesIdx >= 0 && values[notesIdx]?.trim() ? { description: values[notesIdx].trim() } : {}),
        ...(eventGeo ? { geo: eventGeo } : {}),
        ...(eventProperties.length > 0 ? { properties: eventProperties } : {}),
        ...(sourceIdx >= 0 && values[sourceIdx]?.trim() ? { source: values[sourceIdx].trim() } : {}),
        ...importedPrecision(eventDateText),
        ...(rowTimeZone(values) ? { timeZone: rowTimeZone(values) } : {}),
      };

      const list = eventsByElementId.get(parentElement.id) ?? [];
      list.push(event);
      eventsByElementId.set(parentElement.id, list);
      result.eventsImported = (result.eventsImported ?? 0) + 1;
      rowNum++;
    }

    // Persist accumulated events onto their parent elements
    for (const [elementId, newEvents] of eventsByElementId) {
      const parent = await db.elements.get(elementId as ElementId);
      if (!parent) continue;
      await db.elements.update(elementId as ElementId, {
        events: [...(parent.events ?? []), ...newEvents],
        updatedAt: new Date(),
      });
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });

    result.success = result.elementsImported > 0 || result.linksImported > 0 || (result.eventsImported ?? 0) > 0;
    if (result.linksImported > 0) {
      await svc.applyImportDisplaySettings(targetDossierId);
    }
  } catch (error) {
    result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  return result;
}

/**
 * Import elements from CSV file (legacy format without type column)
 */
async function importElementsFromCSV(
  svc: ImportService,
  content: string,
  targetDossierId: DossierId,
  options: Partial<CSVImportOptions> = {}
): Promise<ImportResult> {
  // TagSets give the fallback visual of tagged rows (buildCsvElementVisual)
  if (!useTagSetStore.getState().isLoaded) await useTagSetStore.getState().load();
  content = normalizeCSVContent(content);
  const opts: CSVImportOptions = {
    hasHeaders: true,
    delimiter: options.delimiter ?? detectCSVDelimiter(content),
    createMissingElements: true,
    ...options,
  };

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
    const lines = splitCSVRecords(content);
    if (lines.length === 0) {
      result.errors.push('Fichier CSV vide');
      return result;
    }

    let headers: string[];
    let dataLines: string[];

    if (opts.hasHeaders) {
      headers = parseCSVLine(lines[0], opts.delimiter);
      dataLines = lines.slice(1);
    } else {
      // Default headers for elements
      headers = ['label', 'notes', 'tags', 'positionX', 'positionY'];
      dataLines = lines;
    }

    // Find column indices (accept both French and English column names)
    const labelIdx = headers.findIndex((h) => ['label', 'nom', 'name'].includes(h.toLowerCase()));
    const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h.toLowerCase()));
    const tagsIdx = headers.findIndex((h) => ['tags', 'etiquettes'].includes(h.toLowerCase()));
    const posXIdx = headers.findIndex((h) => h.toLowerCase().includes('positionx') || h.toLowerCase() === 'x');
    const posYIdx = headers.findIndex((h) => h.toLowerCase().includes('positiony') || h.toLowerCase() === 'y');
    const geoLatIdx = headers.findIndex((h) => ['lat', 'latitude'].includes(h.toLowerCase()));
    const geoLngIdx = headers.findIndex((h) => ['lng', 'lon', 'longitude'].includes(h.toLowerCase()));
    const dateIdx = headers.findIndex((h) => ['date'].includes(h.toLowerCase()));
    const confidenceIdx = headers.findIndex((h) => ['confidence', 'confiance'].includes(h.toLowerCase()));
    const sourceIdx = headers.findIndex((h) => ['source'].includes(h.toLowerCase()));
    const colorIdx = headers.findIndex((h) => ['color', 'couleur'].includes(h.toLowerCase()));
    const shapeIdx = headers.findIndex((h) => ['shape', 'forme'].includes(h.toLowerCase()));

    if (labelIdx === -1) {
      result.errors.push('Colonne "label" requise non trouvée');
      return result;
    }

    // Every other column becomes a property
    const used = new Set([labelIdx, notesIdx, tagsIdx, posXIdx, posYIdx, geoLatIdx, geoLngIdx, dateIdx, confidenceIdx, sourceIdx, colorIdx, shapeIdx]);
    const freeColumns = headers
      .map((name, index) => ({ index, name: name.trim() }))
      .filter(({ index, name }) => name && !used.has(index));
    const customProperties = csvPropertyReader(freeColumns, dataLines.map((line) => parseCSVLine(line, opts.delimiter)));

    // Process each row
    let rowNum = opts.hasHeaders ? 2 : 1;
    for (const line of dataLines) {
      try {
        const values = parseCSVLine(line, opts.delimiter);
        if (values.length === 0) continue;

        const label = values[labelIdx]?.trim();
        if (!label) {
          result.warnings.push(`Ligne ${rowNum}: label vide, ligne ignoree`);
          rowNum++;
          continue;
        }

        // Parse position
        const position: Position = {
          x: posXIdx >= 0 ? parseFloat(values[posXIdx]) || Math.random() * 500 : Math.random() * 500,
          y: posYIdx >= 0 ? parseFloat(values[posYIdx]) || Math.random() * 500 : Math.random() * 500,
        };

        // Parse geo coordinates
        let geo: GeoData | null = null;
        if (geoLatIdx >= 0 && geoLngIdx >= 0) {
          const lat = parseFloat(values[geoLatIdx]);
          const lng = parseFloat(values[geoLngIdx]);
          if (!isNaN(lat) && !isNaN(lng)) {
            geo = { type: 'point', lat, lng };
          }
        }

        // Parse date
        let date: Date | null = null;
        if (dateIdx >= 0 && values[dateIdx]) {
          const parsed = importedDate(values[dateIdx]);
          if (!isNaN(parsed.getTime())) {
            date = parsed;
          }
        }

        // Parse confidence
        let confidence: Confidence | null = null;
        if (confidenceIdx >= 0 && values[confidenceIdx]) {
          const conf = parseInt(values[confidenceIdx]);
          if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
            confidence = conf as Confidence;
          }
        }

        // Parse tags
        const tags: string[] = tagsIdx >= 0 && values[tagsIdx]
          ? values[tagsIdx].split(';').map((t) => t.trim()).filter(Boolean)
          : [];

        const element: Element = {
          id: generateUUID(),
          dossierId: targetDossierId,
          label,
          notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
          tags,
          properties: customProperties(values),
          confidence,
          source: sourceIdx >= 0 ? values[sourceIdx] || '' : '',
          date,
          dateRange: null,
          position,
          isPositionLocked: false,
          geo,
          visual: buildCsvElementVisual(
            tags,
            colorIdx >= 0 ? values[colorIdx] : undefined,
            shapeIdx >= 0 ? values[shapeIdx] : undefined,
          ),
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
      } catch (error) {
        result.warnings.push(`Ligne ${rowNum}: ${error instanceof Error ? error.message : 'Erreur'}`);
      }
      rowNum++;
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });

    result.success = result.elementsImported > 0;
    if (result.linksImported > 0) {
      await svc.applyImportDisplaySettings(targetDossierId);
    }
  } catch (error) {
    result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  return result;
}

/**
 * Import links from CSV file
 */
async function importLinksFromCSV(
  svc: ImportService,
  content: string,
  targetDossierId: DossierId,
  options: Partial<CSVImportOptions> = {}
): Promise<ImportResult> {
  content = normalizeCSVContent(content);
  const opts: CSVImportOptions = {
    hasHeaders: true,
    delimiter: options.delimiter ?? detectCSVDelimiter(content),
    createMissingElements: false,
    ...options,
  };

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
    const lines = splitCSVRecords(content);
    if (lines.length === 0) {
      result.errors.push('Fichier CSV vide');
      return result;
    }

    // Get existing elements to map by label
    const existingElements = await db.elements
      .where({ dossierId: targetDossierId })
      .toArray();
    const elementsByLabel = new Map<string, Element>();
    existingElements.forEach((el) => {
      elementsByLabel.set(el.label.toLowerCase(), el);
    });

    let headers: string[];
    let dataLines: string[];

    if (opts.hasHeaders) {
      headers = parseCSVLine(lines[0], opts.delimiter);
      dataLines = lines.slice(1);
    } else {
      headers = ['from', 'to', 'label'];
      dataLines = lines;
    }

    // Find column indices (accept both French and English column names)
    const fromIdx = headers.findIndex((h) =>
      ['from', 'fromid', 'source', 'de', 'origine'].includes(h.toLowerCase())
    );
    const toIdx = headers.findIndex((h) =>
      ['to', 'toid', 'target', 'vers', 'destination', 'cible'].includes(h.toLowerCase())
    );
    const labelIdx = headers.findIndex((h) => ['label', 'relation', 'type'].includes(h.toLowerCase()));
    const notesIdx = headers.findIndex((h) => ['notes', 'description'].includes(h.toLowerCase()));
    const directedIdx = headers.findIndex((h) => ['directed', 'dirige', 'direction'].includes(h.toLowerCase()));
    const colorIdx = headers.findIndex((h) => ['color', 'couleur'].includes(h.toLowerCase()));
    const styleIdx = headers.findIndex((h) => ['style'].includes(h.toLowerCase()));
    const confidenceIdx = headers.findIndex((h) => ['confidence', 'confiance'].includes(h.toLowerCase()));
    const dateStartIdx = headers.findIndex((h) => ['date_debut', 'date_start', 'debut', 'start'].includes(h.toLowerCase()));
    const dateEndIdx = headers.findIndex((h) => ['date_fin', 'date_end', 'fin', 'end'].includes(h.toLowerCase()));
    const timeZoneIdx = headers.findIndex((h) => ['fuseau', 'timezone', 'time_zone'].includes(h.toLowerCase()));
    const rowTimeZone = (values: string[]) => (timeZoneIdx >= 0 ? importedTimeZone(values[timeZoneIdx]) : undefined);

    if (fromIdx === -1 || toIdx === -1) {
      result.errors.push('Colonnes "de" et "vers" (ou "from" et "to") requises non trouvées');
      return result;
    }

    // Process each row
    let rowNum = opts.hasHeaders ? 2 : 1;
    for (const line of dataLines) {
      try {
        const values = parseCSVLine(line, opts.delimiter);
        if (values.length === 0) continue;

        const fromValue = values[fromIdx]?.trim().toLowerCase();
        const toValue = values[toIdx]?.trim().toLowerCase();

        if (!fromValue || !toValue) {
          result.warnings.push(`Ligne ${rowNum}: from/to vide, ligne ignoree`);
          rowNum++;
          continue;
        }

        // Find elements by label
        let fromElement = elementsByLabel.get(fromValue);
        let toElement = elementsByLabel.get(toValue);

        // Create missing elements if option enabled
        if (!fromElement && opts.createMissingElements) {
          fromElement = {
            id: generateUUID(),
            dossierId: targetDossierId,
            label: values[fromIdx].trim(),
            notes: '',
            tags: [],
            properties: [],
            confidence: null,
            source: '',
            date: null,
            dateRange: null,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            isPositionLocked: false,
            geo: null,
            visual: { ...DEFAULT_ELEMENT_VISUAL },
            assetIds: [],
            parentGroupId: null,
            isGroup: false,
            isAnnotation: false,
            childIds: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.elements.add(fromElement);
          elementsByLabel.set(fromValue, fromElement);
          result.elementsImported++;
        }

        if (!toElement && opts.createMissingElements) {
          toElement = {
            id: generateUUID(),
            dossierId: targetDossierId,
            label: values[toIdx].trim(),
            notes: '',
            tags: [],
            properties: [],
            confidence: null,
            source: '',
            date: null,
            dateRange: null,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            isPositionLocked: false,
            geo: null,
            visual: { ...DEFAULT_ELEMENT_VISUAL },
            assetIds: [],
            parentGroupId: null,
            isGroup: false,
            isAnnotation: false,
            childIds: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.elements.add(toElement);
          elementsByLabel.set(toValue, toElement);
          result.elementsImported++;
        }

        if (!fromElement || !toElement) {
          result.warnings.push(
            `Ligne ${rowNum}: element(s) non trouve(s): ${!fromElement ? fromValue : ''} ${!toElement ? toValue : ''}`
          );
          rowNum++;
          continue;
        }

        // Parse directed (accept true/false, oui/non, yes/no)
        const directedValue = directedIdx >= 0 ? values[directedIdx]?.toLowerCase() : '';
        const isDirected = ['true', 'oui', 'yes', '1'].includes(directedValue);

        // Parse confidence
        let linkConfidence: Confidence | null = null;
        if (confidenceIdx >= 0 && values[confidenceIdx]) {
          const conf = parseInt(values[confidenceIdx]);
          if (conf >= 0 && conf <= 100 && conf % 10 === 0) {
            linkConfidence = conf as Confidence;
          }
        }

        // Parse date range
        let dateRange: DateRange | null = null;
        if (dateStartIdx >= 0 && values[dateStartIdx]) {
          const startDate = importedDate(values[dateStartIdx], rowTimeZone(values));
          const endDate = dateEndIdx >= 0 && values[dateEndIdx] ? importedDate(values[dateEndIdx], rowTimeZone(values)) : startDate;
          if (!isNaN(startDate.getTime())) {
            dateRange = {
              start: startDate,
              end: !isNaN(endDate.getTime()) ? endDate : startDate,
              ...importedPrecision(values[dateStartIdx]),
              ...(rowTimeZone(values) ? { timeZone: rowTimeZone(values) } : {}),
            };
          }
        }

        const link: Link = {
          id: generateUUID(),
          dossierId: targetDossierId,
          fromId: fromElement.id,
          toId: toElement.id,
          sourceHandle: null,
          targetHandle: null,
          label: labelIdx >= 0 ? values[labelIdx] || '' : '',
          notes: notesIdx >= 0 ? values[notesIdx] || '' : '',
          tags: [],
          properties: [],
          confidence: linkConfidence,
          source: '',
          date: null,
          dateRange,
          directed: isDirected,
          direction: isDirected ? 'forward' : 'none',
          visual: {
            ...DEFAULT_LINK_VISUAL,
            color: colorIdx >= 0 && values[colorIdx] ? values[colorIdx] : DEFAULT_LINK_VISUAL.color,
            style: styleIdx >= 0 && isValidLinkStyle(values[styleIdx])
              ? (values[styleIdx] as LinkStyle)
              : DEFAULT_LINK_VISUAL.style,
          },
          curveOffset: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.links.add(link);
        result.linksImported++;
      } catch (error) {
        result.warnings.push(`Ligne ${rowNum}: ${error instanceof Error ? error.message : 'Erreur'}`);
      }
      rowNum++;
    }

    // Update dossier timestamp
    await db.dossiers.update(targetDossierId, {
      updatedAt: new Date(),
    });

    result.success = result.linksImported > 0 || result.elementsImported > 0;
    if (result.linksImported > 0) {
      await svc.applyImportDisplaySettings(targetDossierId);
    }
  } catch (error) {
    result.errors.push(`Erreur d'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  return result;
}

/**
 * Normalise le contenu CSV : retire le BOM UTF-8 et harmonise les fins de ligne.
 */
function normalizeCSVContent(content: string): string {
  return stripBom(content).replace(/\r\n?/g, '\n');
}

/**
 * Visual of a CSV-imported element. Explicit CSV color/shape win; empty or
 * invalid cells fall back to the first tag's TagSet defaultVisual (same rule
 * as manual creation in dossierStore), then to DEFAULT_ELEMENT_VISUAL.
 */
function buildCsvElementVisual(tags: string[], colorRaw: string | undefined, shapeRaw: string | undefined): ElementVisual {
  const visual: ElementVisual = { ...DEFAULT_ELEMENT_VISUAL };
  const dv = tags.length > 0 ? useTagSetStore.getState().getByName(tags[0])?.defaultVisual : undefined;
  if (dv) {
    if (dv.color !== null) visual.color = dv.color;
    if (dv.shape !== null) visual.shape = dv.shape;
    if (dv.icon !== null) visual.icon = dv.icon;
  }
  const color = colorRaw?.trim();
  if (color) visual.color = color;
  const shape = shapeRaw?.trim();
  if (shape && isValidShape(shape)) visual.shape = shape.toLowerCase() as ElementShape;
  return visual;
}
