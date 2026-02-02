/**
 * Export Interactive HTML Report Service
 *
 * Generates a self-contained HTML file with:
 * - The report content (Markdown rendered to HTML)
 * - An interactive SVG graph visualization
 * - Bidirectional navigation between report and graph
 * - Thumbnails of image assets
 */

import type { Element, Link, Asset, Investigation, Report } from '../types';
import { fileService } from './fileService';

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

// Generate SVG for the graph
function generateGraphSVG(elements: Element[], links: Link[]): string {
  if (elements.length === 0) {
    return '<svg viewBox="0 0 100 100"><text x="50" y="50" text-anchor="middle" fill="#9ca3af">Aucun element</text></svg>';
  }

  // Calculate bounds
  const positions = elements.map((e) => e.position);
  const minX = Math.min(...positions.map((p) => p.x)) - 100;
  const maxX = Math.max(...positions.map((p) => p.x)) + 100;
  const minY = Math.min(...positions.map((p) => p.y)) - 100;
  const maxY = Math.max(...positions.map((p) => p.y)) + 100;
  const width = maxX - minX;
  const height = maxY - minY;

  const elementMap = new Map(elements.map((e) => [e.id, e]));

  let svg = `<svg id="graph-svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

  // Defs for markers (arrows)
  svg += `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
      </marker>
    </defs>
  `;

  // Draw links first (so they appear behind nodes)
  for (const link of links) {
    const from = elementMap.get(link.fromId);
    const to = elementMap.get(link.toId);
    if (!from || !to) continue;

    const color = link.visual?.color || '#9ca3af';
    const style = link.visual?.style || 'solid';
    const strokeDasharray = style === 'dashed' ? '8,4' : style === 'dotted' ? '2,4' : 'none';
    const hasArrow = link.direction === 'forward' || link.direction === 'both';

    // Calculate offset for link label
    const midX = (from.position.x + to.position.x) / 2;
    const midY = (from.position.y + to.position.y) / 2;

    svg += `
      <g class="link" data-link-id="${link.id}">
        <line
          x1="${from.position.x}" y1="${from.position.y}"
          x2="${to.position.x}" y2="${to.position.y}"
          stroke="${color}"
          stroke-width="2"
          stroke-dasharray="${strokeDasharray}"
          ${hasArrow ? 'marker-end="url(#arrow)"' : ''}
        />
        ${link.label ? `<text x="${midX}" y="${midY - 8}" text-anchor="middle" fill="#6b7280" font-size="12">${escapeXml(link.label)}</text>` : ''}
      </g>
    `;
  }

  // Draw nodes
  for (const el of elements) {
    if (el.isGroup) continue; // Skip groups for now

    const { x, y } = el.position;
    const color = el.visual?.color || '#3b82f6';
    const shape = el.visual?.shape || 'rectangle';
    const sizeMap: Record<string, number> = { small: 30, medium: 40, large: 50 };
    const rawSize = el.visual?.size || 'medium';
    const size = typeof rawSize === 'number' ? rawSize : sizeMap[rawSize] || 40;

    let shapeEl = '';
    switch (shape) {
      case 'circle':
        shapeEl = `<ellipse cx="${x}" cy="${y}" rx="${size / 2}" ry="${size / 2}" fill="${color}" />`;
        break;
      case 'diamond':
        const d = size / 2;
        shapeEl = `<polygon points="${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}" fill="${color}" />`;
        break;
      case 'square':
        shapeEl = `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" />`;
        break;
      default: // rectangle
        shapeEl = `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="4" fill="${color}" />`;
    }

    svg += `
      <g class="node" data-element-id="${el.id}" style="cursor: pointer;">
        ${shapeEl}
        <text x="${x}" y="${y + size / 2 + 16}" text-anchor="middle" fill="#111827" font-size="13" font-weight="500">${escapeXml(el.label || '')}</text>
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
    html += `<h4>${escapeXml(el.label || 'Sans titre')}</h4>`;

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

  // Build report HTML
  let reportHtml = `<h1>${escapeXml(report.title)}</h1>`;
  for (const section of report.sections) {
    reportHtml += `<h2>${escapeXml(section.title)}</h2>`;
    reportHtml += parseElementReferences(markdownToHtml(section.content));
  }

  // Element details for tooltips
  const elementDetails = buildElementDetails(elements, thumbnails);

  // Assemble full HTML
  const html = buildFullHTML({
    title: report.title || investigation.name,
    investigationName: investigation.name,
    reportHtml,
    graphSvg,
    elementDetails,
    exportDate: new Date().toISOString(),
  });

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

interface HTMLParams {
  title: string;
  investigationName: string;
  reportHtml: string;
  graphSvg: string;
  elementDetails: string;
  exportDate: string;
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
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary);
      background: var(--bg-primary);
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

    header h1 {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }

    header .meta {
      font-size: 12px;
      color: var(--text-tertiary);
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
      background: var(--bg-secondary);
      overflow: hidden;
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
    }

    #graph-controls button:hover {
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
      <h1>${escapeXml(params.investigationName)}</h1>
      <span class="meta">Export: ${new Date(params.exportDate).toLocaleDateString('fr-FR')}</span>
    </header>

    <main>
      <aside id="report-panel">
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
        if (e.target.closest('.node')) return;
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

      // Zoom
      function zoom(factor) {
        const cx = viewBox.x + viewBox.width / 2;
        const cy = viewBox.y + viewBox.height / 2;
        viewBox.width /= factor;
        viewBox.height /= factor;
        viewBox.x = cx - viewBox.width / 2;
        viewBox.y = cy - viewBox.height / 2;
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

      // Node click -> scroll to report ref
      document.querySelectorAll('#graph-svg .node').forEach(node => {
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          const elementId = node.dataset.elementId;

          // Highlight node
          document.querySelectorAll('#graph-svg .node').forEach(n => n.classList.remove('highlighted'));
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

      // Report ref click -> highlight node
      document.querySelectorAll('.element-ref').forEach(ref => {
        ref.addEventListener('click', (e) => {
          e.preventDefault();
          const elementId = ref.dataset.elementId;

          // Highlight ref
          document.querySelectorAll('.element-ref').forEach(r => r.classList.remove('highlighted'));
          ref.classList.add('highlighted');

          // Highlight and pan to node
          const node = document.querySelector('#graph-svg .node[data-element-id="' + elementId + '"]');
          if (node) {
            document.querySelectorAll('#graph-svg .node').forEach(n => n.classList.remove('highlighted'));
            node.classList.add('highlighted');

            // Pan to node (get transform from node position)
            const shape = node.querySelector('circle, rect, polygon, ellipse');
            if (shape) {
              let cx, cy;
              if (shape.tagName === 'circle' || shape.tagName === 'ellipse') {
                cx = parseFloat(shape.getAttribute('cx'));
                cy = parseFloat(shape.getAttribute('cy'));
              } else if (shape.tagName === 'rect') {
                cx = parseFloat(shape.getAttribute('x')) + parseFloat(shape.getAttribute('width')) / 2;
                cy = parseFloat(shape.getAttribute('y')) + parseFloat(shape.getAttribute('height')) / 2;
              } else {
                // polygon - use transform
                const transform = node.getAttribute('transform');
                const match = transform && transform.match(/translate\\(([^,]+),\\s*([^)]+)\\)/);
                if (match) {
                  cx = parseFloat(match[1]);
                  cy = parseFloat(match[2]);
                }
              }

              if (cx !== undefined && cy !== undefined) {
                viewBox.x = cx - viewBox.width / 2;
                viewBox.y = cy - viewBox.height / 2;
              }
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
