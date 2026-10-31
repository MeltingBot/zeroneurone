/**
 * French phonetic key, derived from Phonex (F. Brouard): two names that sound
 * alike in French get the same key (Dupont / Dupond, Martin / Martain).
 *
 * The rewriting rules follow Phonex; the last step (turning the key into a
 * number) is left out, the key itself is compared. Not the exact published
 * algorithm: a key, not a reference implementation.
 */

const VOWEL = '[aeiouY1234]';

export function phonexKey(word: string): string {
  let w = word
    .toLowerCase()
    .replace(/[éèêë]/g, 'Y')
    .replace(/ç/g, 's')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zY]/g, '');
  if (!w) return '';

  w = w.replace(/y/g, 'i');
  // A silent h, except in ch, sh, ph
  w = w.replace(/([^csp]|^)h/g, '$1');
  w = w.replace(/ph/g, 'f');
  w = w.replace(/g(ai?[nm])/g, 'k$1');
  w = w.replace(new RegExp(`[ae]i[nm](?=${VOWEL})`, 'g'), 'Yn');
  w = w.replace(/eau/g, 'o');
  w = w.replace(/oua/g, '2');
  w = w.replace(/[ae]i[nm]/g, '4');
  w = w.replace(/[ae]i/g, 'Y');
  w = w.replace(/e(r|ss|t)/g, 'Y$1');
  w = w.replace(new RegExp(`[ae][nm](?!${VOWEL})`, 'g'), '1');
  w = w.replace(new RegExp(`in(?!${VOWEL})`, 'g'), '4');
  w = w.replace(new RegExp(`(${VOWEL})s(?=${VOWEL})`, 'g'), '$1z');
  w = w.replace(/oe|eu/g, 'e').replace(/au/g, 'o').replace(/oi/g, '2').replace(/ou/g, '3');
  w = w.replace(/s?ch|sh/g, '5').replace(/ss|sc(?![ei])/g, 's').replace(/c(?=[eiY])/g, 's');
  w = w.replace(/qu|gu|[cq]/g, 'k').replace(/g(?=[aoi])/g, 'k');
  w = w.replace(/a/g, 'o').replace(/[dp]/g, 't').replace(/j/g, 'g').replace(/[bv]/g, 'f').replace(/m/g, 'n');
  w = w.replace(/(.)\1+/g, '$1');
  w = w.replace(/[tx]$/, '');
  return w;
}
