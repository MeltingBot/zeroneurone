import type { Dossier, Element, Link, Asset, EvaluationModel } from '../types';
import { evaluationSortKey, formatEvaluation, getEvaluationModel, isInModel } from '../utils/evaluation';
import { getGeoCenter, isGeoPolygon } from '../utils/geo';
import { safeColor, safeDataImageUrl, escapeHtml } from '../utils/escapeHtml';
import { insightsService } from './insightsService';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import i18next from 'i18next';
import { formatEventWhen } from '../utils/temporalUtils';
import { dateLocale, formatPropertyValue } from '../utils/dates';
import { isWebScheme, joinSourceLines, parseSourceLinks, sourceToMarkdown } from '../utils/sourceLinks';
import { getSourceSchemeNames } from '../plugins/sourceSchemes';
import { downloadBlob } from '../utils/download';

// Configure marked for secure rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Configure DOMPurify - allow safe tags only, no scripts
const SANITIZE_CONFIG = {
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

/** The parts of a synthesis, which the user can reorder */
export const REPORT_SECTIONS = [
  'description', 'summary', 'graph', 'map', 'timelineView', 'insights',
  'timeline', 'elements', 'links', 'files', 'fiches',
] as const;
export type ReportSection = typeof REPORT_SECTIONS[number];

/** A stored order made valid: unknown or repeated parts dropped, missing ones added at the end */
export function normalizeSectionOrder(order: unknown): ReportSection[] {
  const known = new Set<string>(REPORT_SECTIONS);
  const out: ReportSection[] = [];
  if (Array.isArray(order)) {
    for (const s of order) {
      if (typeof s === 'string' && known.has(s) && !out.includes(s as ReportSection)) out.push(s as ReportSection);
    }
  }
  for (const s of REPORT_SECTIONS) if (!out.includes(s)) out.push(s);
  return out;
}

/** Where the synthesis says it comes from */
export const ZERONEURONE_URL = 'https://zeroneurone.com';

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
  /** Order of the parts (a part left out of the options is skipped) */
  sectionOrder: ReportSection[];
  /** Each part on a new page (DOCX and printing) */
  pageBreaks: boolean;
  /** Element names lead to their detailed sheet (HTML and DOCX) */
  ficheLinks: boolean;
  /** Each detailed sheet on a new page (DOCX and printing) */
  fichePerPage: boolean;
  /**
   * Elements the scope itself holds, when elements linked to them were added:
   * they come first in the lists and sheets, the linked ones after.
   */
  primaryElementIds?: readonly string[];
  // Captures provided by the modal: the graph as a PNG data URL, map and timeline as SVG markup
  canvasScreenshot?: string | null;
  mapSvg?: string | null;
  timelineSvg?: string | null;
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
  sectionOrder: [...REPORT_SECTIONS],
  pageBreaks: true,
  ficheLinks: true,
  fichePerPage: false,
};

/** Whether an element has a detailed sheet: one with nothing to show gets none */
export function hasFiche(el: Element): boolean {
  return el.properties.length > 0 || el.events.length > 0 || Boolean(el.notes) || el.assetIds.length > 0;
}

/** Anchor of an element's detailed sheet, usable as an HTML id and a Word bookmark name */
export function ficheAnchor(id: string): string {
  return `fiche_${id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 40);
}

class ReportService {
  /** Evaluation model of the dossier being reported (set by generate) */
  private evaluationModel: EvaluationModel = 'zeroneurone';

  /** Elements whose name leads to their sheet in the report being written (set by generate) */
  private ficheIds: ReadonlySet<string> = new Set();

  /** Column/field title for the confidence or the grading */
  private evaluationTitle(): string {
    return this.evaluationModel === 'zeroneurone'
      ? this.t('confidence')
      : (i18next.t('common:evaluation.label') as string);
  }

  /** Confidence ("70%") or grading ("B2") of an item, '-' when missing */
  private evaluationText(item: Element | Link): string {
    if (this.evaluationModel === 'zeroneurone') {
      return item.confidence !== null ? `${item.confidence}%` : '-';
    }
    return isInModel(item.evaluation, this.evaluationModel) ? formatEvaluation(item.evaluation) : '-';
  }

  /**
   * Translation of a synthesis content key
   */
  private t(key: string, options?: Record<string, unknown>): string {
    return i18next.t(`modals:synthesis.content.${key}`, options) as string;
  }

  /**
   * Generate report in specified format
   */
  generate(
    format: ReportFormat,
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions,
    language?: string
  ): string {
    // Set language for this generation if provided
    const currentLang = i18next.language;
    if (language && language !== currentLang) {
      i18next.changeLanguage(language);
    }

    this.evaluationModel = getEvaluationModel(dossier);
    this.ficheIds = this.linkedFicheIds(elements, options);

    if (options.includeInsights && elements.length > 0) {
      insightsService.buildGraph(elements, links);
    }

    let result: string;
    switch (format) {
      case 'html':
        result = this.generateHTML(dossier, elements, links, assets, options, language);
        break;
      case 'markdown':
        result = this.generateMarkdown(dossier, elements, links, assets, options, language);
        break;
      case 'extended-json':
        result = this.generateExtendedJSON(dossier, elements, links, assets, language);
        break;
      default:
        result = this.generateMarkdown(dossier, elements, links, assets, options, language);
    }

    // Restore language if changed
    if (language && language !== currentLang) {
      i18next.changeLanguage(currentLang);
    }

    return result;
  }

  /**
   * Generate the report as a Word document. The `docx` library is loaded only
   * here, on demand. The texts follow the current language of the app.
   */
  async generateDocx(
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions,
    language?: string
  ): Promise<Blob> {
    this.evaluationModel = getEvaluationModel(dossier);
    if (options.includeInsights && elements.length > 0) {
      insightsService.buildGraph(elements, links);
    }
    const sorted = this.sortElements(elements, options.sortElementsBy);
    const { renderReportDocx } = await import('./reportDocx');
    return renderReportDocx({
      dossier,
      title: options.title || dossier.name,
      locale: language || i18next.language || 'fr',
      elements,
      links,
      assets,
      options,
      sorted,
      insights: options.includeInsights && elements.length > 0 ? insightsService.computeInsights() : null,
      t: (key, opts) => this.t(key, opts),
      evaluationTitle: () => this.evaluationTitle(),
      evaluationText: (item) => this.evaluationText(item),
      groupByTags: (list) => this.groupByTags(list),
      splitPrimary: (list) => this.splitPrimary(list, options),
      tagCount: Object.keys(this.getTagCounts(elements)).length,
    });
  }

  /**
   * Generate HTML report
   */
  private generateHTML(
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions,
    language?: string
  ): string {
    const title = options.title || dossier.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;
    const locale = language || i18next.language || 'fr';

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
    const totalFiles = elements.reduce((sum, el) => sum + el.assetIds.length, 0)
      + links.reduce((sum, lk) => sum + (lk.assetIds?.length ?? 0), 0);

    let html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- This document is opened through a same-origin blob: URL by openForPrint(),
       so it inherits the app origin. It carries no script of its own, hence the
       absence of script-src under default-src 'none'. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">
  <title>${escapeHtml(title)}</title>
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
    h4 { font-size: 10pt; margin: 10pt 0 4pt; color: var(--color-secondary); }
    h3.linked-heading { margin-top: 16pt; padding-top: 6pt; border-top: 0.5pt solid var(--color-border); color: #111827; }
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
    .generated-by { margin-top: 24pt; padding-top: 6pt; border-top: 0.5pt solid var(--color-border); font-size: 8pt; color: var(--color-secondary); text-align: center; }
    .generated-by a { color: var(--color-secondary); }
    a.fiche-link { color: inherit; text-decoration: underline; text-decoration-color: var(--color-border); text-underline-offset: 2pt; }
    a.fiche-link:hover { text-decoration-color: currentColor; }
    /* Every printed page names its origin, where the browser draws page margins */
    @page { margin: 15mm 12mm 18mm; @bottom-center { content: "${this.cssString(`${this.t('generatedBy')} - ${ZERONEURONE_URL.replace('https://', '')}`)}"; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 8pt; color: #6b7280; } }
    @media print {
      body { max-width: 210mm; padding: 0; }
      table { break-inside: avoid; }
      .insight-box { break-inside: avoid; }
      .fiche { break-inside: avoid; }
      h2 { break-after: avoid; }
      .screenshot-section { break-inside: avoid; }
      .screenshot-section img { max-width: 100%; }
      .page-break, .new-page { break-before: page; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${this.t('generatedOn', { date: new Date().toLocaleDateString(dateLocale(locale)), time: new Date().toLocaleTimeString(dateLocale(locale)) })}</p>
  </header>
`;

    // Each part, written in the order the user chose
    const parts: Record<ReportSection, () => string> = {
      description: () => {
        let out = '';
        if (options.includeDescription && dossier.description) {
          out += `  <div class="description markdown-content">${this.markdownToHTML(dossier.description)}</div>\n`;
        }
        return out;
      },
      summary: () => {
        let out = '';
        if (options.includeSummary) {
          const geoElements = elements.filter(el => el.geo || el.events.some(ev => ev.geo));
          const tagCounts = this.getTagCounts(elements);

          out += `  <section class="summary">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-value">${elements.length}</div>
        <div class="summary-label">${this.t('elements')}</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${links.length}</div>
        <div class="summary-label">${this.t('links')}</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${totalEvents}</div>
        <div class="summary-label">${this.t('events')}</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${geoElements.length}</div>
        <div class="summary-label">${this.t('locations')}</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${Object.keys(tagCounts).length}</div>
        <div class="summary-label">${this.t('tags')}</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${totalFiles}</div>
        <div class="summary-label">${this.t('files')}</div>
      </div>
    </div>
  </section>\n`;
        }
        return out;
      },
      graph: () => {
        let out = '';
        if (options.canvasScreenshot) {
          out += `  <section class="screenshot-section">
    <h2>${this.t('graphView')}</h2>
    <img src="${options.canvasScreenshot}" alt="${this.t('graphView')}" style="width:100%;height:auto;border:1px solid var(--color-border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1)" />
  </section>\n`;
        }
        return out;
      },
      map: () => this.svgSectionHTML(this.t('mapView'), options.mapSvg),
      timelineView: () => this.svgSectionHTML(this.t('timelineView'), options.timelineSvg),
      insights: () => {
        let out = '';
        if (options.includeInsights && insights) {
          out += `  <section>
    <h2>${this.t('graphAnalysis')}</h2>\n`;

          if (insights.clusters.length > 1) {
            out += `    <div class="insight-box">
      <div class="insight-title">${this.t('clustersIdentified')} (${insights.clusters.length})</div>
      <table>
        <tr><th>${this.t('cluster')}</th><th>${this.t('nbElements')}</th><th>${this.t('elements')}</th></tr>
        ${insights.clusters.map(c => {
              const clusterElements = c.elementIds.map(id => elements.find(e => e.id === id)?.label || '?').slice(0, 5);
              const more = c.elementIds.length > 5 ? ` (+${c.elementIds.length - 5})` : '';
              return `<tr><td>${c.id}</td><td>${c.elementIds.length}</td><td>${clusterElements.map(l => escapeHtml(l)).join(', ')}${more}</td></tr>`;
            }).join('\n        ')}
      </table>
    </div>\n`;
          }

          if (insights.centrality.length > 0) {
            const topCentral = insights.centrality.slice(0, 10);
            out += `    <div class="insight-box">
      <div class="insight-title">${this.t('centralElements')} (top ${topCentral.length})</div>
      <table>
        <tr><th>${this.t('element')}</th><th>${this.t('centralityScore')}</th><th>${this.t('connections')}</th></tr>
        ${topCentral.map(c => {
              const el = elements.find(e => e.id === c.elementId);
              const connectionCount = links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length;
              return `<tr><td>${escapeHtml(el?.label || this.t('unknown'))}</td><td>${c.score.toFixed(3)}</td><td>${connectionCount}</td></tr>`;
            }).join('\n        ')}
      </table>
    </div>\n`;
          }

          if (insights.bridges.length > 0) {
            out += `    <div class="insight-box">
      <div class="insight-title">${this.t('bridgeElements')} (${insights.bridges.length})</div>
      <p style="font-size:9pt;color:var(--color-secondary)">${this.t('bridgeDescription')}</p>
      <ul class="insight-list">
        ${insights.bridges.slice(0, 10).map(id => {
              const el = elements.find(e => e.id === id);
              return `<li>${escapeHtml(el?.label || this.t('unknown'))}</li>`;
            }).join('\n        ')}
      </ul>
    </div>\n`;
          }

          if (insights.isolated.length > 0) {
            out += `    <div class="insight-box">
      <div class="insight-title">${this.t('isolatedElements')} (${insights.isolated.length})</div>
      <p style="font-size:9pt;color:var(--color-secondary)">${this.t('isolatedDescription')}</p>
      <ul class="insight-list">
        ${insights.isolated.slice(0, 10).map(id => {
              const el = elements.find(e => e.id === id);
              return `<li>${escapeHtml(el?.label || this.t('unknown'))}</li>`;
            }).join('\n        ')}
        ${insights.isolated.length > 10 ? `<li>${this.t('andMore', { count: insights.isolated.length - 10 })}</li>` : ''}
      </ul>
    </div>\n`;
          }

          out += `  </section>\n`;
        }
        return out;
      },
      timeline: () => {
        let out = '';
        if (options.includeTimeline && allEvents.length > 0) {
          out += `  <section>
    <h2>${this.t('timeline')} (${allEvents.length} ${this.t('events').toLowerCase()})</h2>
    <table class="timeline-table">
      <tr><th>${this.t('date')}</th><th>${this.t('element')}</th><th>${this.t('event')}</th><th>${this.t('details')}</th></tr>
      ${allEvents.map(ev => {
            const dateStr = formatEventWhen(ev, locale);
            const location = ev.geo ? `${getGeoCenter(ev.geo).lat.toFixed(4)}, ${getGeoCenter(ev.geo).lng.toFixed(4)}${isGeoPolygon(ev.geo) ? ' (zone)' : ''}` : '';
            return `<tr>
        <td>${escapeHtml(dateStr)}</td>
        <td>${this.elementRefHTML(ev.elementId, ev.elementLabel)}</td>
        <td>${escapeHtml(ev.label)}</td>
        <td>${ev.description ? escapeHtml(ev.description) : ''}${location ? ` [${location}]` : ''}</td>
      </tr>`;
          }).join('\n      ')}
    </table>
  </section>\n`;
        }
        return out;
      },
      elements: () => {
        let out = '';
        if (options.includeElements) {
          out += `  <section>
    <h2>${this.t('elements')} (${elements.length})</h2>\n`;

          const writeList = (list: Element[], tagLevel: 'h3' | 'h4') => {
            if (options.groupElementsByTag) {
              const tagGroups = this.groupByTags(list, locale);
              for (const [tag, tagElements] of Object.entries(tagGroups)) {
                out += `    <${tagLevel}>${escapeHtml(tag)} (${tagElements.length})</${tagLevel}>\n`;
                out += this.renderElementsTableHTML(tagElements, assets, options);
              }
            } else {
              out += this.renderElementsTableHTML(list, assets, options);
            }
          };
          // The elements of the scope first, then those linked to them
          const { primary, linked } = this.splitPrimary(sortedElements, options);
          writeList(primary, 'h3');
          if (linked.length > 0) {
            out += `    <h3 class="linked-heading">${this.t('linkedElements')} (${linked.length})</h3>\n`;
            writeList(linked, 'h4');
          }

          out += `  </section>\n`;
        }
        return out;
      },
      links: () => {
        let out = '';
        if (options.includeLinks && links.length > 0) {
          out += `  <section>
    <h2>${this.t('links')} (${links.length})</h2>
    <table>
      <tr><th>${this.t('from')}</th><th>${this.t('to')}</th><th>${this.t('type')}</th><th>${this.t('label')}</th><th>${this.t('notes')}</th>${options.includeFiles ? `<th>${this.t('files')}</th>` : ''}</tr>
      ${links.map(link => {
            const fromEl = elements.find(e => e.id === link.fromId);
            const toEl = elements.find(e => e.id === link.toId);
            const arrow = link.directed ? '→' : '↔';
            const files = this.ownerAssets(link.assetIds, assets);
            return `<tr>
        <td>${this.elementRefHTML(link.fromId, fromEl?.label || '?')}</td>
        <td>${this.elementRefHTML(link.toId, toEl?.label || '?')}</td>
        <td>${arrow}</td>
        <td>${link.label ? escapeHtml(link.label) : '-'}</td>
        <td class="markdown-content">${link.notes ? this.markdownToHTML(link.notes) : '-'}</td>
        ${options.includeFiles ? `<td class="file-list">${files.length > 0 ? files.map(a => escapeHtml(a.filename)).join('<br>') : '-'}</td>` : ''}
      </tr>`;
          }).join('\n      ')}
    </table>
  </section>\n`;
        }
        return out;
      },
      files: () => {
        let out = '';
        if (options.includeFiles && totalFiles > 0) {
          out += `  <section>
    <h2>${this.t('attachedFiles')} (${totalFiles})</h2>
    <div class="media-grid">\n`;

          const owners = [
            ...elements.map(el => ({ caption: el.label, assetIds: el.assetIds })),
            ...links.map(lk => ({ caption: this.linkCaption(lk, elements), assetIds: lk.assetIds ?? [] })),
          ];
          for (const owner of owners) {
            for (const assetId of owner.assetIds) {
              const asset = assets.find(a => a.id === assetId);
              if (!asset) continue;
              const sizeKB = (asset.size / 1024).toFixed(1);
              const isImage = asset.mimeType.startsWith('image/');
              // Thumbnails can come from a collaboration peer, and this document is
              // opened via a same-origin blob: URL by openForPrint().
              const thumb = safeDataImageUrl(asset.thumbnailDataUrl);
              const hasPreview = isImage && thumb;

              out += `      <div class="media-item">
        ${hasPreview ? `<img src="${thumb}" alt="${escapeHtml(asset.filename)}" />` : `<div style="width:100pt;height:60pt;background:var(--color-bg);display:flex;align-items:center;justify-content:center;font-size:8pt;color:var(--color-secondary)">${asset.mimeType.split('/')[0].toUpperCase()}</div>`}
        <div class="media-name">${escapeHtml(asset.filename)}</div>
        <div style="font-size:7pt;color:var(--color-secondary)">${escapeHtml(owner.caption)} - ${sizeKB} Ko</div>
      </div>\n`;
            }
          }

          out += `    </div>
  </section>\n`;
        }
        return out;
      },
      fiches: () => {
        let out = '';
        if (options.includeFiches) {
          const elementsWithData = sortedElements.filter(hasFiche);

          // The sheets of the scope first, then those of the linked elements
          const { primary, linked } = this.splitPrimary(elementsWithData, options);
          if (elementsWithData.length > 0) {
            // No empty heading when only linked elements have a sheet
            if (primary.length > 0) {
              out += `  <section>
    <h2>${this.t('detailedSheets')} (${primary.length})</h2>\n`;
            }

            for (const el of [...primary, ...linked]) {
              // With a sheet per page, each sheet but the first after a heading starts a page
              const headed = el === primary[0] || el === linked[0];
              if (el === linked[0]) {
                const newPage = options.fichePerPage && primary.length > 0 ? ' class="new-page"' : '';
                out += `${primary.length > 0 ? '  </section>\n' : ''}  <section${newPage}>
    <h2>${this.t('linkedSheets')} (${linked.length})</h2>\n`;
              }
              const connections = links
                .filter(l => l.fromId === el.id || l.toId === el.id)
                .map(l => {
                  const otherId = l.fromId === el.id ? l.toId : l.fromId;
                  const otherEl = elements.find(e => e.id === otherId);
                  const direction = l.fromId === el.id ? '→' : '←';
                  return { id: otherId, label: otherEl?.label || '?', linkLabel: l.label, direction };
                });

              const elAssets = el.assetIds
                .map(id => assets.find(a => a.id === id))
                .filter((a): a is Asset => a !== undefined);

              out += `    <div class="fiche${options.fichePerPage && !headed ? ' new-page' : ''}" id="${this.ficheAnchor(el.id)}">
      <h3 style="margin:0 0 8pt;color:var(--color-primary)">${escapeHtml(el.label)}</h3>\n`;

              // Files first, with their previews: they are what the reader looks at first
              if (elAssets.length > 0) {
                out += `      <div style="margin-bottom:8pt">
        <div style="font-size:8pt;text-transform:uppercase;color:var(--color-secondary);padding:4pt 0;background:var(--color-bg-alt)">${this.t('files')} (${elAssets.length})</div>
        <div class="media-grid" style="margin-top:6pt">
          ${elAssets.map(a => {
                const isImage = a.mimeType.startsWith('image/');
                const thumb = safeDataImageUrl(a.thumbnailDataUrl);
                const hasPreview = isImage && thumb;
                return `<div class="media-item" style="max-width:100pt">
            ${hasPreview ? `<img src="${thumb}" alt="${escapeHtml(a.filename)}" style="max-width:90pt;max-height:60pt" />` : `<div style="width:60pt;height:40pt;background:var(--color-bg);display:flex;align-items:center;justify-content:center;font-size:7pt;color:var(--color-secondary)">${a.mimeType.split('/')[0].toUpperCase()}</div>`}
            <div style="font-size:7pt;color:var(--color-secondary);word-break:break-all">${escapeHtml(a.filename)}</div>
            <div style="font-size:6pt;color:var(--color-secondary)">${(a.size / 1024).toFixed(1)} Ko</div>
          </div>`;
              }).join('\n          ')}
        </div>
      </div>\n`;
              }

              out += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">${this.t('identity')}</th></tr>
        <tr><td>${this.t('tags')}</td><td>${el.tags.length > 0 ? el.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') : '-'}</td></tr>
        <tr><td>${this.evaluationTitle()}</td><td>${this.evaluationText(el)}</td></tr>
        <tr><td>${this.t('source')}</td><td>${el.source ? this.sourceHTML(el.source) : '-'}</td></tr>
        ${el.notes ? `<tr><td>${this.t('notes')}</td><td class="markdown-content">${this.markdownToHTML(el.notes)}</td></tr>` : ''}
      </table>\n`;

              // Properties
              if (el.properties.length > 0) {
                out += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">${this.t('properties')} (${el.properties.length})</th></tr>
        ${el.properties.map(p => `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(formatPropertyValue(p.value, p.type, locale, p.timeZone))}</td></tr>`).join('\n        ')}
      </table>\n`;
              }

              // Events
              if (el.events.length > 0) {
                out += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">${this.t('events')} (${el.events.length})</th></tr>
        ${el.events.map(ev => {
              const dateStr = formatEventWhen(ev, locale);
              const geo = ev.geo ? ` [${getGeoCenter(ev.geo).lat.toFixed(4)}, ${getGeoCenter(ev.geo).lng.toFixed(4)}${isGeoPolygon(ev.geo) ? ' zone' : ''}]` : '';
              return `<tr><td>${escapeHtml(dateStr)}</td><td><b>${escapeHtml(ev.label)}</b>${ev.description ? ` - ${escapeHtml(ev.description)}` : ''}${geo}</td></tr>`;
            }).join('\n        ')}
      </table>\n`;
              }

              // Connections
              if (connections.length > 0) {
                out += `      <table class="fiche-table">
        <tr><th colspan="2" style="background:var(--color-bg-alt)">${this.t('relations')} (${connections.length})</th></tr>
        ${connections.map(c => `<tr><td>${c.direction}</td><td><b>${this.elementRefHTML(c.id, c.label)}</b>${c.linkLabel ? ` (${escapeHtml(c.linkLabel)})` : ''}</td></tr>`).join('\n        ')}
      </table>\n`;
              }

              out += `    </div>\n`;
            }

            out += `  </section>\n`;
          }
        }
        return out;
      },
    };
    // On paper, each part after the first may start a new page
    let written = 0;
    for (const section of normalizeSectionOrder(options.sectionOrder)) {
      const part = parts[section]();
      if (!part) continue;
      if (written > 0 && options.pageBreaks) html += `  <div class="page-break"></div>\n`;
      html += part;
      written++;
    }

    html += `  <footer class="generated-by">${escapeHtml(this.t('generatedBy'))} - <a href="${ZERONEURONE_URL}" target="_blank" rel="noopener noreferrer">${ZERONEURONE_URL.replace('https://', '')}</a></footer>
</body>
</html>`;

    return html;
  }

  /**
   * Render elements as HTML table
   */
  private renderElementsTableHTML(elements: Element[], assets: Asset[], options: ReportOptions): string {
    const showProps = options.includeProperties;

    const html = `    <table>
      <tr>
        <th>${this.t('element')}</th>
        <th>${this.t('notes')}</th>
        <th>${this.t('tags')}</th>
        <th>${this.evaluationTitle()}</th>
        <th>${this.t('source')}</th>
        ${showProps ? `<th>${this.t('properties')}</th>` : ''}
        ${options.includeFiles ? `<th>${this.t('files')}</th>` : ''}
      </tr>
      ${elements.map(el => {
        const propsHtml = showProps && el.properties.length > 0
          ? el.properties.map(p => `<b>${escapeHtml(p.key)}:</b> ${escapeHtml(formatPropertyValue(p.value, p.type, i18next.language, p.timeZone))}`).join('<br>')
          : '-';
        const filesHtml = options.includeFiles && el.assetIds.length > 0
          ? el.assetIds.map(id => {
              const asset = assets.find(a => a.id === id);
              return asset ? escapeHtml(asset.filename) : '?';
            }).join(', ')
          : '-';
        return `<tr>
        <td><span class="color-dot" style="background:${safeColor(el.visual.color, '#d4cec4')}"></span>${this.elementRefHTML(el.id, el.label)}</td>
        <td class="markdown-content">${el.notes ? this.markdownToHTML(el.notes) : '-'}</td>
        <td>${el.tags.length > 0 ? el.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('') : '-'}</td>
        <td>${this.evaluationText(el)}</td>
        <td>${el.source ? this.sourceHTML(el.source) : '-'}</td>
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
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    assets: Asset[],
    options: ReportOptions,
    language?: string
  ): string {
    const title = options.title || dossier.name;
    const sortedElements = this.sortElements(elements, options.sortElementsBy);
    const insights = options.includeInsights ? insightsService.computeInsights() : null;
    const locale = language || i18next.language || 'fr';

    const allEvents = elements.flatMap(el =>
      el.events.map(ev => ({
        ...ev,
        elementLabel: el.label,
        elementId: el.id,
      }))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalEvents = allEvents.length;
    const totalFiles = elements.reduce((sum, el) => sum + el.assetIds.length, 0)
      + links.reduce((sum, lk) => sum + (lk.assetIds?.length ?? 0), 0);

    let md = `# ${title}\n\n`;
    md += `*${this.t('generatedOn', { date: new Date().toLocaleDateString(dateLocale(locale)), time: new Date().toLocaleTimeString(dateLocale(locale)) })}*\n\n`;

    // Each part, written in the order the user chose
    const parts: Record<ReportSection, () => string> = {
      description: () => {
        let out = '';
        if (options.includeDescription && dossier.description) {
          out += `> ${dossier.description}\n\n`;
        }
        return out;
      },
      summary: () => {
        let out = '';
        if (options.includeSummary) {
          const geoElements = elements.filter(el => el.geo || el.events.some(ev => ev.geo));
          const tagCounts = this.getTagCounts(elements);

          out += `## ${this.t('summary')}\n\n`;
          out += `| ${this.t('metric')} | ${this.t('value')} |\n`;
          out += `|----------|--------|\n`;
          out += `| ${this.t('elements')} | ${elements.length} |\n`;
          out += `| ${this.t('links')} | ${links.length} |\n`;
          out += `| ${this.t('events')} | ${totalEvents} |\n`;
          out += `| ${this.t('locations')} | ${geoElements.length} |\n`;
          out += `| ${this.t('uniqueTags')} | ${Object.keys(tagCounts).length} |\n`;
          out += `| ${this.t('files')} | ${totalFiles} |\n\n`;
        }
        return out;
      },
      // Captures are not written into Markdown
      graph: () => '',
      map: () => '',
      timelineView: () => '',
      insights: () => {
        let out = '';
        if (options.includeInsights && insights) {
          out += `## ${this.t('graphAnalysis')}\n\n`;

          if (insights.clusters.length > 1) {
            out += `### ${this.t('clustersIdentified')} (${insights.clusters.length})\n\n`;
            out += `| ${this.t('cluster')} | ${this.t('nbElements')} | ${this.t('elements')} |\n`;
            out += `|---------|-------------|----------|\n`;
            for (const cluster of insights.clusters) {
              const clusterEls = cluster.elementIds.map(id => elements.find(e => e.id === id)?.label || '?').slice(0, 5);
              const more = cluster.elementIds.length > 5 ? ` (+${cluster.elementIds.length - 5})` : '';
              out += `| ${cluster.id} | ${cluster.elementIds.length} | ${clusterEls.join(', ')}${more} |\n`;
            }
            out += `\n`;
          }

          if (insights.centrality.length > 0) {
            out += `### ${this.t('centralElements')} (top 10)\n\n`;
            out += `| ${this.t('element')} | ${this.t('centralityScore')} | ${this.t('connections')} |\n`;
            out += `|---------|-------|------------|\n`;
            const topCentral = insights.centrality.slice(0, 10);
            for (const c of topCentral) {
              const el = elements.find(e => e.id === c.elementId);
              const connectionCount = links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length;
              out += `| ${el?.label || this.t('unknown')} | ${c.score.toFixed(3)} | ${connectionCount} |\n`;
            }
            out += `\n`;
          }

          if (insights.bridges.length > 0) {
            out += `### ${this.t('bridgeElements')} (${insights.bridges.length})\n\n`;
            out += `*${this.t('bridgeDescription')}*\n\n`;
            for (const id of insights.bridges.slice(0, 10)) {
              const el = elements.find(e => e.id === id);
              out += `- ${el?.label || this.t('unknown')}\n`;
            }
            out += `\n`;
          }

          if (insights.isolated.length > 0) {
            out += `### ${this.t('isolatedElements')} (${insights.isolated.length})\n\n`;
            out += `*${this.t('isolatedDescription')}*\n\n`;
            for (const id of insights.isolated.slice(0, 10)) {
              const el = elements.find(e => e.id === id);
              out += `- ${el?.label || this.t('unknown')}\n`;
            }
            if (insights.isolated.length > 10) {
              out += `- ${this.t('andMore', { count: insights.isolated.length - 10 })}\n`;
            }
            out += `\n`;
          }
        }
        return out;
      },
      timeline: () => {
        let out = '';
        if (options.includeTimeline && allEvents.length > 0) {
          out += `## ${this.t('timeline')} (${allEvents.length} ${this.t('events').toLowerCase()})\n\n`;
          out += `| ${this.t('date')} | ${this.t('element')} | ${this.t('event')} | ${this.t('details')} |\n`;
          out += `|------|---------|-----------|----------|\n`;
          for (const ev of allEvents) {
            const dateStr = formatEventWhen(ev, locale);
            const location = ev.geo && ev.geo.type === 'point' ? `[${ev.geo.lat.toFixed(4)}, ${ev.geo.lng.toFixed(4)}]` : '';
            const details = [ev.description, location].filter(Boolean).join(' ');
            out += `| ${dateStr} | ${ev.elementLabel} | ${ev.label} | ${details || '-'} |\n`;
          }
          out += `\n`;
        }
        return out;
      },
      elements: () => {
        let out = '';
        if (options.includeElements) {
          out += `## ${this.t('elements')} (${elements.length})\n\n`;

          const writeList = (list: Element[], tagLevel: string) => {
            if (options.groupElementsByTag) {
              const tagGroups = this.groupByTags(list, locale);
              for (const [tag, tagElements] of Object.entries(tagGroups)) {
                out += `${tagLevel} ${tag} (${tagElements.length})\n\n`;
                out += this.renderElementsTableMarkdown(tagElements, assets, options);
              }
            } else {
              out += this.renderElementsTableMarkdown(list, assets, options);
            }
          };
          // The elements of the scope first, then those linked to them
          const { primary, linked } = this.splitPrimary(sortedElements, options);
          writeList(primary, '###');
          if (linked.length > 0) {
            out += `### ${this.t('linkedElements')} (${linked.length})\n\n`;
            writeList(linked, '####');
          }
        }
        return out;
      },
      links: () => {
        let out = '';
        if (options.includeLinks && links.length > 0) {
          out += `## ${this.t('links')} (${links.length})\n\n`;
          const linkFiles = options.includeFiles;
          out += `| ${this.t('from')} | ${this.t('to')} | ${this.t('type')} | ${this.t('label')} | ${this.t('notes')} |${linkFiles ? ` ${this.t('files')} |` : ''}\n`;
          out += `|----|------|------|-------|-------|${linkFiles ? '-------|' : ''}\n`;
          for (const link of links) {
            const fromEl = elements.find(e => e.id === link.fromId);
            const toEl = elements.find(e => e.id === link.toId);
            const arrow = link.directed ? '→' : '↔';
            const files = linkFiles ? ` ${this.ownerAssets(link.assetIds, assets).map(a => a.filename).join(', ') || '-'} |` : '';
            out += `| ${fromEl?.label || '?'} | ${toEl?.label || '?'} | ${arrow} | ${link.label || '-'} | ${link.notes || '-'} |${files}\n`;
          }
          out += `\n`;
        }
        return out;
      },
      files: () => {
        let out = '';
        if (options.includeFiles && totalFiles > 0) {
          out += `## ${this.t('attachedFiles')} (${totalFiles})\n\n`;
          out += `| ${this.t('attachedTo')} | ${this.t('filename')} | ${this.t('fileType')} | ${this.t('size')} |\n`;
          out += `|---------|---------|------|--------|\n`;
          const owners = [
            ...elements.map(el => ({ caption: el.label, assetIds: el.assetIds })),
            ...links.map(lk => ({ caption: this.linkCaption(lk, elements), assetIds: lk.assetIds ?? [] })),
          ];
          for (const owner of owners) {
            for (const assetId of owner.assetIds) {
              const asset = assets.find(a => a.id === assetId);
              if (asset) {
                const sizeKB = (asset.size / 1024).toFixed(1);
                out += `| ${owner.caption} | ${asset.filename} | ${asset.mimeType} | ${sizeKB} Ko |\n`;
              }
            }
          }
          out += `\n`;
        }
        return out;
      },
      fiches: () => {
        let out = '';
        if (options.includeFiches) {
          const elementsWithData = sortedElements.filter(hasFiche);

          // The sheets of the scope first, then those of the linked elements
          const { primary, linked } = this.splitPrimary(elementsWithData, options);
          if (elementsWithData.length > 0) {
            if (primary.length > 0) out += `## ${this.t('detailedSheets')} (${primary.length})\n\n`;

            for (const el of [...primary, ...linked]) {
              if (el === linked[0]) out += `## ${this.t('linkedSheets')} (${linked.length})\n\n`;
              const connections = links
                .filter(l => l.fromId === el.id || l.toId === el.id)
                .map(l => {
                  const otherId = l.fromId === el.id ? l.toId : l.fromId;
                  const otherEl = elements.find(e => e.id === otherId);
                  const direction = l.fromId === el.id ? '→' : '←';
                  return { label: otherEl?.label || '?', linkLabel: l.label, direction };
                });

              const elAssets = el.assetIds
                .map(id => assets.find(a => a.id === id))
                .filter((a): a is Asset => a !== undefined);

              out += `### ${el.label}\n\n`;

              // Files first: they are what the reader looks at first
              if (elAssets.length > 0) {
                out += `**${this.t('files')} (${elAssets.length})**\n\n`;
                out += `| ${this.t('fileType')} | ${this.t('filename')} | ${this.t('size')} |\n`;
                out += `|------|---------|--------|\n`;
                for (const a of elAssets) {
                  out += `| ${a.mimeType.split('/')[0]} | ${a.filename} | ${(a.size / 1024).toFixed(1)} Ko |\n`;
                }
                out += `\n`;
              }

              // Identity
              out += `**${this.t('identity')}**\n\n`;
              out += `| ${this.t('field')} | ${this.t('value')} |\n`;
              out += `|-------|--------|\n`;
              out += `| ${this.t('tags')} | ${el.tags.length > 0 ? el.tags.join(', ') : '-'} |\n`;
              out += `| ${this.evaluationTitle()} | ${this.evaluationText(el)} |\n`;
              out += `| ${this.t('source')} | ${el.source ? joinSourceLines(sourceToMarkdown(el.source, getSourceSchemeNames()), '<br>') : '-'} |\n`;
              if (el.notes) {
                out += `| ${this.t('notes')} | ${el.notes.replace(/\n/g, ' ')} |\n`;
              }
              out += `\n`;

              // Properties
              if (el.properties.length > 0) {
                out += `**${this.t('properties')} (${el.properties.length})**\n\n`;
                out += `| ${this.t('property')} | ${this.t('value')} |\n`;
                out += `|-----------|--------|\n`;
                for (const p of el.properties) {
                  out += `| ${p.key} | ${formatPropertyValue(p.value, p.type, locale, p.timeZone)} |\n`;
                }
                out += `\n`;
              }

              // Events
              if (el.events.length > 0) {
                out += `**${this.t('events')} (${el.events.length})**\n\n`;
                out += `| ${this.t('date')} | ${this.t('event')} | ${this.t('details')} |\n`;
                out += `|------|-----------|----------|\n`;
                for (const ev of el.events) {
                  const dateStr = formatEventWhen(ev, locale);
                  const geo = ev.geo ? ` [${getGeoCenter(ev.geo).lat.toFixed(4)}, ${getGeoCenter(ev.geo).lng.toFixed(4)}${isGeoPolygon(ev.geo) ? ' zone' : ''}]` : '';
                  out += `| ${dateStr} | ${ev.label} | ${ev.description || '-'}${geo} |\n`;
                }
                out += `\n`;
              }

              // Connections
              if (connections.length > 0) {
                out += `**${this.t('relations')} (${connections.length})**\n\n`;
                out += `| ${this.t('direction')} | ${this.t('element')} | ${this.t('linkType')} |\n`;
                out += `|-----------|---------|---------------|\n`;
                for (const c of connections) {
                  out += `| ${c.direction} | ${c.label} | ${c.linkLabel || '-'} |\n`;
                }
                out += `\n`;
              }


              out += `---\n\n`;
            }
          }
        }
        return out;
      },
    };
    for (const section of normalizeSectionOrder(options.sectionOrder)) md += parts[section]();

    md += `---\n\n*${this.t('generatedBy')} - [${ZERONEURONE_URL.replace('https://', '')}](${ZERONEURONE_URL})*\n`;

    return md;
  }

  /**
   * Render elements as Markdown table
   */
  private renderElementsTableMarkdown(elements: Element[], assets: Asset[], options: ReportOptions): string {
    const showProps = options.includeProperties;
    const showFiles = options.includeFiles;

    let md = `| ${this.t('element')} | ${this.t('notes')} | ${this.t('tags')} | ${this.evaluationTitle()} | ${this.t('source')} |`;
    if (showProps) md += ` ${this.t('properties')} |`;
    if (showFiles) md += ` ${this.t('files')} |`;
    md += `\n`;

    md += `|---------|-------|------|-----------|--------|`;
    if (showProps) md += `------------|`;
    if (showFiles) md += `----------|`;
    md += `\n`;

    for (const el of elements) {
      const tags = el.tags.length > 0 ? el.tags.join(', ') : '-';
      const confidence = this.evaluationText(el);
      const props = showProps && el.properties.length > 0
        ? el.properties.map(p => `**${p.key}:** ${formatPropertyValue(p.value, p.type, i18next.language, p.timeZone)}`).join(', ')
        : '-';
      const files = showFiles && el.assetIds.length > 0
        ? el.assetIds.map(id => {
            const asset = assets.find(a => a.id === id);
            return asset ? asset.filename : '?';
          }).join(', ')
        : '-';

      md += `| ${el.label} | ${el.notes || '-'} | ${tags} | ${confidence} | ${el.source ? joinSourceLines(sourceToMarkdown(el.source, getSourceSchemeNames()), '<br>') : '-'} |`;
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
    dossier: Dossier,
    elements: Element[],
    links: Link[],
    _assets: Asset[],
    _language?: string
  ): string {
    const insights = insightsService.computeInsights();

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
        purpose: 'Structured dossier data with graph analysis',
      },
      dossier: {
        id: dossier.id,
        name: dossier.name,
        description: dossier.description || null,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt,
      },
      summary: {
        totalElements: elements.length,
        totalLinks: links.length,
        totalEvents: allEvents.length,
        elementsWithGeo: elements.filter(el => el.geo || el.events.some(ev => ev.geo)).length,
        elementsWithFiles: elements.filter(el => el.assetIds.length > 0).length,
        linksWithFiles: links.filter(lk => (lk.assetIds?.length ?? 0) > 0).length,
        allTags: [...new Set(elements.flatMap(el => el.tags))],
      },
      elements: elements.map(el => ({
        id: el.id,
        label: el.label,
        notes: el.notes || null,
        tags: el.tags,
        confidence: el.confidence,
        evaluation: el.evaluation ?? null,
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
          fromLabel: fromEl?.label || this.t('unknown'),
          toId: link.toId,
          toLabel: toEl?.label || this.t('unknown'),
          label: link.label || null,
          notes: link.notes || null,
          directed: link.directed,
          confidence: link.confidence,
          evaluation: link.evaluation ?? null,
          source: link.source || null,
          properties: link.properties.reduce((acc, p) => {
            acc[p.key] = p.value;
            return acc;
          }, {} as Record<string, unknown>),
          dateRange: link.dateRange || null,
          fileCount: link.assetIds?.length ?? 0,
        };
      }),
      timeline: allEvents,
      insights: insights ? {
        clusters: insights.clusters.map(c => ({
          id: c.id,
          size: c.elementIds.length,
          elementLabels: c.elementIds.map(id => elementMap.get(id)?.label || this.t('unknown')),
        })),
        centralElements: insights.centrality.slice(0, 15).map(c => ({
          label: elementMap.get(c.elementId)?.label || this.t('unknown'),
          centralityScore: c.score,
          connectionCount: links.filter(l => l.fromId === c.elementId || l.toId === c.elementId).length,
        })),
        bridgeElements: insights.bridges.slice(0, 10).map(id => elementMap.get(id)?.label || this.t('unknown')),
        isolatedElements: insights.isolated.map(id => elementMap.get(id)?.label || this.t('unknown')),
      } : null,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Open report in new window for printing
   */
  openForPrint(html: string): void {
    // A Blob URL rather than document.write (deprecated): the report is parsed
    // as a normal document instead of being written into a blank one.
    // Note it stays same-origin — a Blob URL inherits the creating origin — so
    // the escaping in generateHTML remains the actual defence.
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      URL.revokeObjectURL(url);
      return;
    }

    let printed = false;
    const printOnce = () => {
      if (printed) return;
      printed = true;
      printWindow.print();
      URL.revokeObjectURL(url);
    };

    // Print once the document is actually rendered; a large report can take
    // well over any fixed delay.
    printWindow.addEventListener('load', printOnce, { once: true });
    // Fallback in case the load event already fired before we subscribed.
    setTimeout(printOnce, 3000);
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
    downloadBlob(blob, filename + extension);
  }

  /** Elements whose name leads to their sheet: those with one, when sheets and links are asked for */
  private linkedFicheIds(elements: Element[], options: ReportOptions): ReadonlySet<string> {
    if (!options.includeFiches || !options.ficheLinks) return new Set();
    return new Set(elements.filter(hasFiche).map(el => el.id));
  }

  private ficheAnchor(id: string): string {
    return ficheAnchor(id);
  }

  /** An element's name, leading to its sheet when it has one in this report */
  private elementRefHTML(id: string, label: string): string {
    const text = escapeHtml(label);
    return this.ficheIds.has(id) ? `<a class="fiche-link" href="#${this.ficheAnchor(id)}">${text}</a>` : text;
  }

  /** Text as the inside of a CSS string: quotes, backslashes and line ends escaped, no tag closing */
  private cssString(text: string): string {
    return text.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ');
  }

  /**
   * Elements split into those of the scope and those only linked to it, each
   * keeping its order. Without a scope, all are in the first part.
   */
  private splitPrimary(elements: Element[], options: ReportOptions): { primary: Element[]; linked: Element[] } {
    if (!options.primaryElementIds) return { primary: elements, linked: [] };
    const ids = new Set(options.primaryElementIds);
    return {
      primary: elements.filter(el => ids.has(el.id)),
      linked: elements.filter(el => !ids.has(el.id)),
    };
  }

  /** A map or timeline capture (SVG markup) as an image section */
  private svgSectionHTML(heading: string, svg: string | null | undefined): string {
    if (!svg) return '';
    return `  <section class="screenshot-section">
    <h2>${escapeHtml(heading)}</h2>
    <img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="${escapeHtml(heading)}" style="width:100%;height:auto;border:1px solid var(--color-border)" />
  </section>\n`;
  }

  /** A link named by its ends, as in the files lists: "A → B (label)" */
  private linkCaption(link: Link, elements: Element[]): string {
    const from = elements.find(e => e.id === link.fromId)?.label || '?';
    const to = elements.find(e => e.id === link.toId)?.label || '?';
    return `${from} ${link.directed ? '→' : '↔'} ${to}${link.label ? ` (${link.label})` : ''}`;
  }

  /** The files of an element or link, in their order */
  private ownerAssets(assetIds: string[] | undefined, assets: Asset[]): Asset[] {
    return (assetIds ?? [])
      .map(id => assets.find(a => a.id === id))
      .filter((a): a is Asset => a !== undefined);
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
          if (this.evaluationModel !== 'zeroneurone') {
            const ka = evaluationSortKey(a.evaluation, this.evaluationModel);
            const kb = evaluationSortKey(b.evaluation, this.evaluationModel);
            return ka === kb ? 0 : ka < kb ? -1 : 1;
          }
          return (b.confidence ?? -1) - (a.confidence ?? -1);
        default:
          return 0;
      }
    });
  }

  private groupByTags(elements: Element[], _locale?: string): Record<string, Element[]> {
    const noTagLabel = this.t('noTag');
    const groups: Record<string, Element[]> = { [noTagLabel]: [] };

    for (const el of elements) {
      if (el.tags.length === 0) {
        groups[noTagLabel].push(el);
      } else {
        for (const tag of el.tags) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(el);
        }
      }
    }

    // Remove empty "No tag" group
    if (groups[noTagLabel].length === 0) {
      delete groups[noTagLabel];
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

  /** Source as HTML: web links become anchors, asset and plugin links their label only. */
  private sourceHTML(source: string): string {
    return parseSourceLinks(source, getSourceSchemeNames())
      .map(s => {
        // One source per line
        if (s.kind === 'text') return escapeHtml(s.text).replace(/\r?\n/g, '<br>');
        if (!isWebScheme(s.scheme)) return escapeHtml(s.label);
        return `<a href="${escapeHtml(s.target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`;
      })
      .join('');
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
      return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string;
    } catch {
      // Fallback to escaped HTML if markdown parsing fails
      return escapeHtml(text).replace(/\n/g, '<br>');
    }
  }
}

export const reportService = new ReportService();
