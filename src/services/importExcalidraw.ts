import { generateUUID } from '../utils';
import { DEFAULT_ELEMENT_VISUAL, DEFAULT_LINK_VISUAL } from '../types';
import type {
  InvestigationId,
  Element,
  ElementId,
  Link,
  LinkId,
  Property,
  AssetId,
  ElementShape,
  LinkDirection,
  LinkStyle,
} from '../types';
import { db } from '../db/database';
import { fileService } from './fileService';
import type { ImportResult } from './importService';

// ============================================================================
// Excalidraw Format Types
// ============================================================================

interface ExcalidrawBinding {
  elementId: string;
  mode?: string;
  fixedPoint?: [number, number];
}

interface ExcalidrawBoundElement {
  id: string;
  type: 'text' | 'arrow';
}

interface ExcalidrawElement {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'image' | 'line' | 'freedraw' | 'frame';
  id: string;
  isDeleted?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  strokeWidth?: number;
  opacity?: number;
  angle?: number;
  link?: string | null;
  locked?: boolean;
  groupIds?: string[];
  frameId?: string | null;
  boundElements?: ExcalidrawBoundElement[];
  // Text-specific
  text?: string;
  originalText?: string;
  fontSize?: number;
  containerId?: string | null;
  // Arrow-specific
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  points?: [number, number][];
  elbowed?: boolean;
  // Image-specific
  fileId?: string;
  status?: string;
}

interface ExcalidrawFile {
  mimeType: string;
  dataURL: string;
  created?: number;
}

interface ExcalidrawData {
  type: 'excalidraw';
  version: number;
  source?: string;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, ExcalidrawFile>;
}

// ============================================================================
// Excalidraw color mapping
// ============================================================================

const EXCALIDRAW_COLORS: Record<string, string> = {
  '#1e1e1e': '#a8a29e',   // dark → neutral border
  '#e03131': '#ef4444',   // red
  '#2f9e44': '#22c55e',   // green
  '#1971c2': '#3b82f6',   // blue
  '#f08c00': '#f59e0b',   // orange
  '#6741d9': '#8b5cf6',   // purple
  '#0c8599': '#06b6d4',   // cyan
  '#e8590c': '#f97316',   // burnt orange
  '#f783ac': '#ec4899',   // pink
};

const EXCALIDRAW_BG_COLORS: Record<string, string> = {
  '#ffc9c9': '#fecaca',   // light red
  '#b2f2bb': '#bbf7d0',   // light green
  '#a5d8ff': '#bfdbfe',   // light blue
  '#ffec99': '#fef08a',   // light yellow
  '#d0bfff': '#ddd6fe',   // light purple
  '#99e9f2': '#a5f3fc',   // light cyan
  '#ffd8a8': '#fed7aa',   // light orange
  '#eebefa': '#f5d0fe',   // light magenta
};

function mapExcalidrawColor(strokeColor?: string, bgColor?: string): string {
  // Prefer background color for element fill
  if (bgColor && bgColor !== 'transparent') {
    return EXCALIDRAW_BG_COLORS[bgColor] || bgColor;
  }
  // Fall back to stroke color mapping
  if (strokeColor && strokeColor !== '#1e1e1e') {
    return EXCALIDRAW_COLORS[strokeColor] || strokeColor;
  }
  return DEFAULT_ELEMENT_VISUAL.color;
}

function mapExcalidrawBorderColor(strokeColor?: string): string {
  if (strokeColor) {
    return EXCALIDRAW_COLORS[strokeColor] || strokeColor;
  }
  return DEFAULT_ELEMENT_VISUAL.borderColor;
}

function mapExcalidrawShape(type: string): ElementShape {
  switch (type) {
    case 'rectangle': return 'rectangle';
    case 'ellipse': return 'circle';
    case 'diamond': return 'diamond';
    default: return 'rectangle';
  }
}

function mapArrowDirection(startArrowhead?: string | null, endArrowhead?: string | null): LinkDirection {
  const hasStart = !!startArrowhead;
  const hasEnd = !!endArrowhead;
  if (hasStart && hasEnd) return 'both';
  if (hasStart) return 'backward';
  if (hasEnd) return 'forward';
  return 'none';
}

function mapStrokeStyle(style?: string): LinkStyle {
  if (style === 'dashed') return 'dashed';
  if (style === 'dotted') return 'dotted';
  return 'solid';
}

// ============================================================================
// Format detection
// ============================================================================

export function isExcalidrawFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  return obj.type === 'excalidraw' && Array.isArray(obj.elements);
}

// ============================================================================
// Import function
// ============================================================================

export async function importExcalidraw(
  content: string,
  targetInvestigationId: InvestigationId
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    elementsImported: 0,
    linksImported: 0,
    assetsImported: 0,
    reportImported: false,
    errors: [],
    warnings: [],
  };

  try {
    const data: ExcalidrawData = JSON.parse(content);

    if (!data.elements || !Array.isArray(data.elements)) {
      result.errors.push('Format Excalidraw invalide: pas d\'éléments');
      return result;
    }

    // Filter active elements only
    const activeElements = data.elements.filter(el => !el.isDeleted);

    // Build lookup maps
    const textByContainerId = new Map<string, ExcalidrawElement>();
    const textById = new Map<string, ExcalidrawElement>();
    const elementById = new Map<string, ExcalidrawElement>();

    for (const el of activeElements) {
      elementById.set(el.id, el);
      if (el.type === 'text') {
        textById.set(el.id, el);
        if (el.containerId) {
          textByContainerId.set(el.containerId, el);
        }
      }
    }

    // Identify shapes (will become ZN elements)
    const shapes = activeElements.filter(el =>
      el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond'
    );

    // Identify images
    const images = activeElements.filter(el => el.type === 'image' && el.fileId);

    // Identify free text (not contained in a shape or arrow)
    const freeTexts = activeElements.filter(el =>
      el.type === 'text' && !el.containerId
    );

    // Identify arrows (will become ZN links)
    const arrows = activeElements.filter(el =>
      el.type === 'arrow' && (el.startBinding || el.endBinding)
    );

    // Map excalidraw IDs to ZN element IDs
    const idMap = new Map<string, ElementId>();

    // ========================================================================
    // Import shapes as elements
    // ========================================================================
    const elements: Element[] = [];
    const assetIds: AssetId[] = [];

    for (const shape of shapes) {
      const elementId = generateUUID() as ElementId;
      idMap.set(shape.id, elementId);

      // Get bound text label
      const boundText = textByContainerId.get(shape.id);
      const label = boundText
        ? (boundText.originalText || boundText.text || '').replace(/\n/g, ' ').trim()
        : '';

      // Properties from URL link
      const properties: Property[] = [];
      if (shape.link) {
        properties.push({ key: 'url', value: shape.link, type: 'link' });
      }

      // Position: use center of shape
      const position = {
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
      };

      const element: Element = {
        id: elementId,
        investigationId: targetInvestigationId,
        label: label || 'Sans titre',
        notes: '',
        tags: [],
        properties,
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        events: [],
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          color: mapExcalidrawColor(shape.strokeColor, shape.backgroundColor),
          borderColor: mapExcalidrawBorderColor(shape.strokeColor),
          borderStyle: mapStrokeStyle(shape.strokeStyle) as 'solid' | 'dashed' | 'dotted',
          shape: mapExcalidrawShape(shape.type),
          size: 'medium',
          customWidth: Math.round(shape.width),
          customHeight: Math.round(shape.height),
        },
        position,
        isPositionLocked: false,
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      elements.push(element);
    }

    // ========================================================================
    // Import images as elements with assets
    // ========================================================================
    const files = data.files || {};
    let imageDownloadCount = 0;

    for (const img of images) {
      const fileData = files[img.fileId!];
      if (!fileData || !fileData.dataURL) continue;

      const elementId = generateUUID() as ElementId;
      idMap.set(img.id, elementId);

      let visualImageId: AssetId | null = null;

      try {
        // Convert dataURL to File
        const [header, base64] = fileData.dataURL.split(',');
        if (base64) {
          const mimeMatch = header.match(/data:([^;]+)/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          const ext = mimeType.split('/')[1] || 'png';

          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          const filename = `excalidraw_image_${imageDownloadCount + 1}.${ext}`;
          const file = new File([blob], filename, { type: mimeType });

          const asset = await fileService.saveAsset(targetInvestigationId, file);
          assetIds.push(asset.id);
          visualImageId = asset.id;
          imageDownloadCount++;
          result.assetsImported++;
        }
      } catch {
        result.warnings.push(`Image non importée: ${img.fileId?.substring(0, 12)}...`);
      }

      // Get bound text for image (if any)
      const boundText = textByContainerId.get(img.id);
      const label = boundText
        ? (boundText.originalText || boundText.text || '').trim()
        : `Image ${imageDownloadCount}`;

      const position = {
        x: img.x + img.width / 2,
        y: img.y + img.height / 2,
      };

      const element: Element = {
        id: elementId,
        investigationId: targetInvestigationId,
        label,
        notes: '',
        tags: [],
        properties: [],
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        events: [],
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          shape: 'rectangle',
          size: 'medium',
          customWidth: Math.round(img.width),
          customHeight: Math.round(img.height),
          image: visualImageId,
        },
        position,
        isPositionLocked: false,
        assetIds: visualImageId ? [visualImageId] : [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      elements.push(element);
    }

    // ========================================================================
    // Import free text as small elements (annotations)
    // ========================================================================
    for (const txt of freeTexts) {
      const elementId = generateUUID() as ElementId;
      idMap.set(txt.id, elementId);

      const label = (txt.originalText || txt.text || '').replace(/\n/g, ' ').trim();
      if (!label) continue;

      const position = {
        x: txt.x + txt.width / 2,
        y: txt.y + txt.height / 2,
      };

      const element: Element = {
        id: elementId,
        investigationId: targetInvestigationId,
        label,
        notes: '',
        tags: [],
        properties: [],
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        events: [],
        geo: null,
        visual: {
          ...DEFAULT_ELEMENT_VISUAL,
          shape: 'rectangle',
          size: 'small',
          color: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
        },
        position,
        isPositionLocked: false,
        assetIds: [],
        parentGroupId: null,
        isGroup: false,
        isAnnotation: false,
        childIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      elements.push(element);
    }

    // ========================================================================
    // Import arrows as links
    // ========================================================================
    const links: Link[] = [];

    for (const arrow of arrows) {
      const fromExcalidrawId = arrow.startBinding?.elementId;
      const toExcalidrawId = arrow.endBinding?.elementId;

      if (!fromExcalidrawId || !toExcalidrawId) continue;

      const fromId = idMap.get(fromExcalidrawId);
      const toId = idMap.get(toExcalidrawId);

      if (!fromId || !toId) continue;

      // Get arrow label from bound text
      const boundTexts = arrow.boundElements?.filter(b => b.type === 'text') || [];
      let label = '';
      if (boundTexts.length > 0) {
        const textEl = textById.get(boundTexts[0].id);
        if (textEl) {
          label = (textEl.originalText || textEl.text || '').replace(/\n/g, ' ').trim();
        }
      }

      const linkId = generateUUID() as LinkId;

      const link: Link = {
        id: linkId,
        investigationId: targetInvestigationId,
        fromId,
        toId,
        sourceHandle: null,
        targetHandle: null,
        label,
        notes: '',
        tags: [],
        properties: [],
        directed: false,
        direction: mapArrowDirection(arrow.startArrowhead, arrow.endArrowhead),
        confidence: null,
        source: '',
        date: null,
        dateRange: null,
        visual: {
          ...DEFAULT_LINK_VISUAL,
          style: mapStrokeStyle(arrow.strokeStyle),
          thickness: arrow.strokeWidth || 2,
          color: arrow.strokeColor && arrow.strokeColor !== '#1e1e1e'
            ? (EXCALIDRAW_COLORS[arrow.strokeColor] || arrow.strokeColor)
            : DEFAULT_LINK_VISUAL.color,
        },
        curveOffset: { x: 0, y: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      links.push(link);
    }

    // ========================================================================
    // Save to database
    // ========================================================================
    if (elements.length > 0) {
      await db.elements.bulkAdd(elements);
      result.elementsImported = elements.length;
    }

    if (links.length > 0) {
      await db.links.bulkAdd(links);
      result.linksImported = links.length;
    }

    // Warnings
    const skippedArrows = arrows.length - links.length;
    if (skippedArrows > 0) {
      result.warnings.push(
        `${skippedArrows} flèche(s) ignorée(s) (non connectées à des formes)`
      );
    }

    if (imageDownloadCount > 0) {
      result.warnings.push(
        `${imageDownloadCount} image(s) importée(s) depuis le fichier Excalidraw`
      );
    }

    const orphanArrows = activeElements.filter(el =>
      el.type === 'arrow' && !el.startBinding && !el.endBinding
    ).length;
    if (orphanArrows > 0) {
      result.warnings.push(
        `${orphanArrows} flèche(s) libre(s) ignorée(s) (sans connexion)`
      );
    }

    result.success = result.elementsImported > 0;
  } catch (error) {
    result.errors.push(
      `Erreur d'import Excalidraw: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }

  return result;
}
