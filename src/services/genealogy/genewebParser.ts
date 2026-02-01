/**
 * GeneWeb Parser Service
 * Parses GeneWeb .gw files (gwplus format)
 */

import type {
  GenealogyData,
  GenealogyPerson,
  GenealogyFamily,
  GenealogyDate,
  GenealogyPlace,
  DateModifier,
  Sex,
} from './types';

interface ParseContext {
  persons: Map<string, GenealogyPerson>;
  families: GenealogyFamily[];
  currentFamily: GenealogyFamily | null;
  currentPerson: GenealogyPerson | null;
  personIdCounter: number;
  familyIdCounter: number;
}

/**
 * Parse a GeneWeb .gw file content into GenealogyData
 */
export function parseGeneWeb(content: string, fileName: string): GenealogyData {
  const lines = content.split(/\r?\n/);
  const context: ParseContext = {
    persons: new Map(),
    families: [],
    currentFamily: null,
    currentPerson: null,
    personIdCounter: 1,
    familyIdCounter: 1,
  };

  let inBlock: 'children' | 'notes' | 'pevt' | 'fevt' | 'rel' | null = null;
  let blockContent: string[] = [];
  let blockTarget: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Handle encoding declaration
    if (trimmed.startsWith('[encoding:')) continue;
    if (trimmed === '[gwplus]') continue;

    // Handle block endings
    if (trimmed === 'end' || trimmed === 'end notes' || trimmed === 'end pevt' || trimmed === 'end fevt' || trimmed === 'end rel') {
      if (inBlock === 'children' && context.currentFamily) {
        parseChildren(blockContent, context);
        // Only reset currentFamily after processing children block
        context.currentFamily = null;
      } else if (inBlock === 'notes' && blockTarget) {
        applyNotes(blockTarget, blockContent.join('\n'), context);
      } else if (inBlock === 'pevt' && blockTarget) {
        applyPersonEvents(blockTarget, blockContent, context);
      } else if (inBlock === 'fevt' && blockTarget) {
        applyFamilyEvents(blockTarget, blockContent, context);
      }
      inBlock = null;
      blockContent = [];
      blockTarget = null;
      // Don't reset currentFamily here - only after children block
      continue;
    }

    // Inside a block
    if (inBlock) {
      blockContent.push(trimmed);
      continue;
    }

    // Parse family line
    if (trimmed.startsWith('fam ')) {
      const family = parseFamilyLine(trimmed.substring(4), context);
      if (family) {
        context.families.push(family);
        context.currentFamily = family;
      }
      continue;
    }

    // Start children block
    if (trimmed === 'beg') {
      inBlock = 'children';
      blockContent = [];
      continue;
    }

    // Start notes block
    if (trimmed.startsWith('notes ')) {
      inBlock = 'notes';
      blockTarget = trimmed.substring(6).trim();
      blockContent = [];
      continue;
    }

    // Start personal events block
    if (trimmed.startsWith('pevt ')) {
      inBlock = 'pevt';
      blockTarget = trimmed.substring(5).trim();
      blockContent = [];
      continue;
    }

    // Start family events block
    if (trimmed.startsWith('fevt ')) {
      inBlock = 'fevt';
      blockTarget = trimmed.substring(5).trim();
      blockContent = [];
      continue;
    }
  }

  // Convert persons map to array
  const persons = Array.from(context.persons.values());

  return {
    format: 'geneweb',
    fileName,
    persons,
    families: context.families,
    metadata: {
      source: 'GeneWeb',
    },
  };
}

/**
 * Parse a family line
 * Format: LASTNAME FirstName [dates] + LASTNAME FirstName [dates]
 * Or: LASTNAME FirstName +DATE #tags LASTNAME FirstName (no separator, just wife starts with lastname)
 */
function parseFamilyLine(line: string, context: ParseContext): GenealogyFamily | null {
  // Find the separator between husband and wife
  const separator = findSpouseSeparator(line);
  if (separator.index === -1) return null;

  let husbandPart: string;
  let wifePart: string;

  if (separator.hasPlus) {
    // Explicit + separator
    husbandPart = line.substring(0, separator.index).trim();
    wifePart = line.substring(separator.index + 1).trim();
  } else {
    // No explicit separator, wife starts at the index
    husbandPart = line.substring(0, separator.index).trim();
    wifePart = line.substring(separator.index).trim();
  }

  // Parse marriage date from husband part (before wife)
  const marriageInfo = extractMarriageInfo(husbandPart);
  const husbandClean = marriageInfo.rest;

  // Parse husband
  const husband = parsePersonFromFamLine(husbandClean, 'M', context);

  // Parse wife
  const wife = parsePersonFromFamLine(wifePart, 'F', context);

  const familyId = `@F${context.familyIdCounter++}@`;

  return {
    id: familyId,
    husbandId: husband?.id,
    wifeId: wife?.id,
    childIds: [],
    marriageDate: marriageInfo.date,
    marriagePlace: marriageInfo.place,
  };
}

/**
 * Find the separator between husband and wife in family line
 * Returns the index where wife's info starts, or -1 if not found
 */
function findSpouseSeparator(line: string): { index: number; hasPlus: boolean } {
  // First, try to find explicit " + " separator (not followed by date)
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '+') {
      const after = line.substring(i + 1).trim();

      // If after the + there's a date pattern, it's a marriage date prefix
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(after)) {
        // Skip this + and continue looking
        continue;
      }

      // If + is followed by a name (uppercase), it's a spouse separator
      if (/^[A-Z]/.test(after)) {
        return { index: i, hasPlus: true };
      }
    }
  }

  // No explicit separator found - try to find wife's lastname after husband's info
  // Pattern: HUSBAND_LASTNAME FirstName [dates] [tags] WIFE_LASTNAME FirstName [dates] [tags]
  // The wife's lastname should be an ALL-CAPS word followed by a capitalized name
  const tokens = line.split(/\s+/);
  let husbandEnd = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenStart = line.indexOf(token, husbandEnd);

    // First token is husband's lastname
    if (i === 0) {
      husbandEnd = tokenStart + token.length;
      continue;
    }

    // Second token is husband's firstname
    if (i === 1) {
      husbandEnd = tokenStart + token.length;
      continue;
    }

    // Skip dates, tags, and marriage info
    if (token.startsWith('#') || token.startsWith('+') || /^\d/.test(token)) {
      husbandEnd = tokenStart + token.length;
      continue;
    }

    // Found an uppercase word that could be wife's lastname
    // Must be all uppercase or first uppercase letter with rest lowercase (lastname)
    if (/^[A-Z][A-Z]+$/.test(token) && i + 1 < tokens.length) {
      // Check if next token looks like a firstname (capitalized)
      const nextToken = tokens[i + 1];
      if (/^[A-Z][a-zéèêëàâäùûüôöîïç]*$/.test(nextToken)) {
        return { index: tokenStart, hasPlus: false };
      }
    }
  }

  return { index: -1, hasPlus: false };
}

/**
 * Extract marriage info from the husband part
 */
function extractMarriageInfo(part: string): { date?: GenealogyDate; place?: GenealogyPlace; rest: string } {
  let date: GenealogyDate | undefined;
  let place: GenealogyPlace | undefined;
  let rest = part;

  // Look for +DATE pattern (marriage date)
  const dateMatch = rest.match(/\+(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) {
    date = parseGwDate(dateMatch[1]);
    rest = rest.replace(dateMatch[0], '').trim();
  }

  // Look for #mp PLACE (marriage place)
  const placeMatch = rest.match(/#mp\s+(\S+)/);
  if (placeMatch) {
    place = { name: placeMatch[1].replace(/_/g, ' ') };
    rest = rest.replace(placeMatch[0], '').trim();
  }

  return { date, place, rest };
}

/**
 * Parse a person from a family line part
 */
function parsePersonFromFamLine(part: string, defaultSex: Sex, context: ParseContext): GenealogyPerson | null {
  if (!part.trim()) return null;

  // Extract tags first
  const tags = extractTags(part);
  let cleanPart = part;

  // Remove all tags from the string
  for (const [tag] of Object.entries(tags)) {
    const pattern = new RegExp(`#${tag}\\s+\\S+`, 'g');
    cleanPart = cleanPart.replace(pattern, '').trim();
  }

  // Parse: LASTNAME FirstName [dates]
  const tokens = cleanPart.split(/\s+/);
  if (tokens.length < 2) return null;

  const lastName = tokens[0].replace(/_/g, ' ');
  const firstName = tokens[1].replace(/_/g, ' ');

  // Look for dates
  let birthDate: GenealogyDate | undefined;
  let birthPlace: GenealogyPlace | undefined;
  let deathDate: GenealogyDate | undefined;
  let deathPlace: GenealogyPlace | undefined;

  // Parse remaining tokens for dates
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];

    // Date pattern
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(token)) {
      if (!birthDate) {
        birthDate = parseGwDate(token);
      } else if (!deathDate) {
        deathDate = parseGwDate(token);
      }
    }
  }

  // Apply tags
  if (tags.bp) birthPlace = { name: tags.bp.replace(/_/g, ' ') };
  if (tags.dp) deathPlace = { name: tags.dp.replace(/_/g, ' ') };

  // Generate or find person
  const personKey = `${lastName}_${firstName}`;
  let person = context.persons.get(personKey);

  if (!person) {
    const id = `@I${context.personIdCounter++}@`;
    person = {
      id,
      firstName,
      lastName,
      sex: defaultSex,
      birthDate,
      birthPlace,
      deathDate,
      deathPlace,
      occupation: tags.occu?.replace(/_/g, ' '),
      familiesAsSpouse: [],
    };
    context.persons.set(personKey, person);
  } else {
    // Update existing person with new info
    if (birthDate && !person.birthDate) person.birthDate = birthDate;
    if (birthPlace && !person.birthPlace) person.birthPlace = birthPlace;
    if (deathDate && !person.deathDate) person.deathDate = deathDate;
    if (deathPlace && !person.deathPlace) person.deathPlace = deathPlace;
    if (tags.occu && !person.occupation) person.occupation = tags.occu.replace(/_/g, ' ');
  }

  return person;
}

/**
 * Extract tags from a line (#bp, #dp, #occu, etc.)
 */
function extractTags(line: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const pattern = /#(\w+)\s+(\S+)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    tags[match[1]] = match[2];
  }

  return tags;
}

/**
 * Parse children from beg/end block
 */
function parseChildren(lines: string[], context: ParseContext): void {
  if (!context.currentFamily) return;

  for (const line of lines) {
    if (!line.startsWith('-')) continue;

    // Format: - h|f FirstName [#tags] [dates]
    const match = line.match(/^-\s+(h|f)\s+(\S+)/);
    if (!match) continue;

    const sex: Sex = match[1] === 'h' ? 'M' : 'F';
    const firstName = match[2].replace(/_/g, ' ');

    // Get last name from parents
    let lastName = '';
    if (context.currentFamily.husbandId) {
      const husband = findPersonById(context.currentFamily.husbandId, context);
      if (husband) lastName = husband.lastName;
    }

    // Extract additional info
    const tags = extractTags(line);
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);

    const personKey = `${lastName}_${firstName}`;
    let child = context.persons.get(personKey);

    if (!child) {
      const id = `@I${context.personIdCounter++}@`;
      child = {
        id,
        firstName,
        lastName,
        sex,
        birthDate: dateMatch ? parseGwDate(dateMatch[1]) : undefined,
        birthPlace: tags.bp ? { name: tags.bp.replace(/_/g, ' ') } : undefined,
        occupation: tags.occu?.replace(/_/g, ' '),
        familyAsChild: context.currentFamily.id,
        familiesAsSpouse: [],
      };
      context.persons.set(personKey, child);
    }

    context.currentFamily.childIds.push(child.id);
  }
}

/**
 * Apply notes to a person
 */
function applyNotes(target: string, notes: string, context: ParseContext): void {
  // Target format: LASTNAME FirstName
  const parts = target.split(/\s+/);
  if (parts.length < 2) return;

  const lastName = parts[0].replace(/_/g, ' ');
  const firstName = parts[1].replace(/_/g, ' ');
  const personKey = `${lastName}_${firstName}`;

  const person = context.persons.get(personKey);
  if (person) {
    person.notes = notes;
  }
}

/**
 * Apply personal events to a person
 */
function applyPersonEvents(target: string, lines: string[], context: ParseContext): void {
  const parts = target.split(/\s+/);
  if (parts.length < 2) return;

  const lastName = parts[0].replace(/_/g, ' ');
  const firstName = parts[1].replace(/_/g, ' ');
  const personKey = `${lastName}_${firstName}`;

  const person = context.persons.get(personKey);
  if (!person) return;

  for (const line of lines) {
    if (line.startsWith('#birt')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const placeMatch = line.match(/#p\s+(\S+)/);
      if (dateMatch) person.birthDate = parseGwDate(dateMatch[1]);
      if (placeMatch) person.birthPlace = { name: placeMatch[1].replace(/_/g, ' ') };
    } else if (line.startsWith('#deat')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const placeMatch = line.match(/#p\s+(\S+)/);
      if (dateMatch) person.deathDate = parseGwDate(dateMatch[1]);
      if (placeMatch) person.deathPlace = { name: placeMatch[1].replace(/_/g, ' ') };
    } else if (line.startsWith('#occu')) {
      const match = line.match(/#occu\s+(\S+)/);
      if (match) person.occupation = match[1].replace(/_/g, ' ');
    } else if (line.startsWith('#resi')) {
      // Handle residence (simplified)
      const dateMatch = line.match(/(\d{4})\.\.(\d{4})/);
      const placeMatch = line.match(/#p\s+(\S+)/);
      if (dateMatch || placeMatch) {
        if (!person.residences) person.residences = [];
        person.residences.push({
          startDate: dateMatch ? { year: parseInt(dateMatch[1]), modifier: 'exact', raw: dateMatch[0] } : undefined,
          endDate: dateMatch ? { year: parseInt(dateMatch[2]), modifier: 'exact', raw: dateMatch[0] } : undefined,
          place: placeMatch ? { name: placeMatch[1].replace(/_/g, ' ') } : undefined,
        });
      }
    }
  }
}

/**
 * Apply family events (marriage, divorce)
 */
function applyFamilyEvents(target: string, lines: string[], context: ParseContext): void {
  // Find the family by the husband's name
  const parts = target.split(/\s+/);
  if (parts.length < 2) return;

  const lastName = parts[0].replace(/_/g, ' ');
  const firstName = parts[1].replace(/_/g, ' ');
  const personKey = `${lastName}_${firstName}`;

  const person = context.persons.get(personKey);
  if (!person) return;

  // Find family where this person is husband
  const family = context.families.find(f => f.husbandId === person.id);
  if (!family) return;

  for (const line of lines) {
    if (line.startsWith('#marr')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const placeMatch = line.match(/#p\s+(\S+)/);
      if (dateMatch) family.marriageDate = parseGwDate(dateMatch[1]);
      if (placeMatch) family.marriagePlace = { name: placeMatch[1].replace(/_/g, ' ') };
    } else if (line.startsWith('#div')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) family.divorceDate = parseGwDate(dateMatch[1]);
    }
  }
}

/**
 * Find a person by ID
 */
function findPersonById(id: string, context: ParseContext): GenealogyPerson | undefined {
  for (const person of context.persons.values()) {
    if (person.id === id) return person;
  }
  return undefined;
}

/**
 * Parse GeneWeb date format (dd/mm/yyyy)
 */
function parseGwDate(dateStr: string): GenealogyDate {
  let modifier: DateModifier = 'exact';
  let cleanDate = dateStr;

  // Handle modifiers
  if (cleanDate.startsWith('~')) {
    modifier = 'about';
    cleanDate = cleanDate.substring(1);
  } else if (cleanDate.startsWith('?')) {
    modifier = 'about';
    cleanDate = cleanDate.substring(1);
  } else if (cleanDate.startsWith('<')) {
    modifier = 'before';
    cleanDate = cleanDate.substring(1);
  } else if (cleanDate.startsWith('>')) {
    modifier = 'after';
    cleanDate = cleanDate.substring(1);
  }

  const parts = cleanDate.split('/');
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;

  if (parts.length === 3) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    month = parseInt(parts[0], 10);
    year = parseInt(parts[1], 10);
  } else if (parts.length === 1) {
    year = parseInt(parts[0], 10);
  }

  // Validate
  if (day && (isNaN(day) || day < 1 || day > 31)) day = undefined;
  if (month && (isNaN(month) || month < 1 || month > 12)) month = undefined;
  if (year && isNaN(year)) year = undefined;

  return { day, month, year, modifier, raw: dateStr };
}

/**
 * Check if a file is a GeneWeb file
 */
export function isGeneWebFile(content: string): boolean {
  // GeneWeb files typically start with encoding declaration or fam
  const firstLines = content.substring(0, 500).toLowerCase();
  return (
    firstLines.includes('[encoding:') ||
    firstLines.includes('[gwplus]') ||
    /^fam\s+/m.test(content)
  );
}
