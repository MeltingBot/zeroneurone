/**
 * Genealogy Import Service
 * Main orchestrator for importing GEDCOM and GeneWeb files
 */

import type { Element, Link, InvestigationId } from '../../types';
import type {
  GenealogyData,
  GenealogyImportOptions,
  GenealogyImportResult,
} from './types';
import { DEFAULT_GENEALOGY_IMPORT_OPTIONS } from './types';
import { parseGedcom, isGedcomFile } from './gedcomParser';
import { parseGeneWeb, isGeneWebFile } from './genewebParser';
import { convertToZeroNeurone } from './genealogyConverter';
import { applyGenealogyLayout, calculateBoundingBox, offsetPositions } from './genealogyLayout';

/**
 * Detect the file format from content
 */
export function detectGenealogyFormat(
  content: string
): 'gedcom' | 'geneweb' | null {
  if (isGedcomFile(content)) return 'gedcom';
  if (isGeneWebFile(content)) return 'geneweb';
  return null;
}

/**
 * Detect the file format from filename
 */
export function detectGenealogyFormatFromName(
  fileName: string
): 'gedcom' | 'geneweb' | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'ged') return 'gedcom';
  if (ext === 'gw') return 'geneweb';
  return null;
}

/**
 * Check if a file is a genealogy file
 */
export function isGenealogyFile(fileName: string): boolean {
  return detectGenealogyFormatFromName(fileName) !== null;
}

/**
 * Parse a genealogy file (GEDCOM or GeneWeb)
 */
export async function parseGenealogyFile(
  file: File
): Promise<GenealogyData> {
  const format = detectGenealogyFormatFromName(file.name);

  if (format === 'gedcom') {
    const buffer = await file.arrayBuffer();
    return parseGedcom(buffer, file.name);
  } else if (format === 'geneweb') {
    const content = await file.text();
    return parseGeneWeb(content, file.name);
  }

  throw new Error(`Unsupported genealogy file format: ${file.name}`);
}

/**
 * Import a genealogy file into an investigation
 * Returns elements and links ready to be added to the investigation
 */
export async function importGenealogyFile(
  file: File,
  investigationId: InvestigationId,
  options: Partial<GenealogyImportOptions> = {}
): Promise<{
  elements: Partial<Element>[];
  links: Partial<Link>[];
  result: GenealogyImportResult;
}> {
  const mergedOptions: GenealogyImportOptions = {
    ...DEFAULT_GENEALOGY_IMPORT_OPTIONS,
    ...options,
  };

  // Parse the file
  const data = await parseGenealogyFile(file);

  // Convert to ZeroNeurone format
  const { elements, links, warnings } = convertToZeroNeurone(
    data,
    investigationId,
    mergedOptions
  );

  // Apply layout if requested
  if (mergedOptions.autoLayout) {
    applyGenealogyLayout(elements, links, mergedOptions);

    // Normalize positions to start from origin
    const bbox = calculateBoundingBox(elements);
    offsetPositions(elements, -bbox.minX, -bbox.minY);
  }

  return {
    elements,
    links,
    result: {
      elementCount: elements.length,
      linkCount: links.length,
      warnings,
      errors: [],
    },
  };
}

/**
 * Get import preview statistics
 */
export async function getGenealogyImportPreview(
  file: File
): Promise<{
  format: string;
  personCount: number;
  familyCount: number;
  hasCoordinates: boolean;
  dateRange: { earliest?: string; latest?: string };
}> {
  const data = await parseGenealogyFile(file);

  // Check for coordinates
  const hasCoordinates = data.persons.some(
    p =>
      (p.birthPlace?.lat != null && p.birthPlace?.lng != null) ||
      (p.deathPlace?.lat != null && p.deathPlace?.lng != null)
  );

  // Find date range
  let earliest: number | undefined;
  let latest: number | undefined;

  for (const person of data.persons) {
    if (person.birthDate?.year) {
      if (earliest === undefined || person.birthDate.year < earliest) {
        earliest = person.birthDate.year;
      }
      if (latest === undefined || person.birthDate.year > latest) {
        latest = person.birthDate.year;
      }
    }
    if (person.deathDate?.year) {
      if (latest === undefined || person.deathDate.year > latest) {
        latest = person.deathDate.year;
      }
    }
  }

  return {
    format: data.format,
    personCount: data.persons.length,
    familyCount: data.families.length,
    hasCoordinates,
    dateRange: {
      earliest: earliest?.toString(),
      latest: latest?.toString(),
    },
  };
}

// Re-export types and options
export { DEFAULT_GENEALOGY_IMPORT_OPTIONS } from './types';
export type { GenealogyImportOptions, GenealogyImportResult } from './types';
