/**
 * Export Interactive HTML Report Service
 *
 * Generates a self-contained HTML file with:
 * - The report content (Markdown rendered to HTML)
 * - An interactive SVG graph visualization
 * - Bidirectional navigation between report and graph
 * - Thumbnails of image assets
 */

import type { Element, Link, Asset, Dossier, Report, Position } from '../types';
import { fileService } from './fileService';
import i18next from 'i18next';

// CSS variable to hex color map (same as svgExportService)
const CSS_VAR_MAP: Record<string, string> = {
  '--color-bg-canvas': '#faf8f5',
  '--color-bg-primary': '#fffdf9',
  '--color-bg-secondary': '#f7f4ef',
  '--color-bg-tertiary': '#f0ece4',
  '--color-text-primary': '#3d3833',
  '--color-text-secondary': '#6b6560',
  '--color-text-tertiary': '#9a948d',
  '--color-border-default': '#e8e3db',
  '--color-border-strong': '#d4cec4',
  '--color-border-sketchy': '#b8b0a4',
  '--color-accent': '#e07a5f',
  '--color-node-yellow': '#fcd34d',
  '--color-node-pink': '#f9a8d4',
  '--color-node-blue': '#93c5fd',
  '--color-node-green': '#86efac',
  '--color-node-orange': '#fdba74',
  '--color-node-purple': '#c4b5fd',
  '--color-node-red': '#fca5a5',
  '--color-node-cyan': '#67e8f9',
  '--color-node-lime': '#bef264',
};

// Allowed HTML tags in markdown output (whitelist for sanitisation)
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'strong', 'em', 'pre', 'code', 'blockquote',
  'hr', 'li', 'ul', 'a', 'br', 'p', 'dl', 'dt', 'dd',
]);

// Strip any HTML tag not in the whitelist (defense-in-depth after markdown conversion)
function sanitiseHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '';
  });
}

// Simple Markdown to HTML converter (no external dependency)
function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Links (only safe protocols: http, https, mailto, fragment)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_: string, text: string, url: string) => {
      const trimUrl = url.trim().toLowerCase();
      if (/^(https?:|mailto:|#)/.test(trimUrl)) {
        return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
      }
      return text;
    })
    // Line breaks (two spaces or explicit)
    .replace(/  \n/g, '<br>\n')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Wrap lists
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Clean up adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  html = `<p>${html}</p>`.replace(/<p><\/p>/g, '').replace(/<p>(<h[1-6]>)/g, '$1').replace(/(<\/h[1-6]>)<\/p>/g, '$1');

  // Sanitise: strip any tag not in the whitelist
  return sanitiseHtml(html);
}

// Convert element references [[Label|uuid]] to clickable links
function parseElementReferences(html: string): string {
  return html.replace(
    /\[\[([^\]|]+)\|([a-f0-9-]+)\]\]/g,
    (_: string, label: string, id: string) => {
      const safeLabel = label.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<a href="#" class="element-ref" data-element-id="${id}" title="${safeLabel}">${safeLabel}</a>`;
    }
  );
}

// Resolve CSS variable colors to hex
function resolveColor(color: string | undefined, defaultColor: string): string {
  if (!color) return defaultColor;
  // Handle CSS variables
  if (color.startsWith('var(')) {
    const varName = color.match(/var\((--[^)]+)\)/)?.[1];
    if (varName && CSS_VAR_MAP[varName]) return CSS_VAR_MAP[varName];
    // Fallback for common patterns
    if (color.includes('text-tertiary') || color.includes('gray')) return '#9ca3af';
    if (color.includes('text-secondary')) return '#6b7280';
    if (color.includes('text-primary')) return '#111827';
    if (color.includes('accent') || color.includes('blue')) return '#2563eb';
    return defaultColor;
  }
  return color;
}

// Resolve absolute position for elements in groups
// Child elements have positions relative to their parent group
function resolveAbsolutePosition(element: Element, elementsMap: Map<string, Element>): Position {
  if (!element.parentGroupId) return element.position;
  const parent = elementsMap.get(element.parentGroupId);
  if (!parent) return element.position;
  const parentPos = resolveAbsolutePosition(parent, elementsMap);
  return {
    x: parentPos.x + element.position.x,
    y: parentPos.y + element.position.y,
  };
}

// Get group bounds from stored position and dimensions
// Groups in React Flow have their own position (top-left corner) and explicit width/height
function getGroupBounds(group: Element): { x: number; y: number; width: number; height: number } {
  const { x, y } = group.position;
  const width = group.visual?.customWidth || 300;
  const height = group.visual?.customHeight || 200;
  return { x, y, width, height };
}

// Generate SVG for the graph
function generateGraphSVG(elements: Element[], links: Link[], thumbnails: Record<string, string> = {}, noElementsLabel = 'No elements'): string {
  if (elements.length === 0) {
    return `<svg viewBox="0 0 100 100"><text x="50" y="50" text-anchor="middle" class="svg-text">${escapeXml(noElementsLabel)}</text></svg>`;
  }

  const elementMap = new Map(elements.map((e) => [e.id, e]));

  // Pre-compute absolute positions for all elements
  const absolutePositions = new Map<string, Position>();
  for (const el of elements) {
    absolutePositions.set(el.id, resolveAbsolutePosition(el, elementMap));
  }

  // Calculate bounds using absolute positions
  const positions = Array.from(absolutePositions.values());
  const minX = Math.min(...positions.map((p) => p.x)) - 150;
  const maxX = Math.max(...positions.map((p) => p.x)) + 150;
  const minY = Math.min(...positions.map((p) => p.y)) - 150;
  const maxY = Math.max(...positions.map((p) => p.y)) + 150;
  const width = maxX - minX;
  const height = maxY - minY;

  let svg = `<svg id="graph-svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

  // Defs for markers (arrows)
  svg += `
    <defs>
      <marker id="arrow-light" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
      </marker>
      <marker id="arrow-dark" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
      </marker>
    </defs>
  `;

  // Draw groups first (background)
  const groups = elements.filter((e) => e.isGroup);
  for (const group of groups) {
    const bounds = getGroupBounds(group);
    const color = resolveColor(group.visual?.color, '#e5e7eb');
    const borderColor = resolveColor(group.visual?.borderColor, '#d1d5db');

    const groupCenterX = bounds.x + bounds.width / 2;
    const groupCenterY = bounds.y + bounds.height / 2;

    svg += `
      <g class="group" data-element-id="${group.id}" data-x="${groupCenterX}" data-y="${groupCenterY}" style="cursor: pointer;">
        <rect
          x="${bounds.x}" y="${bounds.y}"
          width="${bounds.width}" height="${bounds.height}"
          fill="${color}" fill-opacity="0.3"
          stroke="${borderColor}" stroke-width="2" stroke-dasharray="4,4"
          rx="8"
        />
        <text x="${bounds.x + 8}" y="${bounds.y + 18}" class="svg-text" font-size="12" font-weight="600">${escapeXml(group.label || '')}</text>
      </g>
    `;
  }

  // Draw links
  for (const link of links) {
    const fromPos = absolutePositions.get(link.fromId);
    const toPos = absolutePositions.get(link.toId);
    if (!fromPos || !toPos) continue;

    const color = resolveColor(link.visual?.color, '#9ca3af');
    const style = link.visual?.style || 'solid';
    const strokeDasharray = style === 'dashed' ? '8,4' : style === 'dotted' ? '2,4' : 'none';
    const hasArrow = link.direction === 'forward' || link.direction === 'both';

    // Calculate offset for link label
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = (fromPos.y + toPos.y) / 2;

    svg += `
      <g class="link" data-link-id="${link.id}" data-from="${link.fromId}" data-to="${link.toId}" data-x="${midX}" data-y="${midY}" style="cursor: pointer;">
        <line
          x1="${fromPos.x}" y1="${fromPos.y}"
          x2="${toPos.x}" y2="${toPos.y}"
          stroke="${color}"
          stroke-width="2"
          stroke-dasharray="${strokeDasharray}"
          ${hasArrow ? 'class="arrow-line"' : ''}
        />
        ${link.label ? `<text x="${midX}" y="${midY - 8}" text-anchor="middle" class="svg-text-secondary" font-size="12">${escapeXml(link.label)}</text>` : ''}
      </g>
    `;
  }

  // Size calculation (same as svgExportService)
  const SIZE_MAP: Record<string, number> = { small: 40, medium: 56, large: 72 };
  function getBaseSize(size: string | number): number {
    if (typeof size === 'number') return size;
    return SIZE_MAP[size] ?? 56;
  }
  function computeNodeDimensions(el: Element): { width: number; height: number } {
    if (el.visual?.customWidth && el.visual?.customHeight) {
      return { width: el.visual.customWidth, height: el.visual.customHeight };
    }
    const baseSize = getBaseSize(el.visual?.size || 'medium');
    const label = el.label || '';
    const estimatedTextWidth = label.length * 7 + 24;
    const shape = el.visual?.shape || 'rectangle';
    if (shape === 'rectangle') {
      const width = Math.min(Math.max(estimatedTextWidth * 1.2, 120), 280);
      const height = Math.max(baseSize * 0.5, 40);
      return { width, height };
    }
    if (shape === 'square') {
      const size = Math.max(baseSize, 60);
      return { width: size, height: size };
    }
    if (shape === 'circle') {
      const size = Math.min(Math.max(estimatedTextWidth * 0.8, baseSize, 50), 150);
      return { width: size, height: size };
    }
    if (shape === 'diamond') {
      const size = Math.min(Math.max(estimatedTextWidth * 0.9, baseSize, 60), 150);
      return { width: size, height: size };
    }
    return { width: baseSize, height: baseSize };
  }

  // Draw nodes (not groups)
  for (const el of elements) {
    if (el.isGroup) continue;

    const pos = absolutePositions.get(el.id);
    if (!pos) continue;
    const { x, y } = pos;
    const color = resolveColor(el.visual?.color, '#3b82f6');
    const borderColor = resolveColor(el.visual?.borderColor, color);
    const shape = el.visual?.shape || 'rectangle';
    const dims = computeNodeDimensions(el);

    // Find thumbnail for this element
    let thumbDataUrl = '';
    if (el.assetIds && el.assetIds.length > 0) {
      for (const aid of el.assetIds) {
        if (thumbnails[aid]) { thumbDataUrl = thumbnails[aid]; break; }
      }
    }

    const left = x - dims.width / 2;
    const top = y - dims.height / 2;
    let shapeEl = '';
    let clipDef = '';

    if (thumbDataUrl) {
      // Node with embedded image — clipPath + image + label bar
      const clipId = `clip-ir-${el.id}`;
      const labelBarH = 16;
      const imgH = dims.height - labelBarH;

      switch (shape) {
        case 'circle':
          clipDef = `<defs><clipPath id="${clipId}"><ellipse cx="${x}" cy="${y}" rx="${dims.width / 2}" ry="${dims.height / 2}"/></clipPath></defs>`;
          shapeEl = `<ellipse cx="${x}" cy="${y}" rx="${dims.width / 2}" ry="${dims.height / 2}" fill="#f3f4f6" stroke="${borderColor}" stroke-width="1"/>`;
          shapeEl += `<image href="${thumbDataUrl}" x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`;
          break;
        case 'diamond': {
          const d = dims.width / 2;
          const pts = `${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`;
          clipDef = `<defs><clipPath id="${clipId}"><polygon points="${pts}"/></clipPath></defs>`;
          shapeEl = `<polygon points="${pts}" fill="#f3f4f6" stroke="${borderColor}" stroke-width="1"/>`;
          shapeEl += `<image href="${thumbDataUrl}" x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`;
          break;
        }
        case 'square':
          clipDef = `<defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}"/></clipPath></defs>`;
          shapeEl = `<rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" fill="#f3f4f6" stroke="${borderColor}" stroke-width="1"/>`;
          shapeEl += `<image href="${thumbDataUrl}" x="${left}" y="${top}" width="${dims.width}" height="${imgH > 0 ? imgH : dims.height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`;
          shapeEl += `<rect x="${left}" y="${top + dims.height - labelBarH}" width="${dims.width}" height="${labelBarH}" fill="#f3f4f6" clip-path="url(#${clipId})"/>`;
          break;
        default: // rectangle
          clipDef = `<defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" rx="4"/></clipPath></defs>`;
          shapeEl = `<rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" rx="4" fill="#f3f4f6" stroke="${borderColor}" stroke-width="1"/>`;
          shapeEl += `<image href="${thumbDataUrl}" x="${left}" y="${top}" width="${dims.width}" height="${imgH > 0 ? imgH : dims.height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`;
          shapeEl += `<rect x="${left}" y="${top + dims.height - labelBarH}" width="${dims.width}" height="${labelBarH}" fill="#f3f4f6" clip-path="url(#${clipId})"/>`;
      }
    } else {
      // Standard colored shape (no image)
      switch (shape) {
        case 'circle':
          shapeEl = `<ellipse cx="${x}" cy="${y}" rx="${dims.width / 2}" ry="${dims.height / 2}" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
          break;
        case 'diamond': {
          const d = dims.width / 2;
          shapeEl = `<polygon points="${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
          break;
        }
        case 'square':
          shapeEl = `<rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
          break;
        default: // rectangle
          shapeEl = `<rect x="${left}" y="${top}" width="${dims.width}" height="${dims.height}" rx="4" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
      }
    }

    // Build data attributes including tags
    const tagsAttr = el.tags && el.tags.length > 0 ? ` data-tags="${escapeXml(el.tags.join(','))}"` : '';

    svg += `
      <g class="node" data-element-id="${el.id}" data-x="${x}" data-y="${y}"${tagsAttr} style="cursor: pointer;">
        ${clipDef}${shapeEl}
        <text x="${x}" y="${y + dims.height / 2 + 16}" text-anchor="middle" class="svg-text" font-size="13" font-weight="500">${escapeXml(el.label || '')}</text>
      </g>
    `;
  }

  svg += '</svg>';
  return svg;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate thumbnail from image blob
async function generateThumbnail(blob: Blob, maxSize = 200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

// Generate thumbnails for all image assets
async function generateThumbnails(assets: Asset[]): Promise<Record<string, string>> {
  const thumbnails: Record<string, string> = {};

  for (const asset of assets) {
    if (!asset.mimeType.startsWith('image/')) continue;

    try {
      const file = await fileService.getAssetFile(asset);
      if (file) {
        thumbnails[asset.id] = await generateThumbnail(file);
      }
    } catch (err) {
      console.warn(`Failed to generate thumbnail for asset ${asset.id}:`, err);
    }
  }

  return thumbnails;
}

// Build element details HTML for tooltip/panel
function buildElementDetails(elements: Element[], thumbnails: Record<string, string>): string {
  const details: Record<string, string> = {};

  for (const el of elements) {
    let html = `<div class="element-detail">`;
    const defaultLabel = el.isAnnotation ? 'Note' : '';
    html += `<h4>${escapeXml(el.label || defaultLabel)}</h4>`;

    if (el.tags && el.tags.length > 0) {
      html += `<div class="tags">${el.tags.map((t) => `<span class="tag">${escapeXml(t)}</span>`).join('')}</div>`;
    }

    if (el.properties && el.properties.length > 0) {
      html += '<dl class="properties">';
      for (const prop of el.properties) {
        html += `<dt>${escapeXml(prop.key)}</dt><dd>${escapeXml(String(prop.value))}</dd>`;
      }
      html += '</dl>';
    }

    if (el.notes) {
      html += `<div class="notes">${markdownToHtml(el.notes)}</div>`;
    }

    // Check for thumbnail
    if (el.assetIds && el.assetIds.length > 0) {
      for (const assetId of el.assetIds) {
        if (thumbnails[assetId]) {
          html += `<img src="${thumbnails[assetId]}" class="thumbnail" alt="Asset" />`;
        }
      }
    }

    html += '</div>';
    details[el.id] = html;
  }

  return JSON.stringify(details);
}

// Main export function
export async function exportInteractiveReport(
  dossier: Dossier,
  report: Report,
  elements: Element[],
  links: Link[],
  assets: Asset[]
): Promise<Blob> {
  // Resolve i18n strings at export time
  const t = (key: string) => i18next.t(`modals:synthesis.interactive.${key}`);
  const lang = i18next.language?.substring(0, 2) || 'en';
  const i18nStrings = {
    lang,
    noElements: t('noElements'),
    report: t('report'),
    search: t('search'),
    filterByTags: t('filterByTags'),
    toggleLayout: t('toggleLayout'),
    exportMarkdown: t('exportMarkdown'),
    info: t('info'),
    theme: t('theme'),
    dossier: t('dossier'),
    createdOn: t('createdOn'),
    exportedOn: t('exportedOn'),
    elements: t('elements'),
    links: t('links'),
    groups: t('groups'),
    searchPlaceholder: t('searchPlaceholder'),
    graph: t('graph'),
    toc: t('toc'),
  };

  // Generate thumbnails
  const thumbnails = await generateThumbnails(assets);

  // Generate SVG
  const graphSvg = generateGraphSVG(elements, links, thumbnails, i18nStrings.noElements);

  // Build TOC and report HTML
  const tocItems: { id: string; title: string }[] = [];
  let reportHtml = `<h1>${escapeXml(report.title)}</h1>`;
  for (const section of report.sections) {
    const slug = section.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    tocItems.push({ id: slug, title: section.title });
    reportHtml += `<h2 id="${slug}">${escapeXml(section.title)}</h2>`;
    reportHtml += parseElementReferences(markdownToHtml(section.content));
  }

  // Build markdown without links (for export button)
  let reportMarkdown = `# ${report.title}\n\n`;
  for (const section of report.sections) {
    reportMarkdown += `## ${section.title}\n\n`;
    // Replace [[Label|uuid]] with just Label
    reportMarkdown += section.content.replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1') + '\n\n';
  }

  // Element details for tooltips
  const elementDetails = buildElementDetails(elements, thumbnails);

  // Stats
  const groupCount = elements.filter((e) => e.isGroup).length;
  const elementCount = elements.length - groupCount;

  // Assemble full HTML
  const html = buildFullHTML({
    title: report.title || dossier.name,
    dossierName: dossier.name,
    dossierDescription: dossier.description || '',
    dossierCreatedAt: dossier.createdAt instanceof Date
      ? dossier.createdAt.toISOString()
      : dossier.createdAt,
    reportHtml,
    reportMarkdown,
    graphSvg,
    elementDetails,
    exportDate: new Date().toISOString(),
    elementCount,
    linkCount: links.length,
    groupCount,
    tocItems,
    i18n: i18nStrings,
  });

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

interface HTMLParams {
  title: string;
  dossierName: string;
  dossierDescription: string;
  dossierCreatedAt: string;
  reportHtml: string;
  reportMarkdown: string;
  graphSvg: string;
  elementDetails: string;
  exportDate: string;
  // Stats
  elementCount: number;
  linkCount: number;
  groupCount: number;
  // TOC
  tocItems: { id: string; title: string }[];
  // i18n
  i18n: {
    lang: string;
    noElements: string;
    report: string;
    search: string;
    filterByTags: string;
    toggleLayout: string;
    exportMarkdown: string;
    info: string;
    theme: string;
    dossier: string;
    createdOn: string;
    exportedOn: string;
    elements: string;
    links: string;
    groups: string;
    searchPlaceholder: string;
    graph: string;
    toc: string;
  };
}

function buildFullHTML(params: HTMLParams): string {
  const s = params.i18n;
  return `<!DOCTYPE html>
<html lang="${s.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:;"><title>${escapeXml(params.title)} - ${escapeXml(s.report)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg-primary:#ffffff;--bg-secondary:#f9fafb;--bg-tertiary:#f3f4f6;--text-primary:#111827;--text-secondary:#6b7280;--text-tertiary:#9ca3af;--border-default:#e5e7eb;--accent:#2563eb;--graph-bg:#f9fafb}
[data-theme="dark"]{--bg-primary:#111827;--bg-secondary:#1f2937;--bg-tertiary:#374151;--text-primary:#f9fafb;--text-secondary:#d1d5db;--text-tertiary:#9ca3af;--border-default:#374151;--accent:#3b82f6;--graph-bg:#1f2937}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;color:var(--text-primary);background:var(--bg-primary);transition:background .2s,color .2s}
#app{display:flex;flex-direction:column;height:100vh}
header{padding:12px 16px;border-bottom:1px solid var(--border-default);background:var(--bg-secondary);display:flex;align-items:center;gap:12px}
header .logo{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text-primary)}
header .logo svg{width:24px;height:24px}
header h1{font-size:16px;font-weight:600;flex:1}
header .actions{display:flex;align-items:center;gap:8px}
header .meta{font-size:12px;color:var(--text-tertiary)}
.header-btn,#theme-toggle,#graph-controls button{width:32px;height:32px;border:1px solid var(--border-default);background:var(--bg-primary);border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--text-primary);transition:background .2s}
.header-btn{text-decoration:none}
#graph-controls button{font-size:16px}
#theme-toggle{font-size:16px}
.header-btn:hover,#theme-toggle:hover,#graph-controls button:hover{background:var(--bg-tertiary)}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;align-items:center;justify-content:center}
.modal-overlay.visible{display:flex}
.modal{background:var(--bg-primary);border-radius:8px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.modal-header{padding:16px 20px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;justify-content:space-between}
.modal-header h2{font-size:16px;font-weight:600}
.modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);padding:4px}
.modal-close:hover{color:var(--text-primary)}
.modal-body{padding:20px}
.modal-body dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px}
.modal-body dt{font-weight:500;color:var(--text-secondary)}
.modal-body dd{color:var(--text-primary)}
.modal-body .description{margin-top:16px;padding-top:16px;border-top:1px solid var(--border-default)}
.modal-footer{padding:12px 20px;border-top:1px solid var(--border-default);display:flex;justify-content:flex-end;gap:8px}
.modal-footer a{font-size:12px;color:var(--accent);text-decoration:none}
.modal-footer a:hover{text-decoration:underline}
.modal-body .stats{display:flex;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-default);font-size:12px;color:var(--text-secondary)}
.toc{margin-bottom:16px;font-size:12px}
.toc details{border:1px solid var(--border-default);border-radius:4px;background:var(--bg-secondary)}
.toc summary{padding:8px 12px;cursor:pointer;color:var(--text-secondary);font-weight:500;list-style:none}
.toc summary::-webkit-details-marker{display:none}
.toc summary::before{content:'\\25B8 '}
.toc details[open] summary::before{content:'\\25BE '}
.toc ul{list-style:none;padding:0 12px 8px;margin:0}
.toc li{padding:4px 0}
.toc a{color:var(--text-secondary);text-decoration:none}
.toc a:hover{color:var(--accent)}
#report-panel{scroll-behavior:smooth;flex:1 1 50%;overflow-y:auto;padding:24px 32px;border-right:none;order:0;min-width:200px}
main.layout-reversed #report-panel{order:2;border-left:none}
main.layout-reversed #graph-panel{order:0}
main.layout-reversed #resize-handle{order:1}
#resize-handle{width:5px;cursor:col-resize;background:var(--border-default);flex-shrink:0;order:1;transition:background .15s}
#resize-handle:hover,#resize-handle.dragging{background:var(--accent);opacity:.6}
#graph-panel{flex:1 1 50%;min-width:200px;order:2;position:relative;background:var(--graph-bg);overflow:hidden;transition:background .2s}
main{display:flex;flex:1;overflow:hidden}
#report-panel h1{font-size:24px;margin-bottom:24px}
#report-panel h2{font-size:18px;margin:24px 0 12px;color:var(--text-primary)}
#report-panel h3{font-size:16px;margin:16px 0 8px}
#report-panel p{margin-bottom:12px}
#report-panel ul,#report-panel ol{margin:8px 0 8px 24px}
#report-panel li{margin-bottom:4px}
#report-panel blockquote{border-left:3px solid var(--border-default);padding-left:12px;margin:12px 0;color:var(--text-secondary)}
#report-panel pre{background:var(--bg-tertiary);padding:12px;border-radius:4px;overflow-x:auto;margin:12px 0}
#report-panel code{font-family:"SF Mono",Consolas,monospace;font-size:13px;background:var(--bg-tertiary);padding:2px 4px;border-radius:2px}
#report-panel pre code{background:none;padding:0}
.element-ref{color:var(--accent);text-decoration:none;border-bottom:1px dashed var(--accent);cursor:pointer}
.element-ref:hover{background:rgba(37,99,235,.1)}
.element-ref.highlighted{background:rgba(37,99,235,.2);border-bottom-style:solid}
#graph-container{width:100%;height:100%;cursor:grab}
#graph-container:active{cursor:grabbing}
#graph-svg{width:100%;height:100%}
#graph-svg .svg-text{fill:var(--text-primary)}
#graph-svg .svg-text-secondary{fill:var(--text-secondary)}
#graph-svg .arrow-line{marker-end:url(#arrow-light)}
[data-theme="dark"] #graph-svg .arrow-line{marker-end:url(#arrow-dark)}
#graph-svg .node:hover{filter:brightness(1.1)}
#graph-svg .node.highlighted circle,#graph-svg .node.highlighted rect,#graph-svg .node.highlighted polygon,#graph-svg .node.highlighted ellipse{stroke:var(--accent);stroke-width:3}
#graph-svg .group.highlighted rect{stroke:var(--accent);stroke-width:3}
#graph-svg .link.highlighted line{stroke:var(--accent);stroke-width:4}
#graph-controls{position:absolute;bottom:16px;right:16px;display:flex;flex-direction:column;gap:4px}
#element-tooltip{position:absolute;background:var(--bg-primary);border:1px solid var(--border-default);border-radius:4px;padding:12px;max-width:300px;box-shadow:0 4px 12px rgba(0,0,0,.1);display:none;z-index:100}
#element-tooltip.visible{display:block}
#element-tooltip h4{font-size:14px;font-weight:600;margin-bottom:8px}
#element-tooltip .tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
#element-tooltip .tag{font-size:11px;background:var(--bg-tertiary);padding:2px 6px;border-radius:2px}
#element-tooltip .properties{font-size:12px;margin-bottom:8px}
#element-tooltip .properties dt{color:var(--text-tertiary);float:left;clear:left;margin-right:8px}
#element-tooltip .properties dd{margin-bottom:4px}
#element-tooltip .notes{font-size:12px;color:var(--text-secondary);border-top:1px solid var(--border-default);padding-top:8px;margin-top:8px}
#element-tooltip .thumbnail{max-width:100%;margin-top:8px;border-radius:4px}
#search-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;align-items:flex-start;justify-content:center;padding-top:15vh}
#search-overlay.visible{display:flex}
#search-box{background:var(--bg-primary);border:1px solid var(--border-default);border-radius:8px;width:400px;max-width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2);overflow:hidden}
#search-box input{width:100%;padding:12px 16px;border:none;background:transparent;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit}
#search-box input::placeholder{color:var(--text-tertiary)}
#search-results{max-height:300px;overflow-y:auto;border-top:1px solid var(--border-default)}
#search-results:empty{border-top:none}
.search-result{padding:8px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;color:var(--text-primary)}
.search-result:hover,.search-result.active{background:var(--bg-tertiary)}
.search-result .sr-tags{font-size:11px;color:var(--text-tertiary);margin-left:auto}
.tag-filter-wrap{position:relative}
#tag-popover{display:none;position:absolute;top:100%;right:0;margin-top:4px;background:var(--bg-primary);border:1px solid var(--border-default);border-radius:4px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;min-width:180px;max-width:280px;max-height:300px;overflow-y:auto;flex-wrap:wrap;gap:4px}
#tag-popover.visible{display:flex}
.tag-chip{padding:2px 8px;border:1px solid var(--border-default);border-radius:2px;background:var(--bg-primary);cursor:pointer;font-size:11px;color:var(--text-secondary);transition:all .15s}
.tag-chip:hover{background:var(--bg-tertiary)}
.tag-chip.active{background:var(--accent);color:#fff;border-color:var(--accent)}
#tag-btn.has-active{border-color:var(--accent);color:var(--accent)}
#graph-svg .node.tag-hidden{opacity:.1}
#graph-svg .link.tag-hidden{opacity:.08}
#mobile-tabs{display:none}
@media(max-width:768px){
#mobile-tabs{display:flex;border-bottom:1px solid var(--border-default);background:var(--bg-primary)}
#mobile-tabs .tab{flex:1;padding:12px 16px;border:none;background:transparent;font-size:14px;font-weight:500;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
#mobile-tabs .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
main{flex-direction:column}
main[data-active-tab="report"] #report-panel{display:block;width:100%;height:100%;border-right:none;border-bottom:none;padding:16px}
main[data-active-tab="report"] #graph-panel{display:none}
main[data-active-tab="graph"] #report-panel{display:none}
main[data-active-tab="graph"] #graph-panel{display:block;width:100%;height:100%}
#graph-controls{bottom:12px;right:12px;gap:8px}
#graph-controls button{width:44px;height:44px;font-size:20px}
#graph-container{touch-action:none;user-select:none;-webkit-user-select:none}
#element-tooltip{position:fixed;bottom:0;left:0;right:0;top:auto;max-width:100%;max-height:50vh;border-radius:12px 12px 0 0;transform:translateY(100%);transition:transform .2s ease-out;box-shadow:0 -4px 20px rgba(0,0,0,.15);overflow-y:auto;z-index:100}
#element-tooltip.visible{transform:translateY(0)}
}
@media print{
#graph-panel,#graph-controls{display:none}
#report-panel{width:100%;border:none}
}
</style></head>
<body><div id="app">
<header><a href="https://zeroneurone.com" target="_blank" rel="noopener" class="logo" title="ZeroNeurone"><svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="currentColor" fill-opacity="0.1"/><text x="6" y="22" font-family="system-ui" font-size="14" font-weight="700" fill="currentColor">0-1</text></svg></a>
<h1>${escapeXml(params.dossierName)}</h1>
<div class="actions"><button id="search-btn" class="header-btn" title="${escapeXml(s.search)}">&#x2315;</button><div class="tag-filter-wrap"><button id="tag-btn" class="header-btn" title="${escapeXml(s.filterByTags)}" style="display:none;">&#x25cb;</button><div id="tag-popover"></div></div><button id="layout-toggle" class="header-btn" title="${escapeXml(s.toggleLayout)}">&#x21C4;</button><button id="export-md" class="header-btn" title="${escapeXml(s.exportMarkdown)}">MD</button><button id="info-btn" class="header-btn" title="${escapeXml(s.info)}">i</button><button id="theme-toggle" class="header-btn" title="${escapeXml(s.theme)}">☀</button></div>
</header>
<div id="info-modal" class="modal-overlay"><div class="modal"><div class="modal-header"><h2>${escapeXml(s.info)}</h2><button class="modal-close" id="modal-close">&times;</button></div><div class="modal-body"><dl><dt>${escapeXml(s.dossier)}</dt><dd>${escapeXml(params.dossierName)}</dd><dt>${escapeXml(s.createdOn)}</dt><dd>${new Date(params.dossierCreatedAt).toLocaleDateString(s.lang)}</dd><dt>${escapeXml(s.exportedOn)}</dt><dd>${new Date(params.exportDate).toLocaleDateString(s.lang)}</dd></dl><div class="stats"><span>${params.elementCount} ${escapeXml(s.elements)}</span><span>${params.linkCount} ${escapeXml(s.links)}</span>${params.groupCount > 0 ? `<span>${params.groupCount} ${escapeXml(s.groups)}</span>` : ''}</div>${params.dossierDescription ? `<div class="description"><p>${escapeXml(params.dossierDescription)}</p></div>` : ''}</div><div class="modal-footer"><a href="https://zeroneurone.com" target="_blank" rel="noopener">zeroneurone.com</a></div></div></div>
<div id="search-overlay"><div id="search-box"><input id="search-input" type="text" placeholder="${escapeXml(s.searchPlaceholder)}" autocomplete="off"/><div id="search-results"></div></div></div>
<nav id="mobile-tabs"><button class="tab active" data-tab="report">${escapeXml(s.report)}</button><button class="tab" data-tab="graph">${escapeXml(s.graph)}</button></nav>
<main data-active-tab="report">
<aside id="report-panel">${params.tocItems.length > 1 ? `<nav class="toc"><details><summary>${escapeXml(s.toc)}</summary><ul>${params.tocItems.map((item) => `<li><a href="#${item.id}">${escapeXml(item.title)}</a></li>`).join('')}</ul></details></nav>` : ''}${params.reportHtml}</aside>
<div id="resize-handle"></div>
<section id="graph-panel"><div id="graph-container">${params.graphSvg}</div><div id="graph-controls"><button id="zoom-in" title="Zoom +">+</button><button id="zoom-out" title="Zoom -">&minus;</button><button id="zoom-reset" title="Reset">&#x27F2;</button></div><div id="element-tooltip"></div></section>
</main></div>
<script>(function(){
var D=document,Q=function(s){return D.querySelector(s)},QA=function(s){return D.querySelectorAll(s)};
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
var elementDetails=${params.elementDetails};
var reportMarkdown=${JSON.stringify(params.reportMarkdown)};
var infoModal=Q('#info-modal'),infoBtn=Q('#info-btn'),modalClose=Q('#modal-close');
infoBtn.addEventListener('click',function(){infoModal.classList.add('visible')});
modalClose.addEventListener('click',function(){infoModal.classList.remove('visible')});
infoModal.addEventListener('click',function(e){if(e.target===infoModal)infoModal.classList.remove('visible')});
D.addEventListener('keydown',function(e){if(e.key==='Escape'&&infoModal.classList.contains('visible'))infoModal.classList.remove('visible')});
var mobileTabs=Q('#mobile-tabs'),mainEl=Q('main');
QA('#mobile-tabs .tab').forEach(function(tab){tab.addEventListener('click',function(){QA('#mobile-tabs .tab').forEach(function(t){t.classList.remove('active')});tab.classList.add('active');mainEl.setAttribute('data-active-tab',tab.dataset.tab)})});
Q('#export-md').addEventListener('click',function(){var b=new Blob([reportMarkdown],{type:'text/markdown;charset=utf-8'}),u=URL.createObjectURL(b),a=D.createElement('a');a.href=u;a.download='${escapeXml(params.title.replace(/[^a-zA-Z0-9-_ ]/g, ''))}.md';D.body.appendChild(a);a.click();D.body.removeChild(a);URL.revokeObjectURL(u)});
var themeToggle=Q('#theme-toggle'),html=D.documentElement;
var savedTheme=localStorage.getItem('theme'),prefersDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
if(savedTheme==='dark'||(!savedTheme&&prefersDark)){html.setAttribute('data-theme','dark');themeToggle.textContent='\u263E'}
themeToggle.addEventListener('click',function(){var dk=html.getAttribute('data-theme')==='dark';if(dk){html.removeAttribute('data-theme');themeToggle.textContent='\u2600';localStorage.setItem('theme','light')}else{html.setAttribute('data-theme','dark');themeToggle.textContent='\u263E';localStorage.setItem('theme','dark')}});
var svg=Q('#graph-svg'),container=Q('#graph-container'),tooltip=Q('#element-tooltip');
var vb=svg.viewBox.baseVal,ivb={x:vb.x,y:vb.y,width:vb.width,height:vb.height};
var panning=false,sp={x:0,y:0},svb={x:0,y:0};
container.addEventListener('mousedown',function(e){if(e.target.closest('.node')||e.target.closest('.group'))return;panning=true;sp={x:e.clientX,y:e.clientY};svb={x:vb.x,y:vb.y}});
window.addEventListener('mousemove',function(e){if(!panning)return;var sc=vb.width/container.clientWidth;vb.x=svb.x-(e.clientX-sp.x)*sc;vb.y=svb.y-(e.clientY-sp.y)*sc});
window.addEventListener('mouseup',function(){panning=false});
var tsp={x:0,y:0},tsvb={x:0,y:0};
container.addEventListener('touchstart',function(e){if(e.touches.length===1){var t=e.touches[0];if(t.target.closest('.node')||t.target.closest('.group'))return;panning=true;tsp={x:t.clientX,y:t.clientY};tsvb={x:vb.x,y:vb.y}}},{passive:true});
container.addEventListener('touchmove',function(e){if(e.touches.length===1&&panning){var t=e.touches[0],sc=vb.width/container.clientWidth;vb.x=tsvb.x-(t.clientX-tsp.x)*sc;vb.y=tsvb.y-(t.clientY-tsp.y)*sc}},{passive:true});
container.addEventListener('touchend',function(){panning=false},{passive:true});
var ipd=0,ipvb={width:0,height:0,x:0,y:0};
function gpd(ts){var dx=ts[0].clientX-ts[1].clientX,dy=ts[0].clientY-ts[1].clientY;return Math.sqrt(dx*dx+dy*dy)}
function gpc(ts){return{x:(ts[0].clientX+ts[1].clientX)/2,y:(ts[0].clientY+ts[1].clientY)/2}}
container.addEventListener('touchstart',function(e){if(e.touches.length===2){panning=false;ipd=gpd(e.touches);ipvb={width:vb.width,height:vb.height,x:vb.x,y:vb.y}}},{passive:true});
container.addEventListener('touchmove',function(e){if(e.touches.length===2&&ipd>0){e.preventDefault();var cd=gpd(e.touches),sc=ipd/cd,ctr=gpc(e.touches),r=container.getBoundingClientRect();var sx=ipvb.x+(ctr.x-r.left)/r.width*ipvb.width,sy=ipvb.y+(ctr.y-r.top)/r.height*ipvb.height;var nw=ipvb.width*sc,nh=ipvb.height*sc;vb.width=nw;vb.height=nh;vb.x=sx-(ctr.x-r.left)/r.width*nw;vb.y=sy-(ctr.y-r.top)/r.height*nh}},{passive:false});
container.addEventListener('touchend',function(e){if(e.touches.length<2)ipd=0},{passive:true});
function zoomAt(f,cx,cy){var nw=vb.width/f,nh=vb.height/f;vb.x=cx-(cx-vb.x)/f-(nw-vb.width)/2*(f>1?0:1);vb.y=cy-(cy-vb.y)/f-(nh-vb.height)/2*(f>1?0:1);vb.width=nw;vb.height=nh}
function zoom(f){var cx=vb.x+vb.width/2,cy=vb.y+vb.height/2;vb.width/=f;vb.height/=f;vb.x=cx-vb.width/2;vb.y=cy-vb.height/2}
function focusOnPoint(cx,cy,zl){var tw=ivb.width/zl,th=ivb.height/zl;vb.width=tw;vb.height=th;vb.x=cx-tw/2;vb.y=cy-th/2}
container.addEventListener('wheel',function(e){e.preventDefault();zoom(e.deltaY<0?1.1:0.9)});
Q('#zoom-in').addEventListener('click',function(){zoom(1.2)});
Q('#zoom-out').addEventListener('click',function(){zoom(0.8)});
Q('#zoom-reset').addEventListener('click',function(){vb.x=ivb.x;vb.y=ivb.y;vb.width=ivb.width;vb.height=ivb.height});
function getNodeCenter(nd){var dx=nd.dataset.x,dy=nd.dataset.y;if(dx&&dy)return{x:parseFloat(dx),y:parseFloat(dy)};var sh=nd.querySelector('circle,rect,polygon,ellipse');if(!sh)return null;if(sh.tagName==='circle'||sh.tagName==='ellipse')return{x:parseFloat(sh.getAttribute('cx')),y:parseFloat(sh.getAttribute('cy'))};if(sh.tagName==='rect')return{x:parseFloat(sh.getAttribute('x'))+parseFloat(sh.getAttribute('width'))/2,y:parseFloat(sh.getAttribute('y'))+parseFloat(sh.getAttribute('height'))/2};if(sh.tagName==='polygon'){var pts=sh.getAttribute('points').split(' '),co=pts.map(function(p){return p.split(',').map(Number)}),ax=co.reduce(function(s,c){return s+c[0]},0)/co.length,ay=co.reduce(function(s,c){return s+c[1]},0)/co.length;return{x:ax,y:ay}}return null}
QA('#graph-svg .node').forEach(function(nd){nd.addEventListener('click',function(e){e.stopPropagation();var eid=nd.dataset.elementId;QA('#graph-svg .node,#graph-svg .group').forEach(function(n){n.classList.remove('highlighted')});nd.classList.add('highlighted');var refs=QA('.element-ref[data-element-id="'+eid+'"]');if(refs.length>0){refs[0].scrollIntoView({behavior:'smooth',block:'center'});QA('.element-ref').forEach(function(r){r.classList.remove('highlighted')});refs.forEach(function(r){r.classList.add('highlighted')})}showTooltip(eid,e.clientX,e.clientY)})});
QA('.element-ref').forEach(function(ref){ref.addEventListener('click',function(e){e.preventDefault();var eid=ref.dataset.elementId;if(window.innerWidth<=768){QA('#mobile-tabs .tab').forEach(function(t){t.classList.remove('active')});Q('#mobile-tabs [data-tab="graph"]').classList.add('active');mainEl.setAttribute('data-active-tab','graph')}QA('.element-ref').forEach(function(r){r.classList.remove('highlighted')});ref.classList.add('highlighted');QA('#graph-svg .node,#graph-svg .group,#graph-svg .link').forEach(function(n){n.classList.remove('highlighted')});var nd=Q('#graph-svg .node[data-element-id="'+eid+'"]');if(nd){nd.classList.add('highlighted');var c=getNodeCenter(nd);if(c)focusOnPoint(c.x,c.y,2);return}var gr=Q('#graph-svg .group[data-element-id="'+eid+'"]');if(gr){gr.classList.add('highlighted');var gx=gr.dataset.x,gy=gr.dataset.y;if(gx&&gy)focusOnPoint(parseFloat(gx),parseFloat(gy),1.5);return}var lk=Q('#graph-svg .link[data-link-id="'+eid+'"]');if(lk){lk.classList.add('highlighted');var lx=lk.dataset.x,ly=lk.dataset.y;if(lx&&ly)focusOnPoint(parseFloat(lx),parseFloat(ly),2)}})});
function showTooltip(eid,x,y){var det=elementDetails[eid];if(!det){tooltip.classList.remove('visible');return}tooltip.innerHTML=det;tooltip.classList.add('visible');var r=container.getBoundingClientRect(),l=x-r.left+10,t=y-r.top+10;if(l+300>r.width)l=r.width-310;if(t+tooltip.offsetHeight>r.height)t=y-r.top-tooltip.offsetHeight-10;tooltip.style.left=l+'px';tooltip.style.top=t+'px'}
D.addEventListener('click',function(e){if(!e.target.closest('.node')&&!e.target.closest('#element-tooltip'))tooltip.classList.remove('visible')});
var searchOverlay=Q('#search-overlay'),searchInput=Q('#search-input'),searchResultsEl=Q('#search-results'),searchBtn=Q('#search-btn');
var searchIndex=[];
QA('#graph-svg .node,#graph-svg .group').forEach(function(nd){var id=nd.dataset.elementId,te=nd.querySelector('text'),lb=te?te.textContent:'',tg=nd.dataset.tags?nd.dataset.tags.split(','):[];searchIndex.push({id:id,label:lb,tags:tg,isGroup:nd.classList.contains('group')})});
var ari=-1;
function openSearch(){searchOverlay.classList.add('visible');searchInput.value='';searchResultsEl.innerHTML='';ari=-1;setTimeout(function(){searchInput.focus()},50)}
function closeSearch(){searchOverlay.classList.remove('visible');searchInput.value='';searchResultsEl.innerHTML=''}
searchBtn.addEventListener('click',openSearch);
D.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openSearch()}if(e.key==='Escape'&&searchOverlay.classList.contains('visible'))closeSearch()});
searchOverlay.addEventListener('click',function(e){if(e.target===searchOverlay)closeSearch()});
function navigateToElement(id){closeSearch();if(window.innerWidth<=768){QA('#mobile-tabs .tab').forEach(function(t){t.classList.remove('active')});Q('#mobile-tabs [data-tab="graph"]').classList.add('active');mainEl.setAttribute('data-active-tab','graph')}QA('#graph-svg .node,#graph-svg .group,#graph-svg .link').forEach(function(n){n.classList.remove('highlighted')});var nd=Q('#graph-svg .node[data-element-id="'+id+'"]')||Q('#graph-svg .group[data-element-id="'+id+'"]');if(nd){nd.classList.add('highlighted');var c=getNodeCenter(nd);if(c)focusOnPoint(c.x,c.y,2);showTooltip(id,container.getBoundingClientRect().left+container.clientWidth/2,container.getBoundingClientRect().top+container.clientHeight/2)}var refs=QA('.element-ref[data-element-id="'+id+'"]');QA('.element-ref').forEach(function(r){r.classList.remove('highlighted')});refs.forEach(function(r){r.classList.add('highlighted')});if(refs.length>0)refs[0].scrollIntoView({behavior:'smooth',block:'center'})}
searchInput.addEventListener('input',function(){var q=searchInput.value.toLowerCase().trim();if(!q){searchResultsEl.innerHTML='';ari=-1;return}var m=searchIndex.filter(function(it){return it.label.toLowerCase().includes(q)||it.tags.some(function(t){return t.toLowerCase().includes(q)})}).slice(0,20);ari=-1;searchResultsEl.innerHTML=m.map(function(it,i){return'<div class="search-result" data-idx="'+i+'" data-id="'+it.id+'"><span>'+esc(it.label)+'</span>'+(it.tags.length?'<span class="sr-tags">'+it.tags.map(function(t){return esc(t)}).join(', ')+'</span>':'')+'</div>'}).join('');searchResultsEl.querySelectorAll('.search-result').forEach(function(r){r.addEventListener('click',function(){navigateToElement(r.dataset.id)})})});
searchInput.addEventListener('keydown',function(e){var res=searchResultsEl.querySelectorAll('.search-result');if(!res.length)return;if(e.key==='ArrowDown'){e.preventDefault();ari=Math.min(ari+1,res.length-1);res.forEach(function(r,i){r.classList.toggle('active',i===ari)});res[ari].scrollIntoView({block:'nearest'})}else if(e.key==='ArrowUp'){e.preventDefault();ari=Math.max(ari-1,0);res.forEach(function(r,i){r.classList.toggle('active',i===ari)});res[ari].scrollIntoView({block:'nearest'})}else if(e.key==='Enter'&&ari>=0){e.preventDefault();navigateToElement(res[ari].dataset.id)}});
var tagBtn=Q('#tag-btn'),tagPopover=Q('#tag-popover'),allTags=new Set();
searchIndex.forEach(function(it){it.tags.forEach(function(t){allTags.add(t)})});
if(allTags.size>0){tagBtn.style.display='';tagPopover.innerHTML=Array.from(allTags).sort().map(function(t){return'<button class="tag-chip" data-tag="'+t.replace(/"/g,'&quot;')+'">'+esc(t)+'</button>'}).join('');var activeTags=new Set();tagBtn.addEventListener('click',function(e){e.stopPropagation();tagPopover.classList.toggle('visible')});D.addEventListener('click',function(e){if(!e.target.closest('.tag-filter-wrap'))tagPopover.classList.remove('visible')});tagPopover.querySelectorAll('.tag-chip').forEach(function(ch){ch.addEventListener('click',function(e){e.stopPropagation();var tg=ch.dataset.tag;if(activeTags.has(tg)){activeTags.delete(tg);ch.classList.remove('active')}else{activeTags.add(tg);ch.classList.add('active')}tagBtn.classList.toggle('has-active',activeTags.size>0);applyTagFilter()})});function applyTagFilter(){if(activeTags.size===0){QA('#graph-svg .node,#graph-svg .group,#graph-svg .link').forEach(function(n){n.classList.remove('tag-hidden')});return}var vis=new Set();QA('#graph-svg .node,#graph-svg .group').forEach(function(nd){var nt=nd.dataset.tags?nd.dataset.tags.split(','):[],ok=nt.some(function(t){return activeTags.has(t)});nd.classList.toggle('tag-hidden',!ok);if(ok)vis.add(nd.dataset.elementId)});QA('#graph-svg .link').forEach(function(lk){var v=vis.has(lk.dataset.from)||vis.has(lk.dataset.to);lk.classList.toggle('tag-hidden',!v)})}}
Q('#layout-toggle').addEventListener('click',function(){mainEl.classList.toggle('layout-reversed');localStorage.setItem('layout',mainEl.classList.contains('layout-reversed')?'reversed':'normal')});
if(localStorage.getItem('layout')==='reversed')mainEl.classList.add('layout-reversed');
var resizeHandle=Q('#resize-handle'),reportPanel=Q('#report-panel'),graphPanel=Q('#graph-panel'),resizing=false;
resizeHandle.addEventListener('mousedown',function(e){e.preventDefault();resizing=true;resizeHandle.classList.add('dragging');D.body.style.cursor='col-resize';D.body.style.userSelect='none'});
window.addEventListener('mousemove',function(e){if(!resizing)return;var mr=mainEl.getBoundingClientRect(),reversed=mainEl.classList.contains('layout-reversed');var pos=e.clientX-mr.left,total=mr.width,pct=Math.max(15,Math.min(85,(pos/total)*100));if(reversed){reportPanel.style.flex='0 0 '+(100-pct)+'%';graphPanel.style.flex='0 0 '+pct+'%'}else{reportPanel.style.flex='0 0 '+pct+'%';graphPanel.style.flex='0 0 '+(100-pct)+'%'}});
window.addEventListener('mouseup',function(){if(resizing){resizing=false;resizeHandle.classList.remove('dragging');D.body.style.cursor='';D.body.style.userSelect=''}});
resizeHandle.addEventListener('touchstart',function(e){resizing=true;resizeHandle.classList.add('dragging')},{passive:true});
window.addEventListener('touchmove',function(e){if(!resizing||!e.touches.length)return;var t=e.touches[0],mr=mainEl.getBoundingClientRect(),reversed=mainEl.classList.contains('layout-reversed');var pos=t.clientX-mr.left,total=mr.width,pct=Math.max(15,Math.min(85,(pos/total)*100));if(reversed){reportPanel.style.flex='0 0 '+(100-pct)+'%';graphPanel.style.flex='0 0 '+pct+'%'}else{reportPanel.style.flex='0 0 '+pct+'%';graphPanel.style.flex='0 0 '+(100-pct)+'%'}},{passive:true});
window.addEventListener('touchend',function(){if(resizing){resizing=false;resizeHandle.classList.remove('dragging')}});
})();</script></body></html>`;
}
