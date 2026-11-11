import type { LinkDirection } from '../types';

/** Directions as seen from the element shown: forward is from it to the other end */
export const DIRECTIONS: { value: LinkDirection; key: string }[] = [
  { value: 'none', key: 'links.dirNone' },
  { value: 'forward', key: 'links.dirForward' },
  { value: 'backward', key: 'links.dirBackward' },
  { value: 'both', key: 'links.dirBoth' },
];
