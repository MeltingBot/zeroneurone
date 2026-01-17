import type { Investigation, Element, Link } from '../types';
import { insightsService } from './insightsService';

export type ReportFormat = 'html' | 'markdown';

export interface ReportOptions {
  title: string;
  includeDescription: boolean;
  includeSummary: boolean;
  includeElements: boolean;
  includeLinks: boolean;
  includeInsights: boolean;
  includeTimeline: boolean;
  groupElementsByTag: boolean;
  sortElementsBy: 'label' | 'date' | 'confidence';
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  title: '',
  includeDescription: true,
  includeSummary: true,
  includeElements: true,
  includeLinks: true,
  includeInsights: true,
  includeTimeline: true,
  groupElementsByTag: false,
  sortElementsBy: 'label',
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
    options: ReportOptions
  ): string {
    // Build insights if needed
    if (options.includeInsights && elements.length > 0) {
      insightsService.buildGraph(elements, links);
    }

    switch (format) {
      case 'html':
        return this.generateHTML(investigation, elements, links, options);
      case 'markdown':
        return this.generateMarkdown(investigation, elements, links, options);
      default:
        return this.generateMarkdown(investigation, elements, links, options);
    }
  }

  /**
   * Generate HTML report
   */
  private generateHTML(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    options: ReportOptions
  ): string {
    const title = options.title || investigation.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;

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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #111827;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; color: var(--color-primary); }
    h2 { font-size: 1.25rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--color-primary); }
    h3 { font-size: 1rem; margin: 1.5rem 0 0.75rem; color: var(--color-secondary); }
    p { margin-bottom: 1rem; }
    .meta { color: var(--color-secondary); font-size: 0.875rem; margin-bottom: 2rem; }
    .summary { background: var(--color-bg); padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
    .summary-item { text-align: center; }
    .summary-value { font-size: 1.5rem; font-weight: 600; color: var(--color-primary); }
    .summary-label { font-size: 0.75rem; color: var(--color-secondary); }
    .element-card {
      background: white;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .element-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .element-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .element-label { font-weight: 600; }
    .element-notes { color: var(--color-secondary); font-size: 0.875rem; }
    .element-meta { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-secondary); }
    .tag {
      display: inline-block;
      background: var(--color-bg);
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-right: 0.25rem;
    }
    .link-item {
      padding: 0.75rem;
      border-left: 3px solid var(--color-border);
      margin-bottom: 0.5rem;
      background: var(--color-bg);
    }
    .link-nodes { font-weight: 500; }
    .link-label { color: var(--color-secondary); font-size: 0.875rem; }
    .insight-section { background: #eff6ff; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .insight-title { font-weight: 600; margin-bottom: 0.5rem; }
    .timeline-item { padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); }
    .timeline-date { font-weight: 500; color: var(--color-primary); }
    ul { margin-left: 1.5rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.25rem; }
    @media print {
      body { padding: 1rem; }
      .element-card, .link-item, .insight-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${this.escapeHTML(title)}</h1>
    <p class="meta">
      Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}
    </p>
  </header>
`;

    // Description
    if (options.includeDescription && investigation.description) {
      html += `  <section>
    <p>${this.escapeHTML(investigation.description)}</p>
  </section>\n`;
    }

    // Summary
    if (options.includeSummary) {
      const datedElements = elements.filter(el => el.date || el.dateRange?.start);
      const geoElements = elements.filter(el => el.geo);
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
        <div class="summary-value">${datedElements.length}</div>
        <div class="summary-label">Dates</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${geoElements.length}</div>
        <div class="summary-label">Localisations</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${Object.keys(tagCounts).length}</div>
        <div class="summary-label">Tags</div>
      </div>
    </div>
  </section>\n`;
    }

    // Insights
    if (options.includeInsights && insights) {
      html += `  <section>
    <h2>Analyse du graphe</h2>\n`;

      if (insights.clusters.length > 1) {
        html += `    <div class="insight-section">
      <div class="insight-title">Clusters identifies: ${insights.clusters.length}</div>
      <ul>
        ${insights.clusters.map(c => `<li>Cluster ${c.id}: ${c.elementIds.length} elements</li>`).join('\n        ')}
      </ul>
    </div>\n`;
      }

      if (insights.centrality.length > 0) {
        const topCentral = insights.centrality.slice(0, 5);
        html += `    <div class="insight-section">
      <div class="insight-title">Elements centraux</div>
      <ul>
        ${topCentral.map(c => {
          const el = elements.find(e => e.id === c.elementId);
          return `<li>${this.escapeHTML(el?.label || 'Inconnu')} (score: ${c.score.toFixed(2)})</li>`;
        }).join('\n        ')}
      </ul>
    </div>\n`;
      }

      if (insights.bridges.length > 0) {
        html += `    <div class="insight-section">
      <div class="insight-title">Elements ponts: ${insights.bridges.length}</div>
      <ul>
        ${insights.bridges.slice(0, 5).map(id => {
          const el = elements.find(e => e.id === id);
          return `<li>${this.escapeHTML(el?.label || 'Inconnu')}</li>`;
        }).join('\n        ')}
      </ul>
    </div>\n`;
      }

      if (insights.isolated.length > 0) {
        html += `    <div class="insight-section">
      <div class="insight-title">Elements isoles: ${insights.isolated.length}</div>
    </div>\n`;
      }

      html += `  </section>\n`;
    }

    // Timeline
    if (options.includeTimeline) {
      const datedElements = sortedElements
        .filter(el => el.date || el.dateRange?.start)
        .sort((a, b) => {
          const dateA = a.date || a.dateRange?.start;
          const dateB = b.date || b.dateRange?.start;
          if (!dateA || !dateB) return 0;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

      if (datedElements.length > 0) {
        html += `  <section>
    <h2>Chronologie</h2>\n`;

        for (const el of datedElements) {
          const date = el.date || el.dateRange?.start;
          html += `    <div class="timeline-item">
      <span class="timeline-date">${date ? new Date(date).toLocaleDateString('fr-FR') : ''}</span>
      - ${this.escapeHTML(el.label)}
    </div>\n`;
        }

        html += `  </section>\n`;
      }
    }

    // Elements
    if (options.includeElements) {
      html += `  <section>
    <h2>Elements (${elements.length})</h2>\n`;

      if (options.groupElementsByTag) {
        const tagGroups = this.groupByTags(sortedElements);
        for (const [tag, tagElements] of Object.entries(tagGroups)) {
          html += `    <h3>${this.escapeHTML(tag)} (${tagElements.length})</h3>\n`;
          for (const el of tagElements) {
            html += this.renderElementHTML(el);
          }
        }
      } else {
        for (const el of sortedElements) {
          html += this.renderElementHTML(el);
        }
      }

      html += `  </section>\n`;
    }

    // Links
    if (options.includeLinks && links.length > 0) {
      html += `  <section>
    <h2>Liens (${links.length})</h2>\n`;

      for (const link of links) {
        const fromEl = elements.find(e => e.id === link.fromId);
        const toEl = elements.find(e => e.id === link.toId);
        html += `    <div class="link-item">
      <div class="link-nodes">
        ${this.escapeHTML(fromEl?.label || '?')} ${link.directed ? '→' : '↔'} ${this.escapeHTML(toEl?.label || '?')}
      </div>
      ${link.label ? `<div class="link-label">${this.escapeHTML(link.label)}</div>` : ''}
    </div>\n`;
      }

      html += `  </section>\n`;
    }

    html += `</body>
</html>`;

    return html;
  }

  private renderElementHTML(el: Element): string {
    return `    <div class="element-card">
      <div class="element-header">
        <span class="element-color" style="background-color: ${el.visual.color}"></span>
        <span class="element-label">${this.escapeHTML(el.label)}</span>
      </div>
      ${el.notes ? `<p class="element-notes">${this.escapeHTML(el.notes)}</p>` : ''}
      ${el.tags.length > 0 ? `<div>${el.tags.map(t => `<span class="tag">${this.escapeHTML(t)}</span>`).join('')}</div>` : ''}
      <div class="element-meta">
        ${el.confidence !== null ? `<span>Confiance: ${el.confidence}%</span>` : ''}
        ${el.date ? `<span>Date: ${new Date(el.date).toLocaleDateString('fr-FR')}</span>` : ''}
        ${el.source ? `<span>Source: ${this.escapeHTML(el.source)}</span>` : ''}
      </div>
    </div>\n`;
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdown(
    investigation: Investigation,
    elements: Element[],
    links: Link[],
    options: ReportOptions
  ): string {
    const title = options.title || investigation.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;

    let md = `# ${title}\n\n`;
    md += `*Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}*\n\n`;

    // Description
    if (options.includeDescription && investigation.description) {
      md += `${investigation.description}\n\n`;
    }

    // Summary
    if (options.includeSummary) {
      const datedElements = elements.filter(el => el.date || el.dateRange?.start);
      const geoElements = elements.filter(el => el.geo);
      const tagCounts = this.getTagCounts(elements);

      md += `## Resume\n\n`;
      md += `| Metrique | Valeur |\n`;
      md += `|----------|--------|\n`;
      md += `| Elements | ${elements.length} |\n`;
      md += `| Liens | ${links.length} |\n`;
      md += `| Elements dates | ${datedElements.length} |\n`;
      md += `| Elements localises | ${geoElements.length} |\n`;
      md += `| Tags uniques | ${Object.keys(tagCounts).length} |\n\n`;
    }

    // Insights
    if (options.includeInsights && insights) {
      md += `## Analyse du graphe\n\n`;

      if (insights.clusters.length > 1) {
        md += `### Clusters (${insights.clusters.length})\n\n`;
        for (const cluster of insights.clusters) {
          md += `- **Cluster ${cluster.id}**: ${cluster.elementIds.length} elements\n`;
        }
        md += `\n`;
      }

      if (insights.centrality.length > 0) {
        md += `### Elements centraux\n\n`;
        const topCentral = insights.centrality.slice(0, 5);
        for (const c of topCentral) {
          const el = elements.find(e => e.id === c.elementId);
          md += `- ${el?.label || 'Inconnu'} (score: ${c.score.toFixed(2)})\n`;
        }
        md += `\n`;
      }

      if (insights.bridges.length > 0) {
        md += `### Elements ponts (${insights.bridges.length})\n\n`;
        for (const id of insights.bridges.slice(0, 5)) {
          const el = elements.find(e => e.id === id);
          md += `- ${el?.label || 'Inconnu'}\n`;
        }
        md += `\n`;
      }

      if (insights.isolated.length > 0) {
        md += `### Elements isoles: ${insights.isolated.length}\n\n`;
      }
    }

    // Timeline
    if (options.includeTimeline) {
      const datedElements = sortedElements
        .filter(el => el.date || el.dateRange?.start)
        .sort((a, b) => {
          const dateA = a.date || a.dateRange?.start;
          const dateB = b.date || b.dateRange?.start;
          if (!dateA || !dateB) return 0;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

      if (datedElements.length > 0) {
        md += `## Chronologie\n\n`;
        for (const el of datedElements) {
          const date = el.date || el.dateRange?.start;
          md += `- **${date ? new Date(date).toLocaleDateString('fr-FR') : ''}** - ${el.label}\n`;
        }
        md += `\n`;
      }
    }

    // Elements
    if (options.includeElements) {
      md += `## Elements (${elements.length})\n\n`;

      if (options.groupElementsByTag) {
        const tagGroups = this.groupByTags(sortedElements);
        for (const [tag, tagElements] of Object.entries(tagGroups)) {
          md += `### ${tag} (${tagElements.length})\n\n`;
          for (const el of tagElements) {
            md += this.renderElementMarkdown(el);
          }
        }
      } else {
        for (const el of sortedElements) {
          md += this.renderElementMarkdown(el);
        }
      }
    }

    // Links
    if (options.includeLinks && links.length > 0) {
      md += `## Liens (${links.length})\n\n`;

      for (const link of links) {
        const fromEl = elements.find(e => e.id === link.fromId);
        const toEl = elements.find(e => e.id === link.toId);
        const arrow = link.directed ? '→' : '↔';
        md += `- **${fromEl?.label || '?'}** ${arrow} **${toEl?.label || '?'}**`;
        if (link.label) md += ` *(${link.label})*`;
        md += `\n`;
      }
      md += `\n`;
    }

    return md;
  }

  private renderElementMarkdown(el: Element): string {
    let md = `#### ${el.label}\n\n`;

    if (el.notes) {
      md += `${el.notes}\n\n`;
    }

    const meta: string[] = [];
    if (el.tags.length > 0) meta.push(`Tags: ${el.tags.join(', ')}`);
    if (el.confidence !== null) meta.push(`Confiance: ${el.confidence}%`);
    if (el.date) meta.push(`Date: ${new Date(el.date).toLocaleDateString('fr-FR')}`);
    if (el.source) meta.push(`Source: ${el.source}`);

    if (meta.length > 0) {
      md += `*${meta.join(' | ')}*\n\n`;
    }

    return md;
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
    const mimeType = format === 'html' ? 'text/html' : 'text/markdown';
    const extension = format === 'html' ? '.html' : '.md';

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
}

export const reportService = new ReportService();
