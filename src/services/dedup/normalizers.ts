/**
 * Identifiers in one comparable form: two writings of the same phone number,
 * IBAN, plate or email become the same string. An invalid one (an IBAN whose
 * check digits fail) is not an identifier: it identifies nothing for sure.
 */

export type IdentifierKind = 'phone' | 'iban' | 'plate' | 'email';

/** Phone number to E.164, or null when it is not a valid number (libphonenumber) */
export type PhoneParser = (text: string) => string | null;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const KEY_KINDS: [IdentifierKind, RegExp][] = [
  ['email', /mail|courriel/],
  ['iban', /iban|\brib\b/],
  ['plate', /plaque|immat|plate|vehicule|vehicle/],
  ['phone', /tel|phone|mobile|portable|gsm|fax|msisdn|numero d.appel/],
];

/** The kind of identifier a property key announces, if any */
export function kindOfKey(key: string | undefined): IdentifierKind | null {
  const k = fold(key ?? '');
  if (!k) return null;
  for (const [kind, re] of KEY_KINDS) if (re.test(k)) return kind;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(text: string): string | null {
  const t = text.trim().toLowerCase();
  return EMAIL.test(t) ? t : null;
}

/** Upper case, no separators, check digits verified (ISO 13616, mod 97) */
export function normalizeIban(text: string): string | null {
  const t = text.replace(/[\s.-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t)) return null;
  const rearranged = t.slice(4) + t.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1 ? t : null;
}

const SIV = /^([A-Z]{2})[\s-]?(\d{3})[\s-]?([A-Z]{2})$/;
const FNI = /^(\d{1,4})[\s-]?([A-Z]{1,3})[\s-]?(\d{2}|2A|2B)$/;

/**
 * French plates, current (AB-123-CD) and older (1234 AB 56) systems, without
 * separators. The older form is too loose to trust without a key saying so.
 */
export function normalizePlate(text: string, keyed: boolean): string | null {
  const t = text.trim().toUpperCase();
  const siv = SIV.exec(t);
  if (siv) return siv.slice(1).join('');
  if (keyed) {
    const fni = FNI.exec(t);
    if (fni) return fni.slice(1).join('');
  }
  return null;
}

/**
 * Phone number in E.164. With libphonenumber, any valid number (French by
 * default). Without it, French numbers only (0X XX XX XX XX, +33, 0033) and
 * numbers written with their international prefix.
 */
export function normalizePhone(text: string, parse: PhoneParser | null): string | null {
  const t = text.trim();
  if (!/^\+?[\d\s.\-()/]+$/.test(t)) return null;
  if (parse) return parse(t);
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith('0033') && digits.length === 13) return `+33${digits.slice(4)}`;
  if (/^0[1-9]\d{8}$/.test(digits)) return `+33${digits.slice(1)}`;
  return null;
}

const DATE_LIKE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T].*)?$/;

/**
 * The identifier a value carries, read from its key when the key says, from
 * its shape otherwise (an email, a valid IBAN, a current plate, a phone).
 */
export function readIdentifier(
  value: string,
  key: string | undefined,
  parse: PhoneParser | null,
): { kind: IdentifierKind; value: string } | null {
  const text = value.trim();
  if (text.length < 5 || text.length > 60) return null;
  const announced = kindOfKey(key);
  const tries: IdentifierKind[] = announced ? [announced] : ['email', 'iban', 'plate', 'phone'];
  for (const kind of tries) {
    let found: string | null = null;
    if (kind === 'email') found = normalizeEmail(text);
    else if (kind === 'iban') found = normalizeIban(text);
    else if (kind === 'plate') found = normalizePlate(text, announced === 'plate');
    else if (!DATE_LIKE.test(text)) found = normalizePhone(text, parse);
    if (found) return { kind, value: found };
  }
  return null;
}
