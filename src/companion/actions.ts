/**
 * Writes of the companion into the shared Y.Doc: a capture (element, with an
 * optional photo and position), a comment, resolving a comment. Each one
 * records itself as pending first (see pending.ts).
 */

import * as Y from 'yjs';
import type { Asset, CanvasTab, CommentTargetType, DossierId, ElementEvent, ElementId, GeoData, GeoPoint, LinkDirection, LinkId, Property } from '../types';
import { getYMaps } from '../types/yjs';
import { elementToYMap, updateElementYMap, yMapToElement } from '../services/yjs/elementMapper';
import { commentToYMap, updateCommentYMap } from '../services/yjs/commentMapper';
import { buildComment, buildNewElement, buildNewLink } from '../services/yjs/factories';
import { linkToYMap, updateLinkYMap } from '../services/yjs/linkMapper';
import { tabToYMap } from '../services/yjs/tabMapper';
import { MAX_SHARED_ASSET_SIZE, pushAssetChunked } from '../services/assetSync';
import { downscaleImage, generateImageThumbnail } from '../utils/imageThumbnail';
import { isAllowedAttachment } from '../utils/attachmentTypes';
import { capturePosition } from './placement';
import { beginWrite } from './pending';
import { getLocalUser } from './presence';

export interface CaptureInput {
  label: string;
  notes: string;
  /** Camera photos and files from the phone, attached to the element */
  files: File[];
  geo: { lat: number; lng: number } | null;
  source?: string;
  /** Canvas tab the new element goes into */
  tabId?: string | null;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function photoFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `photo-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
}

/** A file over the size the shared dossier carries (MAX_SHARED_ASSET_SIZE) */
export class FileTooLargeError extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(fileName);
    this.fileName = fileName;
  }
}

/** A file type the desktop refuses (attachmentTypes.ts) */
export class UnsupportedFileError extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(fileName);
    this.fileName = fileName;
  }
}

/** Images re-encoded smaller; GIF (animation) and SVG (vector) kept as they are */
function shrinkable(file: File): boolean {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return false;
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Validates and encodes one file; throws before anything is written */
async function prepareAttachment(file: File, dossierId: DossierId, now: Date): Promise<{ asset: Asset; buffer: ArrayBuffer }> {
  let blob: Blob = file;
  let filename = file.name || photoFilename(now);
  if (shrinkable(file)) {
    const smaller = await downscaleImage(file);
    if (smaller !== file) {
      blob = smaller;
      filename = `${file.name ? baseName(file.name) : baseName(photoFilename(now))}.jpg`;
    }
  }
  const mimeType = blob.type || 'application/octet-stream';
  if (!isAllowedAttachment(filename, mimeType)) throw new UnsupportedFileError(file.name || filename);
  if (blob.size > MAX_SHARED_ASSET_SIZE) throw new FileTooLargeError(file.name || filename);
  const buffer = await blob.arrayBuffer();
  return {
    buffer,
    asset: {
      id: crypto.randomUUID(),
      dossierId,
      filename,
      mimeType,
      size: buffer.byteLength,
      hash: await sha256Hex(buffer),
      opfsPath: '',
      thumbnailDataUrl: mimeType.startsWith('image/') ? await generateImageThumbnail(blob) : null,
      extractedText: null,
      createdAt: now,
    },
  };
}

/**
 * Creates the element, then streams its files into the Y.Doc. Every file is
 * checked first: one refused, nothing is written. The element is written
 * before the files so the desktop shows it at once; the files follow.
 * Resolves when the last chunk is pushed.
 */
export async function createCapture(
  ydoc: Y.Doc,
  dossierId: DossierId,
  input: CaptureInput,
  connected: boolean,
): Promise<ElementId> {
  const { elements, assets } = getYMaps(ydoc);
  const now = new Date();
  const attachments: { asset: Asset; buffer: ArrayBuffer }[] = [];
  for (const file of input.files) attachments.push(await prepareAttachment(file, dossierId, now));

  const positions: { x: number; y: number }[] = [];
  elements.forEach((ymap) => {
    const position = (ymap as Y.Map<unknown>).get('position') as { x: number; y: number } | undefined;
    if (position && typeof position.x === 'number' && typeof position.y === 'number') positions.push(position);
  });

  const geo: GeoPoint | null = input.geo ? { type: 'point', lat: input.geo.lat, lng: input.geo.lng } : null;
  const element = buildNewElement(dossierId, input.label.trim(), capturePosition(positions), {
    notes: input.notes.trim(),
    geo,
    assetIds: attachments.map((a) => a.asset.id),
    // Element.date is the collection date (not a fact: kept off the timeline)
    date: new Date(),
    source: input.source?.trim() ?? '',
  });

  beginWrite(dossierId, ydoc, element.id, connected);
  ydoc.transact(() => {
    elements.set(element.id, elementToYMap(element));
  });
  if (input.tabId) setTabMember(ydoc, dossierId, input.tabId, element.id, true, connected);

  for (const { asset, buffer } of attachments) {
    await pushAssetChunked(ydoc, assets, asset, buffer);
  }
  return element.id;
}

/** Edits an existing element's label, notes, properties, source, tags, events or position */
export function updateElementFields(
  ydoc: Y.Doc,
  dossierId: DossierId,
  elementId: ElementId,
  changes: { label?: string; notes?: string; properties?: Property[]; source?: string; tags?: string[]; events?: ElementEvent[]; geo?: GeoData | null },
  connected: boolean,
): boolean {
  const ymap = getYMaps(ydoc).elements.get(elementId) as Y.Map<unknown> | undefined;
  if (!ymap) return false;
  beginWrite(dossierId, ydoc, elementId, connected);
  updateElementYMap(ymap, changes, ydoc);
  return true;
}

/** Links two elements, with the desktop's defaults for everything else */
export function createLink(
  ydoc: Y.Doc,
  dossierId: DossierId,
  fromId: ElementId,
  toId: ElementId,
  options: { label: string; direction: LinkDirection; source?: string },
  connected: boolean,
): LinkId {
  const link = buildNewLink(dossierId, fromId, toId, {
    label: options.label.trim(),
    direction: options.direction,
    directed: options.direction !== 'none',
    source: options.source?.trim() ?? '',
  });
  beginWrite(dossierId, ydoc, link.id, connected);
  ydoc.transact(() => {
    getYMaps(ydoc).links.set(link.id, linkToYMap(link));
  });
  return link.id;
}

/** Links attached to an element (deleted with it) */
export function linksOf(ydoc: Y.Doc, elementId: ElementId): string[] {
  const ids: string[] = [];
  getYMaps(ydoc).links.forEach((ymap, id) => {
    const map = ymap as Y.Map<unknown>;
    if (map.get('fromId') === elementId || map.get('toId') === elementId) ids.push(id);
  });
  return ids;
}

/**
 * Deletes an element as the desktop does: with its links, and out of every
 * canvas tab. Comments stay, as on the desktop.
 */
export function deleteElement(ydoc: Y.Doc, dossierId: DossierId, elementId: ElementId, connected: boolean): void {
  const maps = getYMaps(ydoc);
  const links = linksOf(ydoc, elementId);
  beginWrite(dossierId, ydoc, elementId, connected);
  ydoc.transact(() => {
    for (const id of links) maps.links.delete(id);
    maps.elements.delete(elementId);
    maps.tabs.forEach((value) => {
      const tab = value as Y.Map<unknown>;
      for (const key of ['memberElementIds', 'excludedElementIds'] as const) {
        const ids = tab.get(key);
        if (Array.isArray(ids) && ids.includes(elementId)) {
          tab.set(key, ids.filter((id) => id !== elementId));
          tab.set('updatedAt', new Date().toISOString());
        }
      }
    });
  });
}

/** Edits an existing link's label or direction (directed follows the direction, as on creation) */
export function updateLink(
  ydoc: Y.Doc,
  dossierId: DossierId,
  linkId: LinkId,
  changes: { label?: string; direction?: LinkDirection },
  connected: boolean,
): boolean {
  const ymap = getYMaps(ydoc).links.get(linkId) as Y.Map<unknown> | undefined;
  if (!ymap) return false;
  beginWrite(dossierId, ydoc, linkId, connected);
  updateLinkYMap(ymap, {
    ...(changes.label !== undefined ? { label: changes.label } : {}),
    ...(changes.direction !== undefined ? { direction: changes.direction, directed: changes.direction !== 'none' } : {}),
  }, ydoc);
  return true;
}

export function deleteLink(ydoc: Y.Doc, dossierId: DossierId, linkId: LinkId, connected: boolean): void {
  beginWrite(dossierId, ydoc, linkId, connected);
  ydoc.transact(() => {
    getYMaps(ydoc).links.delete(linkId);
  });
}

// ============================================================================
// CANVAS TABS (same rules as the desktop's tabStore)
// ============================================================================

/** A new tab, after the existing ones */
export function createTab(ydoc: Y.Doc, dossierId: DossierId, name: string, connected: boolean): string {
  const tabs = getYMaps(ydoc).tabs;
  let maxOrder = 0;
  tabs.forEach((m) => {
    const order = (m as Y.Map<unknown>).get('order');
    if (typeof order === 'number' && order > maxOrder) maxOrder = order;
  });
  const now = new Date();
  const tab: CanvasTab = {
    id: crypto.randomUUID(),
    dossierId: dossierId as CanvasTab['dossierId'],
    name: name.trim(),
    order: maxOrder + 1,
    memberElementIds: [],
    excludedElementIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
  beginWrite(dossierId, ydoc, tab.id, connected);
  ydoc.transact(() => {
    tabs.set(tab.id, tabToYMap(tab));
  });
  return tab.id;
}

export function renameTab(ydoc: Y.Doc, dossierId: DossierId, tabId: string, name: string, connected: boolean): void {
  const tab = getYMaps(ydoc).tabs.get(tabId) as Y.Map<unknown> | undefined;
  if (!tab) return;
  beginWrite(dossierId, ydoc, tabId, connected);
  ydoc.transact(() => {
    tab.set('name', name.trim());
    tab.set('updatedAt', new Date().toISOString());
  });
}

/** Its elements stay in the dossier: an element may belong to no tab */
export function deleteTab(ydoc: Y.Doc, dossierId: DossierId, tabId: string, connected: boolean): void {
  beginWrite(dossierId, ydoc, tabId, connected);
  ydoc.transact(() => {
    getYMaps(ydoc).tabs.delete(tabId);
  });
}

/** Adds an element to a tab (no longer excluded from it), or takes it out */
export function setTabMember(
  ydoc: Y.Doc,
  dossierId: DossierId,
  tabId: string,
  elementId: ElementId,
  member: boolean,
  connected: boolean,
): void {
  const tab = getYMaps(ydoc).tabs.get(tabId) as Y.Map<unknown> | undefined;
  if (!tab) return;
  const members = Array.isArray(tab.get('memberElementIds')) ? (tab.get('memberElementIds') as string[]) : [];
  const excluded = Array.isArray(tab.get('excludedElementIds')) ? (tab.get('excludedElementIds') as string[]) : [];
  if (member === members.includes(elementId)) return;
  beginWrite(dossierId, ydoc, tabId, connected);
  ydoc.transact(() => {
    if (member) {
      tab.set('memberElementIds', [...members, elementId]);
      if (excluded.includes(elementId)) tab.set('excludedElementIds', excluded.filter((id) => id !== elementId));
    } else {
      tab.set('memberElementIds', members.filter((id) => id !== elementId));
    }
    tab.set('updatedAt', new Date().toISOString());
  });
}

export function addComment(
  ydoc: Y.Doc,
  dossierId: DossierId,
  targetId: ElementId | LinkId,
  targetType: CommentTargetType,
  content: string,
  connected: boolean,
): void {
  const user = getLocalUser();
  const comment = buildComment(dossierId, targetId, targetType, content.trim(), user);
  beginWrite(dossierId, ydoc, comment.id, connected);
  const { comments } = getYMaps(ydoc);
  ydoc.transact(() => {
    comments.set(comment.id, commentToYMap(comment));
  });
}

export function setCommentResolved(
  ydoc: Y.Doc,
  dossierId: DossierId,
  commentId: string,
  resolved: boolean,
  connected: boolean,
): void {
  const ymap = getYMaps(ydoc).comments.get(commentId) as Y.Map<unknown> | undefined;
  if (!ymap) return;
  beginWrite(dossierId, ydoc, commentId, connected);
  updateCommentYMap(
    ymap,
    resolved
      ? { resolved: true, resolvedBy: getLocalUser().name, resolvedAt: new Date() }
      : { resolved: false, resolvedBy: null, resolvedAt: null },
    ydoc,
  );
}

/** For tests and the element list: the elements of the Y.Doc, skipping broken entries */
export function readElements(ydoc: Y.Doc) {
  const out: ReturnType<typeof yMapToElement>[] = [];
  getYMaps(ydoc).elements.forEach((ymap) => {
    try { out.push(yMapToElement(ymap as Y.Map<unknown>)); } catch { /* malformed entry */ }
  });
  return out;
}
