import { describe, it, expect } from 'vitest';
import { csvToRecords, isNativeCSV } from '../csv';

describe('csvToRecords', () => {
  it('reads rows as records keyed by header, with any delimiter', () => {
    const { headers, records } = csvToRecords('﻿Raison sociale;Ville\n"Acme; SA";Paris\nBeta;Lyon\n');
    expect(headers).toEqual(['Raison sociale', 'Ville']);
    expect(records).toEqual([
      { 'Raison sociale': 'Acme; SA', Ville: 'Paris' },
      { 'Raison sociale': 'Beta', Ville: 'Lyon' },
    ]);
  });

  it('keeps every column: empty and duplicate headers get a numbered name', () => {
    const { headers } = csvToRecords('nom,,nom\na,b,c');
    expect(headers).toEqual(['nom', 'column_2', 'nom_2']);
  });

  it('keeps line breaks inside quoted cells', () => {
    const { records } = csvToRecords('a,b\n"ligne 1\nligne 2",x');
    expect(records[0].a).toBe('ligne 1\nligne 2');
  });
});

describe('isNativeCSV', () => {
  it('native: label column, link ends, or a type column of ZN values', () => {
    expect(isNativeCSV('label,ville\nAlice,Paris')).toBe(true);
    expect(isNativeCSV('de,vers,label\nA,B,connaît')).toBe(true);
    expect(isNativeCSV('type,label,de,vers\nelement,A,,\nlien,x,A,B\nevent,Rencontre,A,')).toBe(true);
  });

  it('not native: other columns, or a type column from another tool', () => {
    expect(isNativeCSV('Raison sociale,SIREN\nAcme,123')).toBe(false);
    expect(isNativeCSV('name,type\nAlice,Facebook\nBob,SIM')).toBe(false);
    expect(isNativeCSV('source,montant\nbanque,12')).toBe(false);
  });
});
