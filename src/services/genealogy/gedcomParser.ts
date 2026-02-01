/**
 * GEDCOM Parser Service
 * Parses GEDCOM 5.5.1 and 7.0 files using read-gedcom library
 */

import { readGedcom } from 'read-gedcom';
import type {
  GenealogyData,
  GenealogyPerson,
  GenealogyFamily,
  GenealogyDate,
  GenealogyPlace,
  GenealogyResidence,
  DateModifier,
  Sex,
} from './types';

/**
 * Preprocess GEDCOM content to normalize format
 * - Remove comments (lines starting with #)
 * - Remove empty lines
 * - Fix level 0 records that are missing the "0 " prefix (some exporters omit it)
 */
function preprocessGedcom(buffer: ArrayBuffer): ArrayBuffer {
  // Convert to Uint8Array for compatibility
  const uint8 = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(uint8);

  // Process lines
  const lines = content.split(/\r?\n/);
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comment lines
    if (trimmed.startsWith('#')) continue;
    // Skip empty lines
    if (trimmed === '') continue;

    // Fix lines that start with @ (pointer) but are missing the level 0 prefix
    // Standard format: "0 @I1@ INDI" but some files have "@I1@ INDI"
    if (trimmed.startsWith('@') && !trimmed.startsWith('0 ')) {
      cleanedLines.push('0 ' + trimmed);
    } else {
      cleanedLines.push(line);
    }
  }

  const cleanedContent = cleanedLines.join('\r\n'); // Use CRLF for GEDCOM
  const encoder = new TextEncoder();
  const encoded = encoder.encode(cleanedContent);
  // Return a proper ArrayBuffer copy
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

/**
 * Parse a GEDCOM file buffer into GenealogyData
 */
export async function parseGedcom(
  buffer: ArrayBuffer,
  fileName: string
): Promise<GenealogyData> {
  // Preprocess to remove comments and problematic empty lines
  const cleanedBuffer = preprocessGedcom(buffer);
  const gedcom = readGedcom(cleanedBuffer);

  // Detect version from header
  const header = gedcom.getHeader();

  // Try to get GEDCOM version - API varies by library version
  let gedcomVersion = '5.5.1';
  try {
    const gedcRecord = header.get('GEDC');
    if (gedcRecord.length > 0) {
      const versRecord = gedcRecord.get('VERS');
      if (versRecord.length > 0) {
        gedcomVersion = versRecord.value()[0] || '5.5.1';
      }
    }
  } catch {
    // Fallback
  }
  const format = gedcomVersion.startsWith('7') ? 'gedcom-7.0' : 'gedcom-5.5.1';

  // Parse metadata
  let source: string | undefined;
  let language: string | undefined;
  let encoding: string | undefined;

  try {
    const sourRecord = header.get('SOUR');
    if (sourRecord.length > 0) {
      source = sourRecord.value()[0] || undefined;
    }
  } catch { /* ignore */ }

  try {
    const langRecord = header.get('LANG');
    if (langRecord.length > 0) {
      language = langRecord.value()[0] || undefined;
    }
  } catch { /* ignore */ }

  try {
    const charRecord = header.get('CHAR');
    if (charRecord.length > 0) {
      encoding = charRecord.value()[0] || undefined;
    }
  } catch { /* ignore */ }

  const metadata = {
    source,
    version: gedcomVersion,
    language,
    encoding,
  };

  // Parse individuals
  const persons: GenealogyPerson[] = [];
  const indiRecords = gedcom.getIndividualRecord();

  for (let i = 0; i < indiRecords.length; i++) {
    const indi = indiRecords.arraySelect()[i];
    const person = parseIndividual(indi);
    if (person) {
      persons.push(person);
    }
  }

  // Parse families
  const families: GenealogyFamily[] = [];
  const famRecords = gedcom.getFamilyRecord();

  for (let i = 0; i < famRecords.length; i++) {
    const fam = famRecords.arraySelect()[i];
    const family = parseFamily(fam);
    if (family) {
      families.push(family);
    }
  }

  return {
    format,
    fileName,
    persons,
    families,
    metadata,
  };
}

/**
 * Parse an individual record into GenealogyPerson
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseIndividual(indi: any): GenealogyPerson | null {
  try {
    const id = indi.pointer()[0];
    if (!id) return null;

    // Parse name - use generic get() API
    const nameRecord = indi.get('NAME');
    const fullName = nameRecord.value()[0] || '';

    // Try to get structured name parts
    let firstName = extractFirstName(fullName);
    let lastName = extractLastName(fullName);

    try {
      const givn = nameRecord.get('GIVN');
      if (givn.length > 0) firstName = givn.value()[0] || firstName;
      const surn = nameRecord.get('SURN');
      if (surn.length > 0) lastName = surn.value()[0] || lastName;
    } catch { /* Use extracted values */ }

    // Parse sex
    let sex: Sex = 'U';
    try {
      const sexRecord = indi.get('SEX');
      if (sexRecord.length > 0) {
        const sexValue = sexRecord.value()[0];
        sex = sexValue === 'M' ? 'M' : sexValue === 'F' ? 'F' : 'U';
      }
    } catch { /* Use unknown */ }

    // Parse birth
    let birthDate: GenealogyDate | undefined;
    let birthPlace: GenealogyPlace | undefined;
    try {
      const birth = indi.get('BIRT');
      if (birth.length > 0) {
        birthDate = parseEventDate(birth);
        birthPlace = parseEventPlace(birth);
      }
    } catch { /* ignore */ }

    // Parse death
    let deathDate: GenealogyDate | undefined;
    let deathPlace: GenealogyPlace | undefined;
    try {
      const death = indi.get('DEAT');
      if (death.length > 0) {
        deathDate = parseEventDate(death);
        deathPlace = parseEventPlace(death);
      }
    } catch { /* ignore */ }

    // Parse occupation
    let occupation: string | undefined;
    try {
      const occu = indi.get('OCCU');
      if (occu.length > 0) {
        occupation = occu.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    // Parse nickname (NICK)
    let nickname: string | undefined;
    try {
      const nick = nameRecord.get('NICK');
      if (nick.length > 0) {
        nickname = nick.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    // Parse title (TITL)
    let title: string | undefined;
    try {
      const titl = indi.get('TITL');
      if (titl.length > 0) {
        title = titl.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    // Parse notes
    let notes: string | undefined;
    try {
      const noteRecord = indi.get('NOTE');
      if (noteRecord.length > 0) {
        notes = noteRecord.value().filter(Boolean).join('\n') || undefined;
      }
    } catch { /* ignore */ }

    // Parse residences (GEDCOM 7.0)
    const residences = parseResidences(indi);

    // Parse family references - these contain pointer references as values
    let familyAsChild: string | undefined;
    let familiesAsSpouse: string[] = [];

    try {
      const famc = indi.get('FAMC');
      if (famc.length > 0) {
        // The pointer reference is stored as the value of FAMC
        familyAsChild = famc.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    try {
      const fams = indi.get('FAMS');
      if (fams.length > 0) {
        // The pointer references are stored as values
        familiesAsSpouse = fams.value().filter(Boolean) as string[];
      }
    } catch { /* ignore */ }

    return {
      id,
      firstName,
      lastName,
      sex,
      birthDate,
      birthPlace,
      deathDate,
      deathPlace,
      occupation,
      nickname,
      title,
      notes,
      residences,
      familyAsChild,
      familiesAsSpouse,
    };
  } catch (error) {
    console.warn('Failed to parse individual:', error);
    return null;
  }
}

/**
 * Parse a family record into GenealogyFamily
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFamily(fam: any): GenealogyFamily | null {
  try {
    const id = fam.pointer()[0];
    if (!id) return null;

    // Parse spouses - pointer references are stored as values
    let husbandId: string | undefined;
    let wifeId: string | undefined;

    try {
      const husb = fam.get('HUSB');
      if (husb.length > 0) {
        husbandId = husb.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    try {
      const wife = fam.get('WIFE');
      if (wife.length > 0) {
        wifeId = wife.value()[0] || undefined;
      }
    } catch { /* ignore */ }

    // Parse children - handle both standard CHIL and non-standard CHILD tags
    let childIds: string[] = [];
    try {
      // Try standard CHIL first
      let chil = fam.get('CHIL');
      // Also try CHILD (some files use non-standard tag)
      if (chil.length === 0) {
        chil = fam.get('CHILD');
      }
      if (chil.length > 0) {
        childIds = chil.value().filter(Boolean) as string[];
      }
    } catch { /* ignore */ }

    // Parse marriage
    let marriageDate: GenealogyDate | undefined;
    let marriagePlace: GenealogyPlace | undefined;
    try {
      const marr = fam.get('MARR');
      if (marr.length > 0) {
        marriageDate = parseEventDate(marr);
        marriagePlace = parseEventPlace(marr);
      }
    } catch { /* ignore */ }

    // Parse divorce
    let divorceDate: GenealogyDate | undefined;
    try {
      const div = fam.get('DIV');
      if (div.length > 0) {
        divorceDate = parseEventDate(div);
      }
    } catch { /* ignore */ }

    // Parse notes
    let notes: string | undefined;
    try {
      const noteRecord = fam.get('NOTE');
      if (noteRecord.length > 0) {
        notes = noteRecord.value().filter(Boolean).join('\n') || undefined;
      }
    } catch { /* ignore */ }

    return {
      id,
      husbandId,
      wifeId,
      childIds,
      marriageDate,
      marriagePlace,
      divorceDate,
      notes,
    };
  } catch (error) {
    console.warn('Failed to parse family:', error);
    return null;
  }
}

/**
 * Parse date from an event
 * Uses get('DATE') instead of getDate() for better compatibility across record types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventDate(event: any): GenealogyDate | undefined {
  try {
    // Use get('DATE') - more reliable than getDate() which doesn't exist on all selections
    const dateRecord = event.get('DATE');
    if (dateRecord.length === 0) return undefined;

    const rawDate = dateRecord.value()[0];
    if (!rawDate) return undefined;

    // Try to parse structured date using valueAsDate if available
    try {
      const parsedDates = dateRecord.valueAsDate();
      if (parsedDates.length > 0 && parsedDates[0]) {
        const parsed = parsedDates[0];

        // Handle different date types from read-gedcom
        if ('date' in parsed && parsed.date) {
          const date = parsed.date;
          return {
            day: date.day || undefined,
            month: date.month || undefined,
            year: date.year || undefined,
            modifier: getModifier(parsed),
            raw: rawDate,
          };
        }

        // Handle period dates (FROM ... TO ...)
        if ('dateFrom' in parsed || 'dateTo' in parsed) {
          const dateFrom = 'dateFrom' in parsed ? parsed.dateFrom : undefined;
          const dateTo = 'dateTo' in parsed ? parsed.dateTo : undefined;
          const startDate = dateFrom?.date;
          const endDate = dateTo?.date;

          return {
            day: startDate?.day || undefined,
            month: startDate?.month || undefined,
            year: startDate?.year || undefined,
            modifier: 'between',
            endYear: endDate?.year || undefined,
            raw: rawDate,
          };
        }
      }
    } catch {
      // valueAsDate not available or failed, continue to raw parsing
    }

    // Fallback: parse raw date string
    return parseRawDate(rawDate);
  } catch {
    return undefined;
  }
}

/**
 * Get date modifier from parsed date
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModifier(parsed: any): DateModifier {
  if ('isApproximate' in parsed && parsed.isApproximate) return 'about';
  if ('isBefore' in parsed && parsed.isBefore) return 'before';
  if ('isAfter' in parsed && parsed.isAfter) return 'after';
  if ('dateFrom' in parsed || 'dateTo' in parsed) return 'between';
  return 'exact';
}

/**
 * Parse raw date string (fallback)
 * GEDCOM dates are typically "DD MMM YYYY" (e.g., "12 MAR 1920")
 */
function parseRawDate(raw: string): GenealogyDate {
  const modifier = detectModifier(raw);
  const cleanDate = raw
    .replace(/^(ABT|ABOUT|EST|CAL|BEF|BEFORE|AFT|AFTER|BET|FROM|TO)\s*/i, '')
    .replace(/\s*(AND|TO)\s*.*/i, '');

  // Try to extract components - GEDCOM format is "DD MMM YYYY"
  const parts = cleanDate.trim().split(/\s+/);
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      if (num > 31) {
        // Must be a year (e.g., 1920)
        year = num;
      } else if (day === undefined && num >= 1 && num <= 31) {
        // First number 1-31 is the day
        day = num;
      }
    } else {
      // Try to parse as month name
      const monthNum = parseMonth(part);
      if (monthNum) month = monthNum;
    }
  }

  return { day, month, year, modifier, raw };
}

/**
 * Detect modifier from raw date string
 */
function detectModifier(raw: string): DateModifier {
  const upper = raw.toUpperCase();
  if (upper.startsWith('ABT') || upper.startsWith('ABOUT') || upper.startsWith('EST') || upper.startsWith('CAL')) {
    return 'about';
  }
  if (upper.startsWith('BEF') || upper.startsWith('BEFORE')) {
    return 'before';
  }
  if (upper.startsWith('AFT') || upper.startsWith('AFTER')) {
    return 'after';
  }
  if (upper.startsWith('BET') || upper.startsWith('FROM')) {
    return 'between';
  }
  return 'exact';
}

/**
 * Parse month name to number
 */
function parseMonth(name: string): number | undefined {
  const months: Record<string, number> = {
    JAN: 1, JANUARY: 1, JANVIER: 1,
    FEB: 2, FEBRUARY: 2, FEVRIER: 2, FÉVRIER: 2,
    MAR: 3, MARCH: 3, MARS: 3,
    APR: 4, APRIL: 4, AVRIL: 4,
    MAY: 5, MAI: 5,
    JUN: 6, JUNE: 6, JUIN: 6,
    JUL: 7, JULY: 7, JUILLET: 7,
    AUG: 8, AUGUST: 8, AOUT: 8, AOÛT: 8,
    SEP: 9, SEPT: 9, SEPTEMBER: 9, SEPTEMBRE: 9,
    OCT: 10, OCTOBER: 10, OCTOBRE: 10,
    NOV: 11, NOVEMBER: 11, NOVEMBRE: 11,
    DEC: 12, DECEMBER: 12, DECEMBRE: 12, DÉCEMBRE: 12,
  };
  return months[name.toUpperCase()];
}

/**
 * Parse place from an event
 * Uses get('PLAC') instead of getPlace() for better compatibility across record types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventPlace(event: any): GenealogyPlace | undefined {
  try {
    // Use get('PLAC') - more reliable than getPlace() which doesn't exist on all selections
    const placeRecord = event.get('PLAC');
    if (placeRecord.length === 0) return undefined;

    const name = placeRecord.value()[0];
    if (!name) return undefined;

    // Try to get coordinates (GEDCOM 7.0 MAP tag)
    let lat: number | undefined;
    let lng: number | undefined;

    try {
      const mapRecord = placeRecord.get('MAP');
      if (mapRecord.length > 0) {
        const latRecord = mapRecord.get('LATI');
        const lngRecord = mapRecord.get('LONG');

        if (latRecord.length > 0) {
          const latValue = latRecord.value()[0];
          if (latValue) lat = parseCoordinate(latValue);
        }
        if (lngRecord.length > 0) {
          const lngValue = lngRecord.value()[0];
          if (lngValue) lng = parseCoordinate(lngValue);
        }
      }
    } catch {
      // MAP tag not available (GEDCOM 5.5.1)
    }

    return { name, lat, lng };
  } catch {
    return undefined;
  }
}

/**
 * Parse coordinate string (e.g., "N45.764043" or "E4.835659")
 */
function parseCoordinate(coord: string): number | undefined {
  if (!coord) return undefined;

  const match = coord.match(/^([NSEW])?(-?\d+\.?\d*)$/i);
  if (!match) return undefined;

  const direction = match[1]?.toUpperCase();
  let value = parseFloat(match[2]);

  if (isNaN(value)) return undefined;

  // Handle direction prefix
  if (direction === 'S' || direction === 'W') {
    value = -value;
  }

  return value;
}

/**
 * Parse residences from individual (GEDCOM 7.0 RESI)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResidences(indi: any): GenealogyResidence[] {
  const residences: GenealogyResidence[] = [];

  try {
    const resiEvents = indi.getEventResidence();
    for (let i = 0; i < resiEvents.length; i++) {
      const resi = resiEvents.arraySelect()[i];
      const date = parseEventDate(resi);
      const place = parseEventPlace(resi);

      if (date || place) {
        residences.push({
          startDate: date,
          place,
        });
      }
    }
  } catch {
    // RESI not available
  }

  return residences;
}

/**
 * Extract first name from full name string
 */
function extractFirstName(fullName: string): string {
  // GEDCOM format: "First /LAST/"
  const match = fullName.match(/^([^/]+)/);
  return match ? match[1].trim() : fullName;
}

/**
 * Extract last name from full name string
 */
function extractLastName(fullName: string): string {
  // GEDCOM format: "First /LAST/"
  const match = fullName.match(/\/([^/]+)\//);
  return match ? match[1].trim() : '';
}

/**
 * Check if a file is a GEDCOM file based on content
 */
export function isGedcomFile(content: string): boolean {
  // GEDCOM files start with "0 HEAD"
  return content.trimStart().startsWith('0 HEAD');
}

/**
 * Detect GEDCOM version from file content
 */
export function detectGedcomVersion(content: string): 'gedcom-5.5.1' | 'gedcom-7.0' | null {
  const match = content.match(/1\s+GEDC[\r\n]+2\s+VERS\s+(\d+)/);
  if (!match) return null;

  const version = parseInt(match[1], 10);
  return version >= 7 ? 'gedcom-7.0' : 'gedcom-5.5.1';
}
