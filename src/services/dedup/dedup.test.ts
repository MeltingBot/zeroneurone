import { describe, it, expect } from 'vitest';
import { jaroWinkler } from './jaroWinkler';
import { phonexKey } from './phonex';
import { normalizeIban, normalizePhone, normalizePlate, readIdentifier, kindOfKey } from './normalizers';

describe('jaroWinkler', () => {
  it('matches the reference values', () => {
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961, 3);
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813, 3);
    expect(jaroWinkler('abc', 'abc')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
    expect(jaroWinkler('', 'a')).toBe(0);
  });
});

describe('phonexKey', () => {
  it('gives names that sound alike the same key', () => {
    expect(phonexKey('Dupont')).toBe(phonexKey('Dupond'));
    expect(phonexKey('Martin')).toBe(phonexKey('Martain'));
    expect(phonexKey('Philippe')).toBe(phonexKey('Filipe'));
    expect(phonexKey('Gauthier')).toBe(phonexKey('Gautier'));
    expect(phonexKey('Lemaire')).toBe(phonexKey('Lemère'));
  });

  it('tells names apart that do not', () => {
    expect(phonexKey('Martin')).not.toBe(phonexKey('Marin'));
    expect(phonexKey('Dupont')).not.toBe(phonexKey('Durand'));
    expect(phonexKey('')).toBe('');
  });
});

describe('normalizers', () => {
  it('checks IBAN check digits', () => {
    expect(normalizeIban('GB82 WEST 1234 5698 7654 32')).toBe('GB82WEST12345698765432');
    expect(normalizeIban('DE89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(normalizeIban('GB82 WEST 1234 5698 7654 33')).toBeNull();
    expect(normalizeIban('hello')).toBeNull();
  });

  it('reads French plates, the older form only under a plate key', () => {
    expect(normalizePlate('ab-123-cd', false)).toBe('AB123CD');
    expect(normalizePlate('AB 123 CD', false)).toBe('AB123CD');
    expect(normalizePlate('1234 AB 56', false)).toBeNull();
    expect(normalizePlate('1234 AB 56', true)).toBe('1234AB56');
  });

  it('writes phone numbers in E.164, with or without the library', () => {
    expect(normalizePhone('06 12 34 56 78', null)).toBe('+33612345678');
    expect(normalizePhone('+33 6 12 34 56 78', null)).toBe('+33612345678');
    expect(normalizePhone('0033612345678', null)).toBe('+33612345678');
    expect(normalizePhone('552100554', null)).toBeNull();
    const lib = (t: string) => (t.replace(/\D/g, '') === '447911123456' ? '+447911123456' : null);
    expect(normalizePhone('+44 7911 123456', lib)).toBe('+447911123456');
    expect(normalizePhone('12', lib)).toBeNull();
  });

  it('reads an identifier from its key or its shape', () => {
    expect(kindOfKey('Téléphone portable')).toBe('phone');
    expect(kindOfKey('E-mail')).toBe('email');
    expect(readIdentifier('Jean.Dupont@Mail.fr ', undefined, null)).toEqual({ kind: 'email', value: 'jean.dupont@mail.fr' });
    expect(readIdentifier('06.12.34.56.78', 'tel', null)).toEqual({ kind: 'phone', value: '+33612345678' });
    expect(readIdentifier('2024-01-15', undefined, null)).toBeNull();
    expect(readIdentifier('Jean Dupont', undefined, null)).toBeNull();
  });
});
