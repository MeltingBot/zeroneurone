/**
 * Export Interactive HTML Report Service
 *
 * Generates a self-contained HTML file with:
 * - The report content (Markdown rendered to HTML)
 * - An interactive SVG graph visualization
 * - Bidirectional navigation between report and graph
 * - Thumbnails of image assets
 */

import type { Element, Link, Asset, Investigation, Report, Position } from '../types';
import { fileService } from './fileService';

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
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Line breaks (two spaces or explicit)
    .replace(/  \n/g, '<br>\n')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Wrap lists
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Clean up adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  return `<p>${html}</p>`.replace(/<p><\/p>/g, '').replace(/<p>(<h[1-6]>)/g, '$1').replace(/(<\/h[1-6]>)<\/p>/g, '$1');
}

// Convert element references [[Label|uuid]] to clickable links
function parseElementReferences(html: string): string {
  return html.replace(
    /\[\[([^\]|]+)\|([a-f0-9-]+)\]\]/g,
    '<a href="#" class="element-ref" data-element-id="$2" title="$1">$1</a>'
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
function generateGraphSVG(elements: Element[], links: Link[]): string {
  if (elements.length === 0) {
    return '<svg viewBox="0 0 100 100"><text x="50" y="50" text-anchor="middle" class="svg-text">Aucun element</text></svg>';
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

    svg += `
      <g class="group" data-element-id="${group.id}">
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
      <g class="link" data-link-id="${link.id}" data-x="${midX}" data-y="${midY}" style="cursor: pointer;">
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

    let shapeEl = '';
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
        shapeEl = `<rect x="${x - dims.width / 2}" y="${y - dims.height / 2}" width="${dims.width}" height="${dims.height}" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
        break;
      default: // rectangle
        shapeEl = `<rect x="${x - dims.width / 2}" y="${y - dims.height / 2}" width="${dims.width}" height="${dims.height}" rx="4" fill="${color}" stroke="${borderColor}" stroke-width="1" />`;
    }

    // Build data attributes including tags
    const tagsAttr = el.tags && el.tags.length > 0 ? ` data-tags="${escapeXml(el.tags.join(','))}"` : '';

    svg += `
      <g class="node" data-element-id="${el.id}" data-x="${x}" data-y="${y}"${tagsAttr} style="cursor: pointer;">
        ${shapeEl}
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
  investigation: Investigation,
  report: Report,
  elements: Element[],
  links: Link[],
  assets: Asset[]
): Promise<Blob> {
  // Generate thumbnails
  const thumbnails = await generateThumbnails(assets);

  // Generate SVG
  const graphSvg = generateGraphSVG(elements, links);

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
    title: report.title || investigation.name,
    investigationName: investigation.name,
    investigationDescription: investigation.description || '',
    investigationCreatedAt: investigation.createdAt instanceof Date
      ? investigation.createdAt.toISOString()
      : investigation.createdAt,
    reportHtml,
    reportMarkdown,
    graphSvg,
    elementDetails,
    exportDate: new Date().toISOString(),
    elementCount,
    linkCount: links.length,
    groupCount,
    tocItems,
  });

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

interface HTMLParams {
  title: string;
  investigationName: string;
  investigationDescription: string;
  investigationCreatedAt: string;
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
}

function buildFullHTML(params: HTMLParams): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(params.title)} - Rapport</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f9fafb;
      --bg-tertiary: #f3f4f6;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --text-tertiary: #9ca3af;
      --border-default: #e5e7eb;
      --accent: #2563eb;
      --graph-bg: #f9fafb;
    }

    [data-theme="dark"] {
      --bg-primary: #111827;
      --bg-secondary: #1f2937;
      --bg-tertiary: #374151;
      --text-primary: #f9fafb;
      --text-secondary: #d1d5db;
      --text-tertiary: #9ca3af;
      --border-default: #374151;
      --accent: #3b82f6;
      --graph-bg: #1f2937;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary);
      background: var(--bg-primary);
      transition: background 0.2s, color 0.2s;
    }

    /* Layout */
    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-default);
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    header .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      color: var(--text-primary);
    }

    header .logo svg {
      width: 24px;
      height: 24px;
    }

    header h1 {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }

    header .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    header .meta {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .header-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-default);
      background: var(--bg-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      transition: background 0.2s;
      text-decoration: none;
    }

    .header-btn:hover {
      background: var(--bg-tertiary);
    }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.visible {
      display: flex;
    }

    .modal {
      background: var(--bg-primary);
      border-radius: 8px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }

    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-header h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 4px;
    }

    .modal-close:hover {
      color: var(--text-primary);
    }

    .modal-body {
      padding: 20px;
    }

    .modal-body dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
    }

    .modal-body dt {
      font-weight: 500;
      color: var(--text-secondary);
    }

    .modal-body dd {
      color: var(--text-primary);
    }

    .modal-body .description {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-default);
    }

    .modal-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--border-default);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .modal-footer a {
      font-size: 12px;
      color: var(--accent);
      text-decoration: none;
    }

    .modal-footer a:hover {
      text-decoration: underline;
    }

    .modal-body .stats {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-default);
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* TOC */
    .toc {
      margin-bottom: 16px;
      font-size: 12px;
    }

    .toc details {
      border: 1px solid var(--border-default);
      border-radius: 4px;
      background: var(--bg-secondary);
    }

    .toc summary {
      padding: 8px 12px;
      cursor: pointer;
      color: var(--text-secondary);
      font-weight: 500;
      list-style: none;
    }

    .toc summary::-webkit-details-marker {
      display: none;
    }

    .toc summary::before {
      content: '▸ ';
    }

    .toc details[open] summary::before {
      content: '▾ ';
    }

    .toc ul {
      list-style: none;
      padding: 0 12px 8px;
      margin: 0;
    }

    .toc li {
      padding: 4px 0;
    }

    .toc a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .toc a:hover {
      color: var(--accent);
    }

    #report-panel {
      scroll-behavior: smooth;
    }

    main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Report Panel */
    #report-panel {
      width: 50%;
      overflow-y: auto;
      padding: 24px 32px;
      border-right: 1px solid var(--border-default);
    }

    #report-panel h1 { font-size: 24px; margin-bottom: 24px; }
    #report-panel h2 { font-size: 18px; margin: 24px 0 12px; color: var(--text-primary); }
    #report-panel h3 { font-size: 16px; margin: 16px 0 8px; }
    #report-panel p { margin-bottom: 12px; }
    #report-panel ul, #report-panel ol { margin: 8px 0 8px 24px; }
    #report-panel li { margin-bottom: 4px; }
    #report-panel blockquote {
      border-left: 3px solid var(--border-default);
      padding-left: 12px;
      margin: 12px 0;
      color: var(--text-secondary);
    }
    #report-panel pre {
      background: var(--bg-tertiary);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 12px 0;
    }
    #report-panel code {
      font-family: "SF Mono", Consolas, monospace;
      font-size: 13px;
      background: var(--bg-tertiary);
      padding: 2px 4px;
      border-radius: 2px;
    }
    #report-panel pre code {
      background: none;
      padding: 0;
    }

    /* Element references */
    .element-ref {
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px dashed var(--accent);
      cursor: pointer;
    }
    .element-ref:hover {
      background: rgba(37, 99, 235, 0.1);
    }
    .element-ref.highlighted {
      background: rgba(37, 99, 235, 0.2);
      border-bottom-style: solid;
    }

    /* Graph Panel */
    #graph-panel {
      width: 50%;
      position: relative;
      background: var(--graph-bg);
      overflow: hidden;
      transition: background 0.2s;
    }

    #graph-container {
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    #graph-container:active {
      cursor: grabbing;
    }

    #graph-svg {
      width: 100%;
      height: 100%;
    }

    /* SVG text colors - adapt to theme */
    #graph-svg .svg-text {
      fill: var(--text-primary);
    }
    #graph-svg .svg-text-secondary {
      fill: var(--text-secondary);
    }

    /* Arrow markers adapt to theme */
    #graph-svg .arrow-line {
      marker-end: url(#arrow-light);
    }
    [data-theme="dark"] #graph-svg .arrow-line {
      marker-end: url(#arrow-dark);
    }

    #graph-svg .node:hover {
      filter: brightness(1.1);
    }

    #graph-svg .node.highlighted circle,
    #graph-svg .node.highlighted rect,
    #graph-svg .node.highlighted polygon,
    #graph-svg .node.highlighted ellipse {
      stroke: var(--accent);
      stroke-width: 3;
    }

    #graph-svg .group.highlighted rect {
      stroke: var(--accent);
      stroke-width: 3;
    }

    #graph-svg .link.highlighted line {
      stroke: var(--accent);
      stroke-width: 4;
    }

    /* Graph controls */
    #graph-controls {
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    #graph-controls button {
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-default);
      background: var(--bg-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      transition: background 0.2s;
    }

    #graph-controls button:hover {
      background: var(--bg-tertiary);
    }

    /* Theme toggle */
    #theme-toggle {
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-default);
      background: var(--bg-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      transition: background 0.2s;
    }
    #theme-toggle:hover {
      background: var(--bg-tertiary);
    }

    /* Element detail tooltip */
    #element-tooltip {
      position: absolute;
      background: var(--bg-primary);
      border: 1px solid var(--border-default);
      border-radius: 4px;
      padding: 12px;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      display: none;
      z-index: 100;
    }

    #element-tooltip.visible {
      display: block;
    }

    #element-tooltip h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    #element-tooltip .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }

    #element-tooltip .tag {
      font-size: 11px;
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 2px;
    }

    #element-tooltip .properties {
      font-size: 12px;
      margin-bottom: 8px;
    }

    #element-tooltip .properties dt {
      color: var(--text-tertiary);
      float: left;
      clear: left;
      margin-right: 8px;
    }

    #element-tooltip .properties dd {
      margin-bottom: 4px;
    }

    #element-tooltip .notes {
      font-size: 12px;
      color: var(--text-secondary);
      border-top: 1px solid var(--border-default);
      padding-top: 8px;
      margin-top: 8px;
    }

    #element-tooltip .thumbnail {
      max-width: 100%;
      margin-top: 8px;
      border-radius: 4px;
    }

    /* Mobile */
    @media (max-width: 768px) {
      main {
        flex-direction: column;
      }

      #report-panel, #graph-panel {
        width: 100%;
        height: 50%;
      }

      #report-panel {
        border-right: none;
        border-bottom: 1px solid var(--border-default);
        padding: 16px;
      }

      #graph-panel {
        height: 50%;
      }
    }

    /* Print */
    @media print {
      #graph-panel, #graph-controls {
        display: none;
      }

      #report-panel {
        width: 100%;
        border: none;
      }
    }
  </style>
</head>
<body>
  <div id="app">
    <header>
      <a href="https://zeroneurone.com" target="_blank" rel="noopener" class="logo" title="ZeroNeurone">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="6" fill="currentColor" fill-opacity="0.1"/>
          <text x="6" y="22" font-family="system-ui" font-size="14" font-weight="700" fill="currentColor">0-1</text>
        </svg>
      </a>
      <h1>${escapeXml(params.investigationName)}</h1>
      <div class="actions">
        <button id="export-md" class="header-btn" title="Export Markdown">MD</button>
        <button id="info-btn" class="header-btn" title="Informations">i</button>
        <button id="theme-toggle" class="header-btn" title="Theme">☀</button>
      </div>
    </header>

    <!-- Info Modal -->
    <div id="info-modal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h2>Informations</h2>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <dl>
            <dt>Investigation</dt>
            <dd>${escapeXml(params.investigationName)}</dd>
            <dt>Creee le</dt>
            <dd>${new Date(params.investigationCreatedAt).toLocaleDateString('fr-FR')}</dd>
            <dt>Exportee le</dt>
            <dd>${new Date(params.exportDate).toLocaleDateString('fr-FR')}</dd>
          </dl>
          <div class="stats">
            <span>${params.elementCount} elements</span>
            <span>${params.linkCount} liens</span>
            ${params.groupCount > 0 ? `<span>${params.groupCount} groupes</span>` : ''}
          </div>
          ${params.investigationDescription ? `<div class="description"><p>${escapeXml(params.investigationDescription)}</p></div>` : ''}
        </div>
        <div class="modal-footer">
          <a href="https://zeroneurone.com" target="_blank" rel="noopener">zeroneurone.com</a>
        </div>
      </div>
    </div>

    <main>
      <aside id="report-panel">
        ${params.tocItems.length > 1 ? `
        <nav class="toc">
          <details>
            <summary>Sommaire</summary>
            <ul>
              ${params.tocItems.map((item) => `<li><a href="#${item.id}">${escapeXml(item.title)}</a></li>`).join('')}
            </ul>
          </details>
        </nav>
        ` : ''}
        ${params.reportHtml}
      </aside>

      <section id="graph-panel">
        <div id="graph-container">
          ${params.graphSvg}
        </div>

        <div id="graph-controls">
          <button id="zoom-in" title="Zoom +">+</button>
          <button id="zoom-out" title="Zoom -">−</button>
          <button id="zoom-reset" title="Reset">⟲</button>
        </div>

        <div id="element-tooltip"></div>
      </section>
    </main>
  </div>

  <script>
    (function() {
      // Element details data
      const elementDetails = ${params.elementDetails};

      // Report markdown for export
      const reportMarkdown = ${JSON.stringify(params.reportMarkdown)};

      // Info modal
      const infoModal = document.getElementById('info-modal');
      const infoBtn = document.getElementById('info-btn');
      const modalClose = document.getElementById('modal-close');

      infoBtn.addEventListener('click', () => {
        infoModal.classList.add('visible');
      });

      modalClose.addEventListener('click', () => {
        infoModal.classList.remove('visible');
      });

      infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
          infoModal.classList.remove('visible');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && infoModal.classList.contains('visible')) {
          infoModal.classList.remove('visible');
        }
      });

      // Export markdown button
      document.getElementById('export-md').addEventListener('click', () => {
        const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '${escapeXml(params.title.replace(/[^a-zA-Z0-9-_ ]/g, ''))}.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      // Theme toggle
      const themeToggle = document.getElementById('theme-toggle');
      const html = document.documentElement;

      // Check saved preference or system preference
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        html.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☾';
      }

      themeToggle.addEventListener('click', () => {
        const isDark = html.getAttribute('data-theme') === 'dark';
        if (isDark) {
          html.removeAttribute('data-theme');
          themeToggle.textContent = '☀';
          localStorage.setItem('theme', 'light');
        } else {
          html.setAttribute('data-theme', 'dark');
          themeToggle.textContent = '☾';
          localStorage.setItem('theme', 'dark');
        }
      });

      // SVG pan & zoom state
      const svg = document.getElementById('graph-svg');
      const container = document.getElementById('graph-container');
      const tooltip = document.getElementById('element-tooltip');

      let viewBox = svg.viewBox.baseVal;
      let initialViewBox = { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height };
      let isPanning = false;
      let startPoint = { x: 0, y: 0 };
      let startViewBox = { x: 0, y: 0 };

      // Pan
      container.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node') || e.target.closest('.group')) return;
        isPanning = true;
        startPoint = { x: e.clientX, y: e.clientY };
        startViewBox = { x: viewBox.x, y: viewBox.y };
      });

      window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const scale = viewBox.width / container.clientWidth;
        viewBox.x = startViewBox.x - (e.clientX - startPoint.x) * scale;
        viewBox.y = startViewBox.y - (e.clientY - startPoint.y) * scale;
      });

      window.addEventListener('mouseup', () => {
        isPanning = false;
      });

      // Zoom around point
      function zoomAt(factor, cx, cy) {
        const newWidth = viewBox.width / factor;
        const newHeight = viewBox.height / factor;
        viewBox.x = cx - (cx - viewBox.x) / factor - (newWidth - viewBox.width) / 2 * (factor > 1 ? 0 : 1);
        viewBox.y = cy - (cy - viewBox.y) / factor - (newHeight - viewBox.height) / 2 * (factor > 1 ? 0 : 1);
        viewBox.width = newWidth;
        viewBox.height = newHeight;
      }

      // Zoom at center
      function zoom(factor) {
        const cx = viewBox.x + viewBox.width / 2;
        const cy = viewBox.y + viewBox.height / 2;
        viewBox.width /= factor;
        viewBox.height /= factor;
        viewBox.x = cx - viewBox.width / 2;
        viewBox.y = cy - viewBox.height / 2;
      }

      // Pan and zoom to focus on a point
      function focusOnPoint(cx, cy, zoomLevel) {
        const targetWidth = initialViewBox.width / zoomLevel;
        const targetHeight = initialViewBox.height / zoomLevel;
        viewBox.width = targetWidth;
        viewBox.height = targetHeight;
        viewBox.x = cx - targetWidth / 2;
        viewBox.y = cy - targetHeight / 2;
      }

      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 0.9);
      });

      document.getElementById('zoom-in').addEventListener('click', () => zoom(1.2));
      document.getElementById('zoom-out').addEventListener('click', () => zoom(0.8));
      document.getElementById('zoom-reset').addEventListener('click', () => {
        viewBox.x = initialViewBox.x;
        viewBox.y = initialViewBox.y;
        viewBox.width = initialViewBox.width;
        viewBox.height = initialViewBox.height;
      });

      // Get node center from data attributes or shape
      function getNodeCenter(node) {
        // First try data attributes (preferred)
        const dataX = node.dataset.x;
        const dataY = node.dataset.y;
        if (dataX && dataY) {
          return { x: parseFloat(dataX), y: parseFloat(dataY) };
        }

        // Fallback to shape analysis
        const shape = node.querySelector('circle, rect, polygon, ellipse');
        if (!shape) return null;

        if (shape.tagName === 'circle' || shape.tagName === 'ellipse') {
          return {
            x: parseFloat(shape.getAttribute('cx')),
            y: parseFloat(shape.getAttribute('cy'))
          };
        } else if (shape.tagName === 'rect') {
          return {
            x: parseFloat(shape.getAttribute('x')) + parseFloat(shape.getAttribute('width')) / 2,
            y: parseFloat(shape.getAttribute('y')) + parseFloat(shape.getAttribute('height')) / 2
          };
        } else if (shape.tagName === 'polygon') {
          const points = shape.getAttribute('points').split(' ');
          const coords = points.map(p => p.split(',').map(Number));
          const avgX = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          const avgY = coords.reduce((s, c) => s + c[1], 0) / coords.length;
          return { x: avgX, y: avgY };
        }
        return null;
      }

      // Node click -> scroll to report ref
      document.querySelectorAll('#graph-svg .node').forEach(node => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          const elementId = node.dataset.elementId;

          // Highlight node
          document.querySelectorAll('#graph-svg .node, #graph-svg .group').forEach(n => n.classList.remove('highlighted'));
          node.classList.add('highlighted');

          // Find refs in report and scroll to first
          const refs = document.querySelectorAll('.element-ref[data-element-id="' + elementId + '"]');
          if (refs.length > 0) {
            refs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.querySelectorAll('.element-ref').forEach(r => r.classList.remove('highlighted'));
            refs.forEach(r => r.classList.add('highlighted'));
          }

          // Show tooltip
          showTooltip(elementId, e.clientX, e.clientY);
        });
      });

      // Report ref click -> highlight and ZOOM to node or link
      document.querySelectorAll('.element-ref').forEach(ref => {
        ref.addEventListener('click', (e) => {
          e.preventDefault();
          const elementId = ref.dataset.elementId;

          // Highlight ref
          document.querySelectorAll('.element-ref').forEach(r => r.classList.remove('highlighted'));
          ref.classList.add('highlighted');

          // Clear all highlights
          document.querySelectorAll('#graph-svg .node, #graph-svg .group, #graph-svg .link').forEach(n => n.classList.remove('highlighted'));

          // First try to find a node with this ID
          const node = document.querySelector('#graph-svg .node[data-element-id="' + elementId + '"]');
          if (node) {
            node.classList.add('highlighted');
            const center = getNodeCenter(node);
            if (center) {
              focusOnPoint(center.x, center.y, 2);
            }
            return;
          }

          // Then try to find a link with this ID
          const link = document.querySelector('#graph-svg .link[data-link-id="' + elementId + '"]');
          if (link) {
            link.classList.add('highlighted');
            const dataX = link.dataset.x;
            const dataY = link.dataset.y;
            if (dataX && dataY) {
              focusOnPoint(parseFloat(dataX), parseFloat(dataY), 2);
            }
          }
        });
      });

      // Tooltip
      function showTooltip(elementId, x, y) {
        const detail = elementDetails[elementId];
        if (!detail) {
          tooltip.classList.remove('visible');
          return;
        }

        tooltip.innerHTML = detail;
        tooltip.classList.add('visible');

        // Position tooltip
        const rect = container.getBoundingClientRect();
        let left = x - rect.left + 10;
        let top = y - rect.top + 10;

        // Keep in bounds
        if (left + 300 > rect.width) left = rect.width - 310;
        if (top + tooltip.offsetHeight > rect.height) top = y - rect.top - tooltip.offsetHeight - 10;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      }

      // Hide tooltip on click elsewhere
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.node') && !e.target.closest('#element-tooltip')) {
          tooltip.classList.remove('visible');
        }
      });
    })();
  </script>
</body>
</html>`;
}
