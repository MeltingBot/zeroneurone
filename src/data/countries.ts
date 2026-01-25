/** Country data with ISO code and flag emoji */
export interface Country {
  code: string;  // ISO 3166-1 alpha-2
  flag: string;  // Emoji flag
}

// ISO codes and flags only - names are resolved dynamically via Intl.DisplayNames
export const COUNTRIES: Country[] = [
  { code: 'AF', flag: '🇦🇫' },
  { code: 'AL', flag: '🇦🇱' },
  { code: 'DZ', flag: '🇩🇿' },
  { code: 'DE', flag: '🇩🇪' },
  { code: 'AD', flag: '🇦🇩' },
  { code: 'AO', flag: '🇦🇴' },
  { code: 'SA', flag: '🇸🇦' },
  { code: 'AR', flag: '🇦🇷' },
  { code: 'AM', flag: '🇦🇲' },
  { code: 'AU', flag: '🇦🇺' },
  { code: 'AT', flag: '🇦🇹' },
  { code: 'AZ', flag: '🇦🇿' },
  { code: 'BH', flag: '🇧🇭' },
  { code: 'BD', flag: '🇧🇩' },
  { code: 'BE', flag: '🇧🇪' },
  { code: 'BJ', flag: '🇧🇯' },
  { code: 'BY', flag: '🇧🇾' },
  { code: 'MM', flag: '🇲🇲' },
  { code: 'BO', flag: '🇧🇴' },
  { code: 'BA', flag: '🇧🇦' },
  { code: 'BW', flag: '🇧🇼' },
  { code: 'BR', flag: '🇧🇷' },
  { code: 'BN', flag: '🇧🇳' },
  { code: 'BG', flag: '🇧🇬' },
  { code: 'BF', flag: '🇧🇫' },
  { code: 'BI', flag: '🇧🇮' },
  { code: 'KH', flag: '🇰🇭' },
  { code: 'CM', flag: '🇨🇲' },
  { code: 'CA', flag: '🇨🇦' },
  { code: 'CV', flag: '🇨🇻' },
  { code: 'CF', flag: '🇨🇫' },
  { code: 'CL', flag: '🇨🇱' },
  { code: 'CN', flag: '🇨🇳' },
  { code: 'CY', flag: '🇨🇾' },
  { code: 'CO', flag: '🇨🇴' },
  { code: 'KM', flag: '🇰🇲' },
  { code: 'KR', flag: '🇰🇷' },
  { code: 'KP', flag: '🇰🇵' },
  { code: 'CR', flag: '🇨🇷' },
  { code: 'CI', flag: '🇨🇮' },
  { code: 'HR', flag: '🇭🇷' },
  { code: 'CU', flag: '🇨🇺' },
  { code: 'DK', flag: '🇩🇰' },
  { code: 'DJ', flag: '🇩🇯' },
  { code: 'EG', flag: '🇪🇬' },
  { code: 'AE', flag: '🇦🇪' },
  { code: 'EC', flag: '🇪🇨' },
  { code: 'ER', flag: '🇪🇷' },
  { code: 'ES', flag: '🇪🇸' },
  { code: 'EE', flag: '🇪🇪' },
  { code: 'US', flag: '🇺🇸' },
  { code: 'ET', flag: '🇪🇹' },
  { code: 'FJ', flag: '🇫🇯' },
  { code: 'FI', flag: '🇫🇮' },
  { code: 'FR', flag: '🇫🇷' },
  { code: 'GA', flag: '🇬🇦' },
  { code: 'GM', flag: '🇬🇲' },
  { code: 'GE', flag: '🇬🇪' },
  { code: 'GH', flag: '🇬🇭' },
  { code: 'GR', flag: '🇬🇷' },
  { code: 'GT', flag: '🇬🇹' },
  { code: 'GN', flag: '🇬🇳' },
  { code: 'GQ', flag: '🇬🇶' },
  { code: 'GW', flag: '🇬🇼' },
  { code: 'GY', flag: '🇬🇾' },
  { code: 'HT', flag: '🇭🇹' },
  { code: 'HN', flag: '🇭🇳' },
  { code: 'HK', flag: '🇭🇰' },
  { code: 'HU', flag: '🇭🇺' },
  { code: 'IN', flag: '🇮🇳' },
  { code: 'ID', flag: '🇮🇩' },
  { code: 'IQ', flag: '🇮🇶' },
  { code: 'IR', flag: '🇮🇷' },
  { code: 'IE', flag: '🇮🇪' },
  { code: 'IS', flag: '🇮🇸' },
  { code: 'IL', flag: '🇮🇱' },
  { code: 'IT', flag: '🇮🇹' },
  { code: 'JM', flag: '🇯🇲' },
  { code: 'JP', flag: '🇯🇵' },
  { code: 'JO', flag: '🇯🇴' },
  { code: 'KZ', flag: '🇰🇿' },
  { code: 'KE', flag: '🇰🇪' },
  { code: 'KG', flag: '🇰🇬' },
  { code: 'KW', flag: '🇰🇼' },
  { code: 'LA', flag: '🇱🇦' },
  { code: 'LS', flag: '🇱🇸' },
  { code: 'LV', flag: '🇱🇻' },
  { code: 'LB', flag: '🇱🇧' },
  { code: 'LR', flag: '🇱🇷' },
  { code: 'LY', flag: '🇱🇾' },
  { code: 'LI', flag: '🇱🇮' },
  { code: 'LT', flag: '🇱🇹' },
  { code: 'LU', flag: '🇱🇺' },
  { code: 'MK', flag: '🇲🇰' },
  { code: 'MG', flag: '🇲🇬' },
  { code: 'MY', flag: '🇲🇾' },
  { code: 'MW', flag: '🇲🇼' },
  { code: 'MV', flag: '🇲🇻' },
  { code: 'ML', flag: '🇲🇱' },
  { code: 'MT', flag: '🇲🇹' },
  { code: 'MA', flag: '🇲🇦' },
  { code: 'MU', flag: '🇲🇺' },
  { code: 'MR', flag: '🇲🇷' },
  { code: 'MX', flag: '🇲🇽' },
  { code: 'MD', flag: '🇲🇩' },
  { code: 'MC', flag: '🇲🇨' },
  { code: 'MN', flag: '🇲🇳' },
  { code: 'ME', flag: '🇲🇪' },
  { code: 'MZ', flag: '🇲🇿' },
  { code: 'NA', flag: '🇳🇦' },
  { code: 'NP', flag: '🇳🇵' },
  { code: 'NI', flag: '🇳🇮' },
  { code: 'NE', flag: '🇳🇪' },
  { code: 'NG', flag: '🇳🇬' },
  { code: 'NO', flag: '🇳🇴' },
  { code: 'NZ', flag: '🇳🇿' },
  { code: 'OM', flag: '🇴🇲' },
  { code: 'UG', flag: '🇺🇬' },
  { code: 'UZ', flag: '🇺🇿' },
  { code: 'PK', flag: '🇵🇰' },
  { code: 'PA', flag: '🇵🇦' },
  { code: 'PG', flag: '🇵🇬' },
  { code: 'PY', flag: '🇵🇾' },
  { code: 'NL', flag: '🇳🇱' },
  { code: 'PE', flag: '🇵🇪' },
  { code: 'PH', flag: '🇵🇭' },
  { code: 'PL', flag: '🇵🇱' },
  { code: 'PT', flag: '🇵🇹' },
  { code: 'QA', flag: '🇶🇦' },
  { code: 'CG', flag: '🇨🇬' },
  { code: 'CD', flag: '🇨🇩' },
  { code: 'DO', flag: '🇩🇴' },
  { code: 'CZ', flag: '🇨🇿' },
  { code: 'RO', flag: '🇷🇴' },
  { code: 'GB', flag: '🇬🇧' },
  { code: 'RU', flag: '🇷🇺' },
  { code: 'RW', flag: '🇷🇼' },
  { code: 'SN', flag: '🇸🇳' },
  { code: 'RS', flag: '🇷🇸' },
  { code: 'SL', flag: '🇸🇱' },
  { code: 'SG', flag: '🇸🇬' },
  { code: 'SK', flag: '🇸🇰' },
  { code: 'SI', flag: '🇸🇮' },
  { code: 'SO', flag: '🇸🇴' },
  { code: 'SD', flag: '🇸🇩' },
  { code: 'SS', flag: '🇸🇸' },
  { code: 'LK', flag: '🇱🇰' },
  { code: 'SE', flag: '🇸🇪' },
  { code: 'CH', flag: '🇨🇭' },
  { code: 'SR', flag: '🇸🇷' },
  { code: 'SY', flag: '🇸🇾' },
  { code: 'TJ', flag: '🇹🇯' },
  { code: 'TW', flag: '🇹🇼' },
  { code: 'TZ', flag: '🇹🇿' },
  { code: 'TD', flag: '🇹🇩' },
  { code: 'TH', flag: '🇹🇭' },
  { code: 'TL', flag: '🇹🇱' },
  { code: 'TG', flag: '🇹🇬' },
  { code: 'TN', flag: '🇹🇳' },
  { code: 'TM', flag: '🇹🇲' },
  { code: 'TR', flag: '🇹🇷' },
  { code: 'UA', flag: '🇺🇦' },
  { code: 'UY', flag: '🇺🇾' },
  { code: 'VU', flag: '🇻🇺' },
  { code: 'VA', flag: '🇻🇦' },
  { code: 'VE', flag: '🇻🇪' },
  { code: 'VN', flag: '🇻🇳' },
  { code: 'YE', flag: '🇾🇪' },
  { code: 'ZM', flag: '🇿🇲' },
  { code: 'ZW', flag: '🇿🇼' },
];

// Cache for Intl.DisplayNames instances per locale
const displayNamesCache = new Map<string, Intl.DisplayNames>();

/** Get Intl.DisplayNames instance for a locale (cached) */
function getDisplayNames(locale: string): Intl.DisplayNames {
  if (!displayNamesCache.has(locale)) {
    displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
  }
  return displayNamesCache.get(locale)!;
}

/** Get localized country name using browser's Intl API */
export function getCountryName(code: string, locale: string = navigator.language): string {
  try {
    return getDisplayNames(locale).of(code) || code;
  } catch {
    return code;
  }
}

/** Country with localized name for display */
export interface LocalizedCountry extends Country {
  name: string;
}

/** Get all countries with localized names, sorted alphabetically */
export function getLocalizedCountries(locale: string = navigator.language): LocalizedCountry[] {
  return COUNTRIES
    .map(c => ({ ...c, name: getCountryName(c.code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Get country by ISO code */
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

/** Format country for display: "🇫🇷 France" */
export function formatCountry(code: string, locale: string = navigator.language): string {
  const country = getCountryByCode(code);
  if (!country) return code;
  return `${country.flag} ${getCountryName(code, locale)}`;
}

/** Format country value for storage: ISO code */
export function formatCountryValue(country: Country): string {
  return country.code;
}
