/**
 * Genealogy Import Types
 * Intermediate model for GEDCOM and GeneWeb parsing
 */

// =============================================================================
// DATE HANDLING
// =============================================================================

export type DateModifier = 'exact' | 'about' | 'before' | 'after' | 'between';

export interface GenealogyDate {
  day?: number;
  month?: number;
  year?: number;
  modifier: DateModifier;
  /** For 'between' modifier: end year */
  endYear?: number;
  /** Original date string from source */
  raw: string;
}

// =============================================================================
// PLACE HANDLING
// =============================================================================

export interface GenealogyPlace {
  /** Full place name (e.g., "Lyon, Rhône, France") */
  name: string;
  /** Latitude (GEDCOM 7.0 MAP tag) */
  lat?: number;
  /** Longitude (GEDCOM 7.0 MAP tag) */
  lng?: number;
}

// =============================================================================
// RESIDENCE (GEDCOM 7.0 RESI)
// =============================================================================

export interface GenealogyResidence {
  startDate?: GenealogyDate;
  endDate?: GenealogyDate;
  place?: GenealogyPlace;
}

// =============================================================================
// PERSON (INDI)
// =============================================================================

export type Sex = 'M' | 'F' | 'U';

export interface GenealogyPerson {
  /** Original ID from source (e.g., @I1@) */
  id: string;
  /** First name (GIVN) */
  firstName: string;
  /** Last name / surname (SURN) */
  lastName: string;
  /** Sex: M, F, or U (unknown) */
  sex: Sex;

  // Life events
  birthDate?: GenealogyDate;
  birthPlace?: GenealogyPlace;
  deathDate?: GenealogyDate;
  deathPlace?: GenealogyPlace;

  // Additional data
  occupation?: string;
  nickname?: string;
  title?: string;
  notes?: string;

  // Residences (GEDCOM 7.0)
  residences?: GenealogyResidence[];

  // Family references
  /** Family ID where this person is a child */
  familyAsChild?: string;
  /** Family IDs where this person is a spouse */
  familiesAsSpouse: string[];
}

// =============================================================================
// FAMILY (FAM)
// =============================================================================

export interface GenealogyFamily {
  /** Original ID from source (e.g., @F1@) */
  id: string;
  /** Husband/father ID */
  husbandId?: string;
  /** Wife/mother ID */
  wifeId?: string;
  /** Children IDs */
  childIds: string[];

  // Marriage info
  marriageDate?: GenealogyDate;
  marriagePlace?: GenealogyPlace;

  // Divorce info
  divorceDate?: GenealogyDate;

  // Notes
  notes?: string;
}

// =============================================================================
// PARSED RESULT
// =============================================================================

export interface GenealogyData {
  /** Source format */
  format: 'gedcom-5.5.1' | 'gedcom-7.0' | 'geneweb';
  /** Source file name */
  fileName: string;
  /** All individuals */
  persons: GenealogyPerson[];
  /** All families */
  families: GenealogyFamily[];
  /** Metadata from header */
  metadata: {
    /** Software that created the file */
    source?: string;
    /** GEDCOM version */
    version?: string;
    /** Language */
    language?: string;
    /** Character encoding */
    encoding?: string;
  };
}

// =============================================================================
// IMPORT OPTIONS
// =============================================================================

export interface GenealogyImportOptions {
  // Layout
  /** Automatically position elements in tree layout */
  autoLayout: boolean;
  /** Layout direction: Top-Bottom or Bottom-Top */
  layoutDirection: 'TB' | 'BT';

  // Links
  /** Create sibling links (can generate many links) */
  createSiblingLinks: boolean;

  // Visual
  /** Color elements by gender */
  colorByGender: boolean;

  // Data
  /** Import notes as element description */
  importNotes: boolean;
  /** Import occupation as property */
  importOccupation: boolean;

  // Tags
  /** Add 'Généalogie' tag to all imported elements */
  addGenealogyTag: boolean;
}

export const DEFAULT_GENEALOGY_IMPORT_OPTIONS: GenealogyImportOptions = {
  autoLayout: true,
  layoutDirection: 'TB',
  createSiblingLinks: false,
  colorByGender: true,
  importNotes: true,
  importOccupation: true,
  addGenealogyTag: true,
};

// =============================================================================
// IMPORT RESULT
// =============================================================================

export interface GenealogyImportResult {
  /** Number of elements created */
  elementCount: number;
  /** Number of links created */
  linkCount: number;
  /** Warnings during import */
  warnings: string[];
  /** Errors during import (non-fatal) */
  errors: string[];
}
