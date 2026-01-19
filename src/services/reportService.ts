import type { Investigation, Element, Link, Asset } from '../types';
import { insightsService } from './insightsService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for secure rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Configure DOMPurify - allow safe tags only, no scripts
const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  // Force all links to open in new tab with noopener
  ADD_ATTR: ['target', 'rel'],
};

export type ReportFormat = 'html' | 'markdown' | 'extended-json';

export interface ReportOptions {
  title: string;
  includeDescription: boolean;
  includeSummary: boolean;
  includeElements: boolean;
  includeLinks: boolean;
  includeInsights: boolean;
  includeTimeline: boolean;  // Uses real events from elements
  includeProperties: boolean;  // Element custom properties
  includeFiles: boolean;  // Attached files list
  includeFiches: boolean;  // Detailed element sheets
  groupElementsByTag: boolean;
  sortElementsBy: 'label' | 'date' | 'confidence';
  tableFormat: boolean;  // Use tables instead of cards/lists
  // Screenshots (data URLs provided by modal)
  canvasScreenshot?: string | null;
  mapScreenshot?: string | null;
  timelineScreenshot?: string | null;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  title: '',
  includeDescription: true,
  includeSummary: true,
  includeElements: true,
  includeLinks: true,
  includeInsights: true,
  includeTimeline: true,
  includeProperties: true,
  includeFiles: false,
  includeFiches: false,
  groupElementsByTag: false,
  sortElementsBy: 'label',
  tableFormat: true,
};

class ReportService {
  /**
   * Generate report in specified format
   */
  generate(
    format: ReportFormat,
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions
  ): string {
    // Build insights if needed
    if (options.includeInsights && elements.length > 0) {
      insightsService.buildGraph(elements, links);
    }

    switch (format) {
      case 'html':
        return this.generateHTML(investigation, elements, links, assets, options);
      case 'markdown':
        return this.generateMarkdown(investigation, elements, links, assets, options);
      case 'extended-json':
        return this.generateExtendedJSON(investigation, elements, links, assets);
      default:
        return this.generateMarkdown(investigation, elements, links, assets, options);
    }
  }

  /**
   * Generate HTML report
   */
  private generateHTML(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions
  ): string {
    const title = options.title || investigation.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;

    // Collect all events from all elements
    const allEvents = elements.flatMap(el =>
      el.events.map(ev => ({
        ...ev,
        elementLabel: el.label,
        elementId: el.id,
      }))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Count total events and files
    const totalEvents = allEvents.length;
    const totalFiles = elements.reduce((sum, el) => sum + el.assetIds.length, 0);

    let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHTML(title)}</title>
  <style>
    :root {
      --color-primary: #1e40af;
      --color-secondary: #6b7280;
      --color-border: #e5e7eb;
      --color-bg: #f9fafb;
      --color-bg-alt: #eff6ff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #111827;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 40px;
    }
    /* Screenshots need full width */
    .screenshot-section img {
      width: 100%;
      height: auto;
    }
    h1 { font-size: 18pt; margin-bottom: 4pt; color: var(--color-primary); }
    h2 { font-size: 13pt; margin: 16pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.5pt solid var(--color-primary); }
    h3 { font-size: 11pt; margin: 12pt 0 6pt; color: var(--color-secondary); }
    p { margin-bottom: 8pt; }
    .meta { color: var(--color-secondary); font-size: 9pt; margin-bottom: 12pt; }
    .description { background: var(--color-bg); padding: 8pt; margin-bottom: 12pt; border-left: 3pt solid var(--color-primary); }
    .summary { margin-bottom: 16pt; }
    .summary-grid { display: flex; gap: 16pt; flex-wrap: wrap; }
    .summary-item { text-align: center; padding: 8pt 16pt; background: var(--color-bg); }
    .summary-value { font-size: 16pt; font-weight: 600; color: var(--color-primary); }
    .summary-label { font-size: 8pt; color: var(--color-secondary); text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; font-size: 9pt; }
    th { background: var(--color-bg); text-align: left; padding: 6pt 8pt; border: 0.5pt solid var(--color-border); font-weight: 600; }
    td { padding: 6pt 8pt; border: 0.5pt solid var(--color-border); vertical-align: top; }
    tr:nth-child(even) { background: #fafafa; }
    .color-dot { display: inline-block; width: 8pt; height: 8pt; border-radius: 50%; margin-right: 4pt; vertical-align: middle; }
    .tag { display: inline-block; background: var(--color-bg); padding: 1pt 4pt; font-size: 8pt; margin-right: 2pt; }
    .insight-box { background: var(--color-bg-alt); padding: 8pt; margin-bottom: 8pt; }
    .insight-title { font-weight: 600; font-size: 10pt; margin-bottom: 4pt; }
    .insight-list { margin-left: 12pt; font-size: 9pt; }
    .timeline-table td:first-child { white-space: nowrap; font-weight: 500; color: var(--color-primary); width: 80pt; }
    .timeline-table td:nth-child(2) { width: 100pt; }
    .props-table { font-size: 8pt; margin-top: 4pt; }
    .props-table th, .props-table td { padding: 2pt 4pt; }
    .notes { font-size: 9pt; color: var(--color-secondary); font-style: italic; }
    .file-list { font-size: 8pt; color: var(--color-secondary); }
    .media-preview { max-width: 120pt; max-height: 80pt; object-fit: contain; border: 0.5pt solid var(--color-border); margin: 2pt 0; }
    .media-grid { display: flex; flex-wrap: wrap; gap: 8pt; }
    .media-item { text-align: center; max-width: 150pt; }
    .media-item img { max-width: 140pt; max-height: 100pt; object-fit: contain; border: 0.5pt solid var(--color-border); }
    .media-item .media-name { font-size: 7pt; color: var(--color-secondary); margin-top: 2pt; word-break: break-all; }
    .markdown-content { font-size: 9pt; }
    .markdown-content p { margin: 4pt 0; }
    .markdown-content ul, .markdown-content ol { margin: 4pt 0 4pt 16pt; }
    .markdown-content li { margin: 2pt 0; }
    .markdown-content code { background: var(--color-bg); padding: 1pt 3pt; font-size: 8pt; }
    .markdown-content pre { background: var(--color-bg); padding: 6pt; overflow-x: auto; font-size: 8pt; }
    .markdown-content blockquote { border-left: 2pt solid var(--color-border); padding-left: 8pt; color: var(--color-secondary); }
    .markdown-content a { color: var(--color-primary); }
    .fiche { border: 1pt solid var(--color-border); padding: 10pt; margin-bottom: 12pt; background: white; }
    .fiche-table { width: 100%; margin-bottom: 8pt; font-size: 9pt; }
    .fiche-table th { text-align: left; font-size: 8pt; text-transform: uppercase; color: var(--color-secondary); padding: 4pt 6pt; }
    .fiche-table td:first-child { width: 100pt; font-weight: 500; color: var(--color-secondary); }
    @media print {
      body { max-width: 210mm; padding: 10mm; }
      table { break-inside: avoid; }
      .insight-box { break-inside: avoid; }
      .fiche { break-inside: avoid; }
      h2 { break-after: avoid; }
      .screenshot-section { break-inside: avoid; }
      .screenshot-section img { max-width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${this.escapeHTML(title)}</h1>
    <p class="meta">Rapport genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}</p>
  </header>
`;

    // Description
    if (options.includeDescription && investigation.description) {
      html += `  <div class="description markdown-content">${this.markdownToHTML(investigation.description)}</div>\n`;
    }

    // Summary
    if (options.includeSummary) {
      const geoElements = elements.filter(el => el.geo || el.events.some(ev => ev.geo));
      const tagCounts = this.getTagCounts(elements);

      html += `  <section class="summary">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-value">${elements.length}</div>
        <div class="summary-label">Elements</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${links.length}</div>
        <div class="summary-label">Liens</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${totalEvents}</div>
        <div class="summary-label">Evenements</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${geoElements.length}</div>
        <div class="summary-label">Localisations</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${Object.keys(tagCounts).length}</div>
        <div class="summary-label">Tags</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${totalFiles}</div>
        <div class="summary-label">Fichiers</div>
      </div>
    </div>
  </section>\n`;
    }

    // Canvas screenshot section (map/timeline will have separate export system)
    if (options.canvasScreenshot) {
      html += `  <section class="screenshot-section">
    <h2>Vue du graphe</h2>
    <img src="${options.canvasScreenshot}" alt="Capture du graphe" style="width:100%;height:auto;border:1px solid var(--color-border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1)" />
  </section>\n`;
    }

    // Insights
    if (options.includeInsights && insights) {
      html += `  <section>
    <h2>Analyse du graphe</h2>\n`;

      if (insights.clusters.length > 1) {
        html += `    <div class="insight-box">
      <div class="insight-title">Clusters identifies (${insights.clusters.length})</div>
      <table>
        <tr><th>Cluster</th><th>Nb elements</th><th>Elements</th></tr>
        ${insights.clusters.map(c => {
          const clusterElements = c.elementIds.map(id => elements.find(e => e.id === id)?.label || '?').slice(0, 5);
          const more = c.elementIds.length > 5 ? ` (+${c.elementIds.length - 5})` : '';
          return `<tr><td>${c.id}</td><td>${c.elementIds.length}</td><td>${clusterElements.map(l => this.escapeHTML(l)).join(', ')}${more}</td></tr>`;
        }).join('\n        ')}
      </table>
    </div>\n`;
      }

      if (insights.centrality.length > 0) {
        const topCentral = insights.centrality.slice(0, 10);
        html += `    <div class="insight-box">
      <div class="insight-title">Elements centraux (top ${topCentral.length})</div>
      <table>
        <tr><th>Element</th><th>Score centralite</th><th>Connexions</th></tr>
        ${topCentral.map(c => {
          const el = elements.find(e => e.id === c.elementId);
          const connectionCount = links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length;
          return `<tr><td>${this.escapeHTML(el?.label || 'Inconnu')}</td><td>${c.score.toFixed(3)}</td><td>${connectionCount}</td></tr>`;
        }).join('\n        ')}
      </table>
    </div>\n`;
      }

      if (insights.bridges.length > 0) {
        html += `    <div class="insight-box">
      <div class="insight-title">Elements ponts (${insights.bridges.length})</div>
      <p style="font-size:9pt;color:var(--color-secondary)">Elements connectant differents groupes</p>
      <ul class="insight-list">
        ${insights.bridges.slice(0, 10).map(id => {
          const el = elements.find(e => e.id === id);
          return `<li>${this.escapeHTML(el?.label || 'Inconnu')}</li>`;
        }).join('\n        ')}
      </ul>
    </div>\n`;
      }

      if (insights.isolated.length > 0) {
        html += `    <div class="insight-box">
      <div class="insight-title">Elements isoles (${insights.isolated.length})</div>
      <p style="font-size:9pt;color:var(--color-secondary)">Elements sans connexion</p>
      <ul class="insight-list">
        ${insights.isolated.slice(0, 10).map(id => {
          const el = elements.find(e => e.id === id);
          return `<li>${this.escapeHTML(el?.label || 'Inconnu')}</li>`;
        }).join('\n        ')}
        ${insights.isolated.length > 10 ? `<li>... et ${insights.isolated.length - 10} autres</li>` : ''}
      </ul>
    </div>\n`;
      }

      html += `  </section>\n`;
    }

    // Timeline (real events)
    if (options.includeTimeline && allEvents.length > 0) {
      html += `  <section>
    <h2>Chronologie (${allEvents.length} evenements)</h2>
    <table class="timeline-table">
      <tr><th>Date</th><th>Element</th><th>Evenement</th><th>Details</th></tr>
      ${allEvents.map(ev => {
        const dateStr = new Date(ev.date).toLocaleDateString('fr-FR');
        const endStr = ev.dateEnd ? ` - ${new Date(ev.dateEnd).toLocaleDateString('fr-FR')}` : '';
        const location = ev.geo ? `${ev.geo.lat.toFixed(4)}, ${ev.geo.lng.toFixed(4)}` : '';
        return `<tr>
        <td>${dateStr}${endStr}</td>
        <td>${this.escapeHTML(ev.elementLabel)}</td>
        <td>${this.escapeHTML(ev.label)}</td>
        <td>${ev.description ? this.escapeHTML(ev.description) : ''}${location ? ` [${location}]` : ''}</td>
      </tr>`;
      }).join('\n      ')}
    </table>
  </section>\n`;
    }

    // Elements
    if (options.includeElements) {
      html += `  <section>
    <h2>Elements (${elements.length})</h2>\n`;

      if (options.groupElementsByTag) {
        const tagGroups = this.groupByTags(sortedElements);
        for (const [tag, tagElements] of Object.entries(tagGroups)) {
          html += `    <h3>${this.escapeHTML(tag)} (${tagElements.length})</h3>\n`;
          html += this.renderElementsTableHTML(tagElements, assets, options);
        }
      } else {
        html += this.renderElementsTableHTML(sortedElements, assets, options);
      }

      html += `  </section>\n`;
    }

    // Links
    if (options.includeLinks && links.length > 0) {
      html += `  <section>
    <h2>Liens (${links.length})</h2>
    <table>
      <tr><th>De</th><th>Vers</th><th>Type</th><th>Label</th><th>Notes</th></tr>
      ${links.map(link => {
        const fromEl = elements.find(e => e.id === link.fromId);
        const toEl = elements.find(e => e.id === link.toId);
        const arrow = link.directed ? '→' : '↔';
        return `<tr>
        <td>${this.escapeHTML(fromEl?.label || '?')}</td>
        <td>${this.escapeHTML(toEl?.label || '?')}</td>
        <td>${arrow}</td>
        <td>${link.label ? this.escapeHTML(link.label) : '-'}</td>
        <td class="markdown-content">${link.notes ? this.markdownToHTML(link.notes) : '-'}</td>
      </tr>`;
      }).join('\n      ')}
    </table>
  </section>\n`;
    }

    // Files with media previews
    if (options.includeFiles && totalFiles > 0) {
      html += `  <section>
    <h2>Fichiers joints (${totalFiles})</h2>
    <div class="media-grid">\n`;

      for (const el of elements) {
        for (const assetId of el.assetIds) {
          const asset = assets.find(a => a.id === assetId);
          if (!asset) continue;
          const sizeKB = (asset.size / 1024).toFixed(1);
          const isImage = asset.mimeType.startsWith('image/');
          const hasPreview = isImage && asset.thumbnailDataUrl;

          html += `      <div class="media-item">
        ${hasPreview ? `<img src="${asset.thumbnailDataUrl}" alt="${this.escapeHTML(asset.filename)}" />` : `<div style="width:100pt;height:60pt;background:var(--color-bg);display:flex;align-items:center;justify-content:center;font-size:8pt;color:var(--color-secondary)">${asset.mimeType.split('/')[0].toUpperCase()}</div>`}
        <div class="media-name">${this.escapeHTML(asset.filename)}</div>
        <div style="font-size:7pt;color:var(--color-secondary)">${this.escapeHTML(el.label)} - ${sizeKB} Ko</div>
      </div>\n`;
        }
      }

      html += `    </div>
  </section>\n`;
    }

    // Fiches détaillées
    if (options.includeFiches) {
      const elementsWithData = sortedElements.filter(el =>
        el.properties.length > 0 || el.events.length > 0 || el.notes || el.assetIds.length > 0
      );

      if (elementsWithData.length > 0) {
        html += `  <section>
    <h2>Fiches detaillees (${elementsWithData.length})</h2>\n`;

        for (const el of elementsWithData) {
          // Get connections
          const connections = links
            .filter(l => l.fromId === el.id || l.toId === el.id)
            .map(l => {
              const otherId = l.fromId === el.id ? l.toId : l.fromId;
              const otherEl = elements.find(e => e.id === otherId);
              const direction = l.fromId === el.id ? '→' : '←';
              return { label: otherEl?.label || '?', linkLabel: l.label, direction };
            });

          // Get files
          const elAssets = el.assetIds
            .map(id => assets.find(a => a.id === id))
            .filter((a): a is Asset => a !== undefined);

          html += `    <div class="fiche">
      <h3 style="margin:0 0 8pt;color:var(--color-primary)">${this.escapeHTML(el.label)}</h3>
      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">Identite</th></tr>
        <tr><td>Tags</td><td>${el.tags.length > 0 ? el.tags.map(t => `<span class="tag">${this.escapeHTML(t)}</span>`).join(' ') : '-'}</td></tr>
        <tr><td>Confiance</td><td>${el.confidence !== null ? `${el.confidence}%` : '-'}</td></tr>
        <tr><td>Source</td><td>${el.source ? this.escapeHTML(el.source) : '-'}</td></tr>
        ${el.notes ? `<tr><td>Notes</td><td class="markdown-content">${this.markdownToHTML(el.notes)}</td></tr>` : ''}
      </table>\n`;

          // Properties
          if (el.properties.length > 0) {
            html += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">Proprietes (${el.properties.length})</th></tr>
        ${el.properties.map(p => `<tr><td>${this.escapeHTML(p.key)}</td><td>${this.escapeHTML(String(p.value ?? ''))}</td></tr>`).join('\n        ')}
      </table>\n`;
          }

          // Events
          if (el.events.length > 0) {
            html += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">Evenements (${el.events.length})</th></tr>
        ${el.events.map(ev => {
          const dateStr = new Date(ev.date).toLocaleDateString('fr-FR');
          const endStr = ev.dateEnd ? ` - ${new Date(ev.dateEnd).toLocaleDateString('fr-FR')}` : '';
          const geo = ev.geo ? ` [${ev.geo.lat.toFixed(4)}, ${ev.geo.lng.toFixed(4)}]` : '';
          return `<tr><td>${dateStr}${endStr}</td><td><b>${this.escapeHTML(ev.label)}</b>${ev.description ? ` - ${this.escapeHTML(ev.description)}` : ''}${geo}</td></tr>`;
        }).join('\n        ')}
      </table>\n`;
          }

          // Connections
          if (connections.length > 0) {
            html += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">Relations (${connections.length})</th></tr>
        ${connections.map(c => `<tr><td>${c.direction}</td><td><b>${this.escapeHTML(c.label)}</b>${c.linkLabel ? ` (${this.escapeHTML(c.linkLabel)})` : ''}</td></tr>`).join('\n        ')}
      </table>\n`;
          }

          // Files with previews
          if (elAssets.length > 0) {
            html += `      <div style="margin-bottom:8pt">
        <div style="font-size:8pt;text-transform:uppercase;color:var(--color-secondary);padding:4pt 0;background:var(--color-bg-alt)">Fichiers (${elAssets.length})</div>
        <div class="media-grid" style="margin-top:6pt">
          ${elAssets.map(a => {
            const isImage = a.mimeType.startsWith('image/');
            const hasPreview = isImage && a.thumbnailDataUrl;
            return `<div class="media-item" style="max-width:100pt">
            ${hasPreview ? `<img src="${a.thumbnailDataUrl}" alt="${this.escapeHTML(a.filename)}" style="max-width:90pt;max-height:60pt" />` : `<div style="width:60pt;height:40pt;background:var(--color-bg);display:flex;align-items:center;justify-content:center;font-size:7pt;color:var(--color-secondary)">${a.mimeType.split('/')[0].toUpperCase()}</div>`}
            <div style="font-size:7pt;color:var(--color-secondary);word-break:break-all">${this.escapeHTML(a.filename)}</div>
            <div style="font-size:6pt;color:var(--color-secondary)">${(a.size / 1024).toFixed(1)} Ko</div>
          </div>`;
          }).join('\n          ')}
        </div>
      </div>\n`;
          }

          html += `    </div>\n`;
        }

        html += `  </section>\n`;
      }
    }

    html += `</body>
</html>`;

    return html;
  }

  /**
   * Render elements as HTML table
   */
  private renderElementsTableHTML(elements: Element[], assets: Asset[], options: ReportOptions): string {
    const showProps = options.includeProperties;

    let html = `    <table>
      <tr>
        <th>Element</th>
        <th>Notes</th>
        <th>Tags</th>
        <th>Confiance</th>
        <th>Source</th>
        ${showProps ? '<th>Proprietes</th>' : ''}
        ${options.includeFiles ? '<th>Fichiers</th>' : ''}
      </tr>
      ${elements.map(el => {
        const propsHtml = showProps && el.properties.length > 0
          ? el.properties.map(p => `<b>${this.escapeHTML(p.key)}:</b> ${this.escapeHTML(String(p.value ?? ''))}`).join('<br>')
          : '-';
        const filesHtml = options.includeFiles && el.assetIds.length > 0
          ? el.assetIds.map(id => {
              const asset = assets.find(a => a.id === id);
              return asset ? this.escapeHTML(asset.filename) : '?';
            }).join(', ')
          : '-';
        return `<tr>
        <td><span class="color-dot" style="background:${el.visual.color}"></span>${this.escapeHTML(el.label)}</td>
        <td class="markdown-content">${el.notes ? this.markdownToHTML(el.notes) : '-'}</td>
        <td>${el.tags.length > 0 ? el.tags.map(t => `<span class="tag">${this.escapeHTML(t)}</span>`).join('') : '-'}</td>
        <td>${el.confidence !== null ? `${el.confidence}%` : '-'}</td>
        <td>${el.source ? this.escapeHTML(el.source) : '-'}</td>
        ${showProps ? `<td>${propsHtml}</td>` : ''}
        ${options.includeFiles ? `<td class="file-list">${filesHtml}</td>` : ''}
      </tr>`;
      }).join('\n      ')}
    </table>\n`;

    return html;
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdown(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions
  ): string {
    const title = options.title || investigation.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;

    // Collect all events
    const allEvents = elements.flatMap(el =>
      el.events.map(ev => ({
        ...ev,
        elementLabel: el.label,
        elementId: el.id,
      }))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalEvents = allEvents.length;
    const totalFiles = elements.reduce((sum, el) => sum + el.assetIds.length, 0);

    let md = `# ${title}\n\n`;
    md += `*Rapport genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}*\n\n`;

    // Description
    if (options.includeDescription && investigation.description) {
      md += `> ${investigation.description}\n\n`;
    }

    // Summary
    if (options.includeSummary) {
      const geoElements = elements.filter(el => el.geo || el.events.some(ev => ev.geo));
      const tagCounts = this.getTagCounts(elements);

      md += `## Resume\n\n`;
      md += `| Metrique | Valeur |\n`;
      md += `|----------|--------|\n`;
      md += `| Elements | ${elements.length} |\n`;
      md += `| Liens | ${links.length} |\n`;
      md += `| Evenements | ${totalEvents} |\n`;
      md += `| Localisations | ${geoElements.length} |\n`;
      md += `| Tags uniques | ${Object.keys(tagCounts).length} |\n`;
      md += `| Fichiers | ${totalFiles} |\n\n`;
    }

    // Insights
    if (options.includeInsights && insights) {
      md += `## Analyse du graphe\n\n`;

      if (insights.clusters.length > 1) {
        md += `### Clusters (${insights.clusters.length})\n\n`;
        md += `| Cluster | Nb elements | Elements |\n`;
        md += `|---------|-------------|----------|\n`;
        for (const cluster of insights.clusters) {
          const clusterEls = cluster.elementIds.map(id => elements.find(e => e.id === id)?.label || '?').slice(0, 5);
          const more = cluster.elementIds.length > 5 ? ` (+${cluster.elementIds.length - 5})` : '';
          md += `| ${cluster.id} | ${cluster.elementIds.length} | ${clusterEls.join(', ')}${more} |\n`;
        }
        md += `\n`;
      }

      if (insights.centrality.length > 0) {
        md += `### Elements centraux (top 10)\n\n`;
        md += `| Element | Score | Connexions |\n`;
        md += `|---------|-------|------------|\n`;
        const topCentral = insights.centrality.slice(0, 10);
        for (const c of topCentral) {
          const el = elements.find(e => e.id === c.elementId);
          const connectionCount = links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length;
          md += `| ${el?.label || 'Inconnu'} | ${c.score.toFixed(3)} | ${connectionCount} |\n`;
        }
        md += `\n`;
      }

      if (insights.bridges.length > 0) {
        md += `### Elements ponts (${insights.bridges.length})\n\n`;
        md += `*Elements connectant differents groupes*\n\n`;
        for (const id of insights.bridges.slice(0, 10)) {
          const el = elements.find(e => e.id === id);
          md += `- ${el?.label || 'Inconnu'}\n`;
        }
        md += `\n`;
      }

      if (insights.isolated.length > 0) {
        md += `### Elements isoles (${insights.isolated.length})\n\n`;
        md += `*Elements sans connexion*\n\n`;
        for (const id of insights.isolated.slice(0, 10)) {
          const el = elements.find(e => e.id === id);
          md += `- ${el?.label || 'Inconnu'}\n`;
        }
        if (insights.isolated.length > 10) {
          md += `- ... et ${insights.isolated.length - 10} autres\n`;
        }
        md += `\n`;
      }
    }

    // Timeline (real events)
    if (options.includeTimeline && allEvents.length > 0) {
      md += `## Chronologie (${allEvents.length} evenements)\n\n`;
      md += `| Date | Element | Evenement | Details |\n`;
      md += `|------|---------|-----------|----------|\n`;
      for (const ev of allEvents) {
        const dateStr = new Date(ev.date).toLocaleDateString('fr-FR');
        const endStr = ev.dateEnd ? ` - ${new Date(ev.dateEnd).toLocaleDateString('fr-FR')}` : '';
        const location = ev.geo ? `[${ev.geo.lat.toFixed(4)}, ${ev.geo.lng.toFixed(4)}]` : '';
        const details = [ev.description, location].filter(Boolean).join(' ');
        md += `| ${dateStr}${endStr} | ${ev.elementLabel} | ${ev.label} | ${details || '-'} |\n`;
      }
      md += `\n`;
    }

    // Elements
    if (options.includeElements) {
      md += `## Elements (${elements.length})\n\n`;

      if (options.groupElementsByTag) {
        const tagGroups = this.groupByTags(sortedElements);
        for (const [tag, tagElements] of Object.entries(tagGroups)) {
          md += `### ${tag} (${tagElements.length})\n\n`;
          md += this.renderElementsTableMarkdown(tagElements, assets, options);
        }
      } else {
        md += this.renderElementsTableMarkdown(sortedElements, assets, options);
      }
    }

    // Links
    if (options.includeLinks && links.length > 0) {
      md += `## Liens (${links.length})\n\n`;
      md += `| De | Vers | Type | Label | Notes |\n`;
      md += `|----|------|------|-------|-------|\n`;
      for (const link of links) {
        const fromEl = elements.find(e => e.id === link.fromId);
        const toEl = elements.find(e => e.id === link.toId);
        const arrow = link.directed ? '→' : '↔';
        md += `| ${fromEl?.label || '?'} | ${toEl?.label || '?'} | ${arrow} | ${link.label || '-'} | ${link.notes || '-'} |\n`;
      }
      md += `\n`;
    }

    // Files
    if (options.includeFiles && totalFiles > 0) {
      md += `## Fichiers joints (${totalFiles})\n\n`;
      md += `| Element | Fichier | Type | Taille |\n`;
      md += `|---------|---------|------|--------|\n`;
      for (const el of elements) {
        for (const assetId of el.assetIds) {
          const asset = assets.find(a => a.id === assetId);
          if (asset) {
            const sizeKB = (asset.size / 1024).toFixed(1);
            md += `| ${el.label} | ${asset.filename} | ${asset.mimeType} | ${sizeKB} Ko |\n`;
          }
        }
      }
      md += `\n`;
    }

    // Fiches détaillées
    if (options.includeFiches) {
      const elementsWithData = sortedElements.filter(el =>
        el.properties.length > 0 || el.events.length > 0 || el.notes || el.assetIds.length > 0
      );

      if (elementsWithData.length > 0) {
        md += `## Fiches detaillees (${elementsWithData.length})\n\n`;

        for (const el of elementsWithData) {
          // Get connections
          const connections = links
            .filter(l => l.fromId === el.id || l.toId === el.id)
            .map(l => {
              const otherId = l.fromId === el.id ? l.toId : l.fromId;
              const otherEl = elements.find(e => e.id === otherId);
              const direction = l.fromId === el.id ? '→' : '←';
              return { label: otherEl?.label || '?', linkLabel: l.label, direction };
            });

          // Get files
          const elAssets = el.assetIds
            .map(id => assets.find(a => a.id === id))
            .filter((a): a is Asset => a !== undefined);

          md += `### ${el.label}\n\n`;

          // Identity
          md += `**Identite**\n\n`;
          md += `| Champ | Valeur |\n`;
          md += `|-------|--------|\n`;
          md += `| Tags | ${el.tags.length > 0 ? el.tags.join(', ') : '-'} |\n`;
          md += `| Confiance | ${el.confidence !== null ? `${el.confidence}%` : '-'} |\n`;
          md += `| Source | ${el.source || '-'} |\n`;
          if (el.notes) {
            md += `| Notes | ${el.notes.replace(/\n/g, ' ')} |\n`;
          }
          md += `\n`;

          // Properties
          if (el.properties.length > 0) {
            md += `**Proprietes (${el.properties.length})**\n\n`;
            md += `| Propriete | Valeur |\n`;
            md += `|-----------|--------|\n`;
            for (const p of el.properties) {
              md += `| ${p.key} | ${p.value ?? ''} |\n`;
            }
            md += `\n`;
          }

          // Events
          if (el.events.length > 0) {
            md += `**Evenements (${el.events.length})**\n\n`;
            md += `| Date | Evenement | Details |\n`;
            md += `|------|-----------|----------|\n`;
            for (const ev of el.events) {
              const dateStr = new Date(ev.date).toLocaleDateString('fr-FR');
              const endStr = ev.dateEnd ? ` - ${new Date(ev.dateEnd).toLocaleDateString('fr-FR')}` : '';
              const geo = ev.geo ? ` [${ev.geo.lat.toFixed(4)}, ${ev.geo.lng.toFixed(4)}]` : '';
              md += `| ${dateStr}${endStr} | ${ev.label} | ${ev.description || '-'}${geo} |\n`;
            }
            md += `\n`;
          }

          // Connections
          if (connections.length > 0) {
            md += `**Relations (${connections.length})**\n\n`;
            md += `| Direction | Element | Type de lien |\n`;
            md += `|-----------|---------|---------------|\n`;
            for (const c of connections) {
              md += `| ${c.direction} | ${c.label} | ${c.linkLabel || '-'} |\n`;
            }
            md += `\n`;
          }

          // Files
          if (elAssets.length > 0) {
            md += `**Fichiers (${elAssets.length})**\n\n`;
            md += `| Type | Fichier | Taille |\n`;
            md += `|------|---------|--------|\n`;
            for (const a of elAssets) {
              md += `| ${a.mimeType.split('/')[0]} | ${a.filename} | ${(a.size / 1024).toFixed(1)} Ko |\n`;
            }
            md += `\n`;
          }

          md += `---\n\n`;
        }
      }
    }

    return md;
  }

  /**
   * Render elements as Markdown table
   */
  private renderElementsTableMarkdown(elements: Element[], assets: Asset[], options: ReportOptions): string {
    const showProps = options.includeProperties;
    const showFiles = options.includeFiles;

    let md = `| Element | Notes | Tags | Confiance | Source |`;
    if (showProps) md += ` Proprietes |`;
    if (showFiles) md += ` Fichiers |`;
    md += `\n`;

    md += `|---------|-------|------|-----------|--------|`;
    if (showProps) md += `------------|`;
    if (showFiles) md += `----------|`;
    md += `\n`;

    for (const el of elements) {
      const tags = el.tags.length > 0 ? el.tags.join(', ') : '-';
      const confidence = el.confidence !== null ? `${el.confidence}%` : '-';
      const props = showProps && el.properties.length > 0
        ? el.properties.map(p => `**${p.key}:** ${p.value ?? ''}`).join(', ')
        : '-';
      const files = showFiles && el.assetIds.length > 0
        ? el.assetIds.map(id => {
            const asset = assets.find(a => a.id === id);
            return asset ? asset.filename : '?';
          }).join(', ')
        : '-';

      md += `| ${el.label} | ${el.notes || '-'} | ${tags} | ${confidence} | ${el.source || '-'} |`;
      if (showProps) md += ` ${props} |`;
      if (showFiles) md += ` ${files} |`;
      md += `\n`;
    }

    md += `\n`;
    return md;
  }

  /**
   * Generate extended JSON for AI consumption
   * Structured data optimized for AI report generation
   */
  private generateExtendedJSON(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    _assets: Asset[]
  ): string {
    const insights = insightsService.computeInsights();

    // Collect all events from elements
    const allEvents = elements.flatMap(el =>
      el.events.map(ev => ({
        date: ev.date,
        dateEnd: ev.dateEnd || null,
        label: ev.label,
        description: ev.description || null,
        elementId: el.id,
        elementLabel: el.label,
        geo: ev.geo || null,
      }))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Build element lookup for link labeling
    const elementMap = new Map(elements.map(el => [el.id, el]));

    const data = {
      _meta: {
        format: 'zeroneurone-extended-json',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        purpose: 'Structured investigation data with graph analysis',
      },
      investigation: {
        id: investigation.id,
        name: investigation.name,
        description: investigation.description || null,
        createdAt: investigation.createdAt,
        updatedAt: investigation.updatedAt,
      },
      summary: {
        totalElements: elements.length,
        totalLinks: links.length,
        totalEvents: allEvents.length,
        elementsWithGeo: elements.filter(el => el.geo || el.events.some(ev => ev.geo)).length,
        elementsWithFiles: elements.filter(el => el.assetIds.length > 0).length,
        allTags: [...new Set(elements.flatMap(el => el.tags))],
      },
      elements: elements.map(el => ({
        id: el.id,
        label: el.label,
        notes: el.notes || null,
        tags: el.tags,
        confidence: el.confidence,
        source: el.source || null,
        geo: el.geo || null,
        properties: el.properties.reduce((acc, p) => {
          acc[p.key] = p.value;
          return acc;
        }, {} as Record<string, unknown>),
        events: el.events.map(ev => ({
          date: ev.date,
          dateEnd: ev.dateEnd || null,
          label: ev.label,
          description: ev.description || null,
          geo: ev.geo || null,
        })),
        connectionCount: links.filter(l => l.fromId === el.id || l.toId === el.id).length,
        fileCount: el.assetIds.length,
      })),
      links: links.map(link => {
        const fromEl = elementMap.get(link.fromId);
        const toEl = elementMap.get(link.toId);
        return {
          id: link.id,
          fromId: link.fromId,
          fromLabel: fromEl?.label || 'Inconnu',
          toId: link.toId,
          toLabel: toEl?.label || 'Inconnu',
          label: link.label || null,
          notes: link.notes || null,
          directed: link.directed,
          confidence: link.confidence,
          source: link.source || null,
          properties: link.properties.reduce((acc, p) => {
            acc[p.key] = p.value;
            return acc;
          }, {} as Record<string, unknown>),
          dateRange: link.dateRange || null,
        };
      }),
      timeline: allEvents,
      insights: insights ? {
        clusters: insights.clusters.map(c => ({
          id: c.id,
          size: c.elementIds.length,
          elementLabels: c.elementIds.map(id => elementMap.get(id)?.label || 'Inconnu'),
        })),
        centralElements: insights.centrality.slice(0, 15).map(c => ({
          label: elementMap.get(c.elementId)?.label || 'Inconnu',
          centralityScore: c.score,
          connectionCount: links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length,
        })),
        bridgeElements: insights.bridges.slice(0, 10).map(id => elementMap.get(id)?.label || 'Inconnu'),
        isolatedElements: insights.isolated.map(id => elementMap.get(id)?.label || 'Inconnu'),
      } : null,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Open report in new window for printing
   */
  openForPrint(html: string): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      // Delay print to allow styles to load
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  }

  /**
   * Download report as file
   */
  download(content: string, filename: string, format: ReportFormat): void {
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'html':
        mimeType = 'text/html';
        extension = '.html';
        break;
      case 'markdown':
        mimeType = 'text/markdown';
        extension = '.md';
        break;
      case 'extended-json':
        mimeType = 'application/json';
        extension = '.json';
        break;
      default:
        mimeType = 'text/plain';
        extension = '.txt';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename + extension;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private sortElements(elements: Element[], sortBy: ReportOptions['sortElementsBy']): Element[] {
    return [...elements].sort((a, b) => {
      switch (sortBy) {
        case 'label':
          return a.label.localeCompare(b.label);
        case 'date': {
          const dateA = a.date || a.dateRange?.start;
          const dateB = b.date || b.dateRange?.start;
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        }
        case 'confidence':
          return (b.confidence ?? -1) - (a.confidence ?? -1);
        default:
          return 0;
      }
    });
  }

  private groupByTags(elements: Element[]): Record<string, Element[]> {
    const groups: Record<string, Element[]> = { 'Sans tag': [] };

    for (const el of elements) {
      if (el.tags.length === 0) {
        groups['Sans tag'].push(el);
      } else {
        for (const tag of el.tags) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(el);
        }
      }
    }

    // Remove empty "Sans tag" group
    if (groups['Sans tag'].length === 0) {
      delete groups['Sans tag'];
    }

    return groups;
  }

  private getTagCounts(elements: Element[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const el of elements) {
      for (const tag of el.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Convert markdown text to HTML using marked with DOMPurify sanitization
   * This prevents XSS attacks from user-provided markdown content
   */
  private markdownToHTML(text: string): string {
    if (!text) return '';
    try {
      // marked.parse returns string | Promise<string>, but with our sync config it's always string
      const result = marked.parse(text);
      const html = typeof result === 'string' ? result : '';
      // Sanitize HTML to prevent XSS attacks
      return DOMPurify.sanitize(html, SANITIZE_CONFIG);
    } catch {
      // Fallback to escaped HTML if markdown parsing fails
      return this.escapeHTML(text).replace(/\n/g, '<br>');
    }
  }
}

export const reportService = new ReportService();
