/** CSS variable holding the width factor of the links: 1 up to zoom 1, then 1/zoom */
export const LINK_WIDTH_SCALE_VAR = '--zn-link-scale';

/** Stroke width of a link line that keeps its screen width when zoomed in. */
export const scaledLinkWidth = (width: number) => `calc(${width}px * var(${LINK_WIDTH_SCALE_VAR}, 1))`;
