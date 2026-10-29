import { describe, it, expect } from 'vitest';
import { isNumericColumn, parseNumericText } from '../numericText';

describe('parseNumericText', () => {
  it('reads integers, decimals and decimal commas', () => {
    expect(parseNumericText('421')).toBe(421);
    expect(parseNumericText('-0.4636')).toBe(-0.4636);
    expect(parseNumericText('12,5')).toBe(12.5);
    expect(parseNumericText('0')).toBe(0);
    expect(parseNumericText('0,75')).toBe(0.75);
  });

  it('leaves what only looks like a number as text', () => {
    expect(parseNumericText('0639983317')).toBeNull();      // phone
    expect(parseNumericText('06 39 98 33 17')).toBeNull();  // phone with spaces
    expect(parseNumericText('01000')).toBeNull();           // postcode
    expect(parseNumericText('355430686724949')).toBeNull();   // IMEI, 15 digits
    expect(parseNumericText('12345678901.23')).toBeNull();    // > 12 digits
    expect(parseNumericText('123456789012')).toBe(123456789012);
    expect(parseNumericText('12 km')).toBeNull();
    expect(parseNumericText('')).toBeNull();
  });
});

describe('isNumericColumn', () => {
  it('needs every non-blank value to be a number', () => {
    expect(isNumericColumn(['421', '', '12', 3])).toBe(true);
    expect(isNumericColumn(['421', 'n/a'])).toBe(false);
    expect(isNumericColumn(['', null])).toBe(false);
  });

  it('keeps commas that may separate thousands as text', () => {
    expect(isNumericColumn(['12,5', '3,75', '8'])).toBe(true);     // French decimals
    expect(isNumericColumn(['1,234', '25,000'])).toBe(false);      // English thousands
    expect(isNumericColumn(['1,234', '12.5'])).toBe(false);        // both separators
    expect(isNumericColumn(['12.5', '3.75'])).toBe(true);
  });
});
