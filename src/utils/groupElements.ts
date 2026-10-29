import { useDossierStore, useHistoryStore } from '../stores';
import type { Element } from '../types';
import { computeElementDimensions } from './elementDimensions';
import { buildDegreeMap, scaleByDegree } from './degreeSize';

/**
 * Elements a new group can take: top-level, non-group elements. Groups are a
 * single level, and undo only knows how to put children back at the top level.
 */
export function groupableElements(ids: Iterable<string>): Element[] {
  const wanted = new Set(ids);
  return useDossierStore.getState().elements.filter(
    (el) => wanted.has(el.id) && !el.isGroup && !el.parentGroupId
  );
}

const GATHER_GAP = 50;
const GROUP_PADDING = 40;
/** Room for the label drawn under an element that shows an image */
const IMAGE_LABEL_HEIGHT = 24;

interface MemberBox {
  id: string;
  /** Drawn extent, diamond tips and image label included */
  x: number; y: number; w: number; h: number;
  /** Offset from the element's own position to its drawn extent */
  dx: number; dy: number;
}

/**
 * Drawn extent of each element, at the size the canvas draws it (thumbnail,
 * size by number of links). A diamond is its square turned 45°: its tips
 * stick out of the square by about a fifth of its side on each side.
 */
function memberBoxes(members: Element[], unnamedLabel: string): MemberBox[] {
  const { assets, currentDossier, links } = useDossierStore.getState();
  const thumbnails = new Map(assets.map((a) => [a.id, a.thumbnailDataUrl] as const));
  const degreeMap = currentDossier?.settings?.sizeByDegree ? buildDegreeMap(links) : null;
  return members.map((el) => {
    const firstAssetId = el.assetIds?.[0];
    const hasImage = Boolean(firstAssetId && thumbnails.get(firstAssetId)) && el.visual.hideMedia !== true;
    const shown = degreeMap ? scaleByDegree(el, degreeMap.get(el.id) ?? 0, hasImage) : el;
    const { width, height } = computeElementDimensions(shown.visual, el.label || unnamedLabel, hasImage);
    const tipX = shown.visual.shape === 'diamond' ? width * (Math.SQRT2 - 1) / 2 : 0;
    const tipY = shown.visual.shape === 'diamond' ? height * (Math.SQRT2 - 1) / 2 : 0;
    const x = shown.position.x - tipX;
    const y = shown.position.y - tipY;
    return {
      id: el.id, x, y,
      w: width + tipX * 2,
      h: height + tipY * 2 + (hasImage ? IMAGE_LABEL_HEIGHT : 0),
      dx: x - el.position.x, dy: y - el.position.y,
    };
  });
}

/**
 * Grid positions packing boxes around the centre of their current spread,
 * keeping their reading order (top to bottom, then left to right).
 */
export function gatherPositions(
  boxes: { id: string; x: number; y: number; w: number; h: number }[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (boxes.length === 0) return result;
  const cx = boxes.reduce((sum, b) => sum + b.x + b.w / 2, 0) / boxes.length;
  const cy = boxes.reduce((sum, b) => sum + b.y + b.h / 2, 0) / boxes.length;
  const cellW = Math.max(...boxes.map((b) => b.w)) + GATHER_GAP;
  const cellH = Math.max(...boxes.map((b) => b.h)) + GATHER_GAP;
  const cols = Math.ceil(Math.sqrt(boxes.length));
  const rows = Math.ceil(boxes.length / cols);
  const left = cx - (cols * cellW - GATHER_GAP) / 2;
  const top = cy - (rows * cellH - GATHER_GAP) / 2;
  const ordered = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  ordered.forEach((b, i) => {
    result.set(b.id, { x: left + (i % cols) * cellW, y: top + Math.floor(i / cols) * cellH });
  });
  return result;
}

/**
 * Puts the groupable elements among `ids` in a new group drawn around them,
 * as one undo step. They stay where they stand unless `gather` asks to pack
 * them first in a grid around the centre of their spread (undo puts them
 * back). Returns the group id, or null with fewer than two.
 */
export async function groupElements(
  ids: Iterable<string>,
  label: string,
  unnamedLabel: string,
  options: { gather?: boolean } = {},
): Promise<string | null> {
  const members = groupableElements(ids);
  if (members.length < 2) return null;

  const { createGroup, updateElementPositions } = useDossierStore.getState();
  const absolutePositions = members.map((el) => ({ id: el.id, position: { ...el.position } }));
  const boxes = memberBoxes(members, unnamedLabel);

  // Where each member ends up (absolute position of the element itself)
  const finalPositions = new Map(members.map((el) => [el.id, { ...el.position }]));
  if (options.gather) {
    for (const [id, pos] of gatherPositions(boxes)) {
      const box = boxes.find((b) => b.id === id)!;
      box.x = pos.x;
      box.y = pos.y;
      finalPositions.set(id, { x: pos.x - box.dx, y: pos.y - box.dy });
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const groupPos = { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING };
  const groupSize = { width: maxX - minX + GROUP_PADDING * 2, height: maxY - minY + GROUP_PADDING * 2 };

  const group = await createGroup(label, groupPos, groupSize, members.map((el) => el.id));

  const relativePositions = members.map((el) => {
    const pos = finalPositions.get(el.id)!;
    return { id: el.id, position: { x: pos.x - groupPos.x, y: pos.y - groupPos.y } };
  });
  // The group took the members where they stood: move them to the grid
  if (options.gather) await updateElementPositions(relativePositions);
  const groupSnapshot = useDossierStore.getState().elements.find((el) => el.id === group.id);
  if (groupSnapshot) {
    useHistoryStore.getState().pushAction({
      type: 'create-group',
      undo: { positions: absolutePositions },
      redo: { elements: [groupSnapshot], elementIds: [group.id], positions: relativePositions },
    });
  }
  return group.id;
}

/**
 * Packs the members of an existing group in a grid at its top left, and fits
 * the group around them, as one undo step. Returns false when the group has
 * fewer than two members.
 */
export async function gatherGroup(groupId: string, unnamedLabel: string): Promise<boolean> {
  const { elements, updateElementPositions, updateElement } = useDossierStore.getState();
  const group = elements.find((el) => el.id === groupId && el.isGroup);
  if (!group) return false;
  const members = elements.filter((el) => el.parentGroupId === groupId);
  if (members.length < 2) return false;

  // Member positions are relative to the group: so is the grid
  const boxes = memberBoxes(members, unnamedLabel);
  const grid = gatherPositions(boxes);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    const pos = grid.get(b.id)!;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + b.w);
    maxY = Math.max(maxY, pos.y + b.h);
  }
  const positions = boxes.map((b) => {
    const pos = grid.get(b.id)!;
    return {
      id: b.id,
      position: { x: pos.x - minX + GROUP_PADDING - b.dx, y: pos.y - minY + GROUP_PADDING - b.dy },
    };
  });
  const size = { customWidth: maxX - minX + GROUP_PADDING * 2, customHeight: maxY - minY + GROUP_PADDING * 2 };

  const before = {
    positions: members.map((el) => ({ id: el.id, changes: { position: { ...el.position } } })),
    size: { customWidth: group.visual.customWidth, customHeight: group.visual.customHeight },
  };
  await updateElementPositions(positions);
  await updateElement(groupId, { visual: size });

  useHistoryStore.getState().pushAction({
    type: 'update-bulk',
    undo: {
      bulkElements: [
        ...before.positions,
        { id: groupId, changes: { visual: { ...group.visual, ...before.size } } },
      ],
    },
    redo: {
      bulkCalls: [
        ...positions.map((p) => ({ kind: 'elements' as const, ids: [p.id], changes: { position: p.position } })),
        { kind: 'elements' as const, ids: [groupId], changes: { visual: { ...group.visual, ...size } } },
      ],
    },
  });
  return true;
}
