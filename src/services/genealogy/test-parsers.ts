/**
 * Test script for genealogy parsers
 * Run with: npx tsx src/services/genealogy/test-parsers.ts
 */

import { readFileSync } from 'fs';
import { parseGedcom } from './gedcomParser';
import { parseGeneWeb } from './genewebParser';

async function testParsers() {
  console.log('=== Testing GEDCOM 5.5.1 Parser ===\n');

  try {
    // Read as string first, then convert to ArrayBuffer properly
    const gedcom551Text = readFileSync('doc_perso/exemple_arbre.ged', 'utf-8');
    const encoder = new TextEncoder();
    const gedcom551Buffer = encoder.encode(gedcom551Text).buffer;
    const gedcom551 = await parseGedcom(gedcom551Buffer, 'exemple_arbre.ged');

    console.log(`Format: ${gedcom551.format}`);
    console.log(`Persons: ${gedcom551.persons.length}`);
    console.log(`Families: ${gedcom551.families.length}`);
    console.log('\nFirst 3 persons:');
    for (const person of gedcom551.persons.slice(0, 3)) {
      console.log(`  - ${person.firstName} ${person.lastName} (${person.sex})`);
      if (person.birthDate) {
        console.log(`    Birth: ${person.birthDate.raw} at ${person.birthPlace?.name || 'unknown'}`);
      }
    }
    console.log('\nFirst 2 families:');
    for (const family of gedcom551.families.slice(0, 2)) {
      console.log(`  - ${family.id}:`);
      console.log(`    Husband: ${family.husbandId || 'none'}`);
      console.log(`    Wife: ${family.wifeId || 'none'}`);
      console.log(`    Children: ${family.childIds.length > 0 ? family.childIds.join(', ') : 'none'}`);
      if (family.marriageDate) {
        console.log(`    Marriage: ${family.marriageDate.raw}`);
      }
    }

    // Debug: show first person's family refs
    console.log('\nFirst person family references:');
    const firstPerson = gedcom551.persons[0];
    console.log(`  - familyAsChild: ${firstPerson.familyAsChild || 'none'}`);
    console.log(`  - familiesAsSpouse: ${firstPerson.familiesAsSpouse.join(', ') || 'none'}`);

  } catch (error) {
    console.error('GEDCOM 5.5.1 parsing failed:', error);
  }

  console.log('\n\n=== Testing GEDCOM 7.0 Parser ===\n');

  try {
    const gedcom70Text = readFileSync('doc_perso/exemple_arbre_v7.ged', 'utf-8');
    const encoder = new TextEncoder();
    const gedcom70Buffer = encoder.encode(gedcom70Text).buffer;
    const gedcom70 = await parseGedcom(gedcom70Buffer, 'exemple_arbre_v7.ged');

    console.log(`Format: ${gedcom70.format}`);
    console.log(`Persons: ${gedcom70.persons.length}`);
    console.log(`Families: ${gedcom70.families.length}`);
    console.log('\nFirst 3 persons:');
    for (const person of gedcom70.persons.slice(0, 3)) {
      console.log(`  - ${person.firstName} ${person.lastName} (${person.sex})`);
      if (person.birthPlace?.lat) {
        console.log(`    Birth coords: ${person.birthPlace.lat}, ${person.birthPlace.lng}`);
      }
    }
  } catch (error) {
    console.error('GEDCOM 7.0 parsing failed:', error);
  }

  console.log('\n\n=== Testing GeneWeb Parser ===\n');

  try {
    const gwContent = readFileSync('doc_perso/exemple_arbre.gw', 'utf-8');
    const gw = parseGeneWeb(gwContent, 'exemple_arbre.gw');

    console.log(`Format: ${gw.format}`);
    console.log(`Persons: ${gw.persons.length}`);
    console.log(`Families: ${gw.families.length}`);
    console.log('\nFirst 3 persons:');
    for (const person of gw.persons.slice(0, 3)) {
      console.log(`  - ${person.firstName} ${person.lastName} (${person.sex})`);
      if (person.birthDate) {
        console.log(`    Birth: ${person.birthDate.raw}`);
      }
      if (person.occupation) {
        console.log(`    Occupation: ${person.occupation}`);
      }
    }
    console.log('\nFirst 2 families:');
    for (const family of gw.families.slice(0, 2)) {
      console.log(`  - ${family.id}: ${family.husbandId} + ${family.wifeId}`);
      console.log(`    Children: ${family.childIds.join(', ')}`);
    }
  } catch (error) {
    console.error('GeneWeb parsing failed:', error);
  }

  console.log('\n\n=== All tests completed ===');
}

testParsers();
