/** Values an import accepts as they are, else falls back on defaults */

export function isValidShape(value: string | number | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return ['circle', 'square', 'diamond', 'rectangle', 'hexagon'].includes(value.toLowerCase());
}

export function isValidLinkStyle(value: string | number | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return ['solid', 'dashed', 'dotted'].includes(value.toLowerCase());
}
