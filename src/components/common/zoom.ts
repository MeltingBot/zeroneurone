/**
 * Zoom bounds shared by the asset previews, so a PDF and an image behave the
 * same way. Kept apart from the control component: mixing constants and
 * components in one module breaks fast refresh.
 */
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;
export const ZOOM_STEP = 0.25;

export const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
