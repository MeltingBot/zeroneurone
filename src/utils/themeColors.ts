/**
 * Element colours as drawn in the dark theme: very light colours (the default
 * light gray, pastels) darkened so they stay visible on a dark canvas. Shared
 * by the canvas nodes and the tag colour dots, so both show the same shade.
 */

// Helper to get color brightness (0-255)
function getColorBrightness(color: string): number {
  if (color.startsWith('var(')) return 200; // CSS variables assumed light
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 200;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Darken a color for dark mode
function darkenColor(color: string, amount: number = 0.6): string {
  if (color.startsWith('var(')) return '#3a3532'; // fallback dark color for CSS vars
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#3a3532';
  const r = Math.round(parseInt(hex.substr(0, 2), 16) * amount);
  const g = Math.round(parseInt(hex.substr(2, 2), 16) * amount);
  const b = Math.round(parseInt(hex.substr(4, 2), 16) * amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Get theme-aware background color
export function getThemeAwareColor(color: string, isDarkMode: boolean): string {
  if (!isDarkMode) return color;

  // Respect an explicit white choice: the auto-darkening below is meant for the
  // neutral default light-gray, not a deliberate white background the user set.
  const c = color.trim().toLowerCase();
  if (c === '#ffffff' || c === '#fff' || c === 'white') return color;

  // In dark mode, invert very light colors to darker equivalents
  // This ensures elements remain visible on dark canvas
  const brightness = getColorBrightness(color);
  if (brightness > 230) {
    // Very light colors (white, near-white, very light grays) -> invert to dark
    // Map brightness 230-255 to a dark range (40-60)
    const darkBrightness = 50;
    const factor = darkBrightness / brightness;
    return darkenColor(color, factor);
  }
  if (brightness > 200) {
    // Light colors (light grays, pastels) -> darken moderately
    return darkenColor(color, 0.5);
  }
  // Keep medium and dark colors as-is
  return color;
}

/** Whether text on this background should be dark (CSS variables are taken as light) */
export function isLightColor(color: string): boolean {
  if (color.startsWith('var(')) return true;
  const hex = color.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
