/**
 * The synthesis as a Word document (.docx). Loaded on demand by
 * reportService.generateDocx, with the `docx` library it pulls in.
 * Same parts, in the same order, as the HTML synthesis.
 */
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { marked, type Token, type Tokens } from 'marked';
import type { Asset, Dossier, Element, Link } from '../types';
import type { InsightsResult } from './insightsService';
import type { ReportOptions, ReportSection } from './reportService';
import { ficheAnchor, hasFiche, normalizeSectionOrder, ZERONEURONE_URL } from './reportService';
import { formatEventWhen } from '../utils/temporalUtils';
import { dateLocale, formatPropertyValue } from '../utils/dates';
import { getGeoCenter, isGeoPolygon } from '../utils/geo';
import { isWebScheme, parseSourceLinks } from '../utils/sourceLinks';
import { getSourceSchemeNames } from '../plugins/sourceSchemes';
import { safeDataImageUrl } from '../utils/escapeHtml';

export interface DocxReportInput {
  dossier: Dossier;
  title: string;
  locale: string;
  elements: Element[];
  links: Link[];
  assets: Asset[];
  options: ReportOptions;
  /** Elements in the order chosen for the lists */
  sorted: Element[];
  insights: InsightsResult | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  evaluationTitle: () => string;
  evaluationText: (item: Element | Link) => string;
  groupByTags: (elements: Element[]) => Record<string, Element[]>;
  splitPrimary: (elements: Element[]) => { primary: Element[]; linked: Element[] };
  tagCount: number;
}

/** Width of the text on an A4 page with the default margins, in twips and in pixels (96 dpi) */
const CONTENT_TWIPS = 11906 - 2 * 1440;
const CONTENT_PX = Math.floor((CONTENT_TWIPS / 1440) * 96);
const TABLE_TEXT = 17; // half-points
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D4CEC4' };
const HEADER_FILL = 'F0ECE4';
/** 1x1 transparent PNG: the fallback when an SVG cannot be turned into a picture */
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Text Word can hold: control characters other than tab and line ends make the XML invalid */
export function wordText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text: wordText(text), ...opts });

const para = (children: ParagraphChild[] | string, opts: { size?: number; spacingAfter?: number } = {}) =>
  new Paragraph({
    children: typeof children === 'string' ? [run(children, { size: opts.size })] : children,
    spacing: { after: opts.spacingAfter ?? 60 },
  });

const heading = (text: string, level: 1 | 2 | 3, pageBreakBefore = false) =>
  new Paragraph({
    text: wordText(text),
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 320 : 200, after: 100 },
    keepNext: true,
    pageBreakBefore,
  });

/** A link the reader can follow when it points to the web, its text otherwise */
const hyperlink = (text: string, href: string): ParagraphChild =>
  /^https?:\/\//i.test(href)
    ? new ExternalHyperlink({ link: href, children: [new TextRun({ text: wordText(text), style: 'Hyperlink' })] })
    : run(text);

type CellContent = string | Paragraph[];

/** A table filling the text width, columns sized by the given weights */
function table(headers: string[], rows: CellContent[][], weights: number[]): Table {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((CONTENT_TWIPS * w) / total));
  const cell = (content: CellContent, col: number, header = false) =>
    new TableCell({
      width: { size: widths[col], type: WidthType.DXA },
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: HEADER_FILL } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: typeof content === 'string'
        ? [new Paragraph({ children: [run(content, { size: TABLE_TEXT, bold: header })] })]
        : content.length > 0 ? content : [new Paragraph({ children: [] })],
    });
  return new Table({
    width: { size: CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i)) })),
    ],
  });
}

/** Space after a table, which Word otherwise glues to the next paragraph */
const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

/** Inline Markdown tokens as runs: bold, italics, code and links kept */
function inlineRuns(tokens: Token[] | undefined, size?: number, style: { bold?: boolean; italics?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const tk of tokens ?? []) {
    switch (tk.type) {
      case 'strong':
        out.push(...inlineRuns((tk as Tokens.Strong).tokens, size, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inlineRuns((tk as Tokens.Em).tokens, size, { ...style, italics: true }));
        break;
      case 'del':
        out.push(...inlineRuns((tk as Tokens.Del).tokens, size, style));
        break;
      case 'link': {
        const link = tk as Tokens.Link;
        out.push(hyperlink(link.text, link.href));
        break;
      }
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }));
        break;
      case 'codespan':
        out.push(run((tk as Tokens.Codespan).text, { ...style, size }));
        break;
      case 'text': {
        const text = tk as Tokens.Text;
        if (text.tokens && text.tokens.length > 0) out.push(...inlineRuns(text.tokens, size, style));
        else out.push(...lines(decodeEntities(text.text), size, style));
        break;
      }
      case 'escape':
        out.push(run((tk as Tokens.Escape).text, { ...style, size }));
        break;
      default:
        if ('text' in tk && typeof tk.text === 'string') out.push(run(decodeEntities(tk.text), { ...style, size }));
    }
  }
  return out;
}

/** Text with its line ends kept as line breaks */
function lines(text: string, size?: number, style: { bold?: boolean; italics?: boolean } = {}): TextRun[] {
  return text.split(/\r?\n/).map((line, i) => new TextRun({ text: wordText(line), break: i > 0 ? 1 : undefined, size, ...style }));
}

/** marked leaves the HTML entities of plain text encoded */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] ?? _);
}

/** Markdown (notes, description) as Word paragraphs */
function markdownParagraphs(text: string, size?: number): Paragraph[] {
  if (!text) return [];
  let tokens: Token[];
  try {
    tokens = marked.lexer(text, { gfm: true, breaks: true });
  } catch {
    return [new Paragraph({ children: lines(text, size) })];
  }
  const out: Paragraph[] = [];
  const block = (tk: Token, indent = 0) => {
    switch (tk.type) {
      case 'space':
      case 'hr':
        break;
      case 'heading':
        out.push(new Paragraph({ children: inlineRuns((tk as Tokens.Heading).tokens, size, { bold: true }), spacing: { after: 60 } }));
        break;
      case 'list': {
        const list = tk as Tokens.List;
        list.items.forEach((item, i) => {
          const marker = list.ordered ? `${(Number(list.start) || 1) + i}. ` : '• ';
          const [first, ...rest] = item.tokens;
          const firstRuns = first && (first.type === 'text' || first.type === 'paragraph')
            ? inlineRuns((first as Tokens.Text).tokens ?? [first], size)
            : [];
          out.push(new Paragraph({ children: [run(marker, { size }), ...firstRuns], indent: { left: 360 * (indent + 1) }, spacing: { after: 20 } }));
          const others = first && (first.type === 'text' || first.type === 'paragraph') ? rest : item.tokens;
          others.forEach((t) => block(t, indent + 1));
        });
        break;
      }
      case 'blockquote':
        (tk as Tokens.Blockquote).tokens.forEach((t) => block(t, indent + 1));
        break;
      case 'code':
        out.push(new Paragraph({ children: lines((tk as Tokens.Code).text, size), indent: { left: 360 * (indent + 1) } }));
        break;
      case 'table': {
        const tb = tk as Tokens.Table;
        const row = (cells: Tokens.TableCell[]) => cells.map((c) => c.text).join(' | ');
        out.push(new Paragraph({ children: [run(row(tb.header), { size, bold: true })] }));
        tb.rows.forEach((r) => out.push(new Paragraph({ children: [run(row(r), { size })] })));
        break;
      }
      default: {
        const withTokens = tk as Tokens.Paragraph;
        out.push(new Paragraph({
          children: withTokens.tokens ? inlineRuns(withTokens.tokens, size) : lines(decodeEntities(('text' in tk ? String(tk.text) : '')), size),
          indent: indent > 0 ? { left: 360 * indent } : undefined,
          spacing: { after: 60 },
        }));
      }
    }
  };
  tokens.forEach((t) => block(t));
  return out;
}

/** A source as runs: web links followable, asset and plugin links their label only, one source per line */
function sourceRuns(source: string, size: number): Paragraph[] {
  const runs: ParagraphChild[] = [];
  for (const s of parseSourceLinks(source, getSourceSchemeNames())) {
    if (s.kind === 'text') runs.push(...lines(s.text, size));
    else if (isWebScheme(s.scheme)) runs.push(hyperlink(s.label, s.target));
    else runs.push(run(s.label, { size }));
  }
  return [new Paragraph({ children: runs })];
}

/** Natural size of an image, or null when it cannot be read */
function imageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

/** A size fitted to `maxWidth`, keeping the proportions */
function fit(size: { width: number; height: number }, maxWidth: number) {
  const scale = Math.min(1, maxWidth / size.width);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/** An SVG drawn as a PNG, for the Word versions that do not read SVG */
async function svgFallback(src: string, size: { width: number; height: number }): Promise<string> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = src; });
    const canvas = document.createElement('canvas');
    canvas.width = size.width * 2;
    canvas.height = size.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return BLANK_PNG;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return BLANK_PNG;
  }
}

/** A capture paragraph: the graph as a PNG, the map or the timeline as SVG */
async function captureParagraph(data: string, kind: 'png' | 'svg'): Promise<Paragraph | null> {
  const src = kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}` : data;
  const natural = await imageSize(src);
  if (!natural) return null;
  const transformation = fit(natural, CONTENT_PX);
  const image = kind === 'svg'
    ? new ImageRun({
        type: 'svg',
        data: new TextEncoder().encode(data),
        fallback: { type: 'png', data: await svgFallback(src, transformation) },
        transformation,
      })
    : new ImageRun({ type: /^data:image\/jpe?g/i.test(data) ? 'jpg' : 'png', data, transformation });
  return new Paragraph({ children: [image], alignment: AlignmentType.CENTER, spacing: { after: 120 } });
}

/** A file's thumbnail as a table cell, '-' when it has none */
async function thumbnailCell(a: Asset, maxWidth = 80): Promise<CellContent> {
  const thumb = a.mimeType.startsWith('image/') ? safeDataImageUrl(a.thumbnailDataUrl) : null;
  if (!thumb || !/^data:image\/(png|jpe?g)/i.test(thumb)) return '-';
  const size = await imageSize(thumb);
  if (!size) return '-';
  return [new Paragraph({ children: [new ImageRun({ type: /^data:image\/png/i.test(thumb) ? 'png' : 'jpg', data: thumb, transformation: fit(size, maxWidth) })] })];
}

/** The synthesis as a .docx file */
export async function renderReportDocx(input: DocxReportInput): Promise<Blob> {
  const { elements, links, assets, options, sorted, insights, t, locale } = input;
  const label = (id: string) => elements.find((e) => e.id === id)?.label || t('unknown');

  const allEvents = elements.flatMap((el) => el.events.map((ev) => ({ ...ev, elementLabel: el.label, elementId: el.id })))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const totalFiles = elements.reduce((sum, el) => sum + el.assetIds.length, 0)
    + links.reduce((sum, lk) => sum + (lk.assetIds?.length ?? 0), 0);
  const ownerAssets = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => assets.find((a) => a.id === id)).filter((a): a is Asset => a !== undefined);
  const linkCaption = (lk: Link) =>
    `${label(lk.fromId)} ${lk.directed ? '→' : '↔'} ${label(lk.toId)}${lk.label ? ` (${lk.label})` : ''}`;
  const sizeKB = (a: Asset) => `${(a.size / 1024).toFixed(1)} Ko`;
  // Element names lead to their sheet, when the report has one for them
  const ficheIds = new Set(options.includeFiches && options.ficheLinks ? elements.filter(hasFiche).map((el) => el.id) : []);
  const refRun = (id: string, text: string, opts: { bold?: boolean; size?: number } = {}): ParagraphChild =>
    ficheIds.has(id)
      ? new InternalHyperlink({ anchor: ficheAnchor(id), children: [new TextRun({ text: wordText(text), style: 'Hyperlink', ...opts })] })
      : run(text, opts);
  const refCell = (id: string, text: string): CellContent =>
    ficheIds.has(id) ? [new Paragraph({ children: [refRun(id, text, { size: TABLE_TEXT })] })] : text;
  /** Picture files as their thumbnail, others by name, in a two-column table */
  const filesTable = async (files: Asset[], title: string) => {
    const rows: CellContent[][] = [];
    for (const a of files) rows.push([await thumbnailCell(a), `${a.filename} - ${a.mimeType} - ${sizeKB(a)}`]);
    return table([title, ''], rows, [1.3, 3]);
  };
  const geoText = (geo: Parameters<typeof getGeoCenter>[0]) => {
    const c = getGeoCenter(geo);
    return `[${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}${isGeoPolygon(geo) ? ' zone' : ''}]`;
  };

  const elementsTable = (list: Element[]) => {
    const headers = [t('element'), t('notes'), t('tags'), input.evaluationTitle(), t('source')];
    const weights = [3, 3.6, 2, 2, 2.5];
    if (options.includeProperties) { headers.push(t('properties')); weights.push(3); }
    if (options.includeFiles) { headers.push(t('files')); weights.push(2); }
    return table(headers, list.map((el) => {
      const row: CellContent[] = [
        refCell(el.id, el.label),
        el.notes ? markdownParagraphs(el.notes, TABLE_TEXT) : '-',
        el.tags.join(', ') || '-',
        input.evaluationText(el),
        el.source ? sourceRuns(el.source, TABLE_TEXT) : '-',
      ];
      if (options.includeProperties) {
        row.push(el.properties.length > 0
          ? el.properties.map((p) => new Paragraph({ children: [run(`${p.key}: `, { bold: true, size: TABLE_TEXT }), run(formatPropertyValue(p.value, p.type, locale, p.timeZone), { size: TABLE_TEXT })] }))
          : '-');
      }
      if (options.includeFiles) row.push(ownerAssets(el.assetIds).map((a) => a.filename).join(', ') || '-');
      return row;
    }), weights);
  };

  const parts: Record<ReportSection, () => Promise<(Paragraph | Table)[]>> = {
    description: async () =>
      options.includeDescription && input.dossier.description ? markdownParagraphs(input.dossier.description) : [],

    summary: async () => {
      if (!options.includeSummary) return [];
      const geoCount = elements.filter((el) => el.geo || el.events.some((ev) => ev.geo)).length;
      return [
        heading(t('summary'), 1),
        table([t('metric'), t('value')], [
          [t('elements'), String(elements.length)],
          [t('links'), String(links.length)],
          [t('events'), String(allEvents.length)],
          [t('locations'), String(geoCount)],
          [t('uniqueTags'), String(input.tagCount)],
          [t('files'), String(totalFiles)],
        ], [3, 1]),
        gap(),
      ];
    },

    graph: async () => {
      if (!options.canvasScreenshot) return [];
      const image = await captureParagraph(options.canvasScreenshot, 'png');
      return image ? [heading(t('graphView'), 1), image] : [];
    },
    map: async () => {
      if (!options.mapSvg) return [];
      const image = await captureParagraph(options.mapSvg, 'svg');
      return image ? [heading(t('mapView'), 1), image] : [];
    },
    timelineView: async () => {
      if (!options.timelineSvg) return [];
      const image = await captureParagraph(options.timelineSvg, 'svg');
      return image ? [heading(t('timelineView'), 1), image] : [];
    },

    insights: async () => {
      if (!options.includeInsights || !insights) return [];
      const out: (Paragraph | Table)[] = [heading(t('graphAnalysis'), 1)];
      if (insights.clusters.length > 1) {
        out.push(heading(`${t('clustersIdentified')} (${insights.clusters.length})`, 2));
        out.push(table([t('cluster'), t('nbElements'), t('elements')], insights.clusters.map((c) => {
          const more = c.elementIds.length > 5 ? ` (+${c.elementIds.length - 5})` : '';
          return [String(c.id), String(c.elementIds.length), c.elementIds.slice(0, 5).map(label).join(', ') + more];
        }), [1, 1, 5]), gap());
      }
      if (insights.centrality.length > 0) {
        const top = insights.centrality.slice(0, 10);
        out.push(heading(`${t('centralElements')} (top ${top.length})`, 2));
        out.push(table([t('element'), t('centralityScore'), t('connections')], top.map((c) => [
          label(c.elementId),
          c.score.toFixed(3),
          String(links.filter((l) => l.fromId === c.elementId || l.toId === c.elementId).length),
        ]), [4, 1.5, 1.5]), gap());
      }
      const idList = (title: string, description: string, ids: string[]) => {
        out.push(heading(`${title} (${ids.length})`, 2));
        out.push(para([run(description, { italics: true, size: 18 })]));
        ids.slice(0, 10).forEach((id) => out.push(new Paragraph({ children: [run(`• ${label(id)}`)], indent: { left: 360 } })));
        if (ids.length > 10) out.push(new Paragraph({ children: [run(`• ${t('andMore', { count: ids.length - 10 })}`)], indent: { left: 360 } }));
      };
      if (insights.bridges.length > 0) idList(t('bridgeElements'), t('bridgeDescription'), insights.bridges);
      if (insights.isolated.length > 0) idList(t('isolatedElements'), t('isolatedDescription'), insights.isolated);
      return out;
    },

    timeline: async () => {
      if (!options.includeTimeline || allEvents.length === 0) return [];
      return [
        heading(`${t('timeline')} (${allEvents.length} ${t('events').toLowerCase()})`, 1),
        table([t('date'), t('element'), t('event'), t('details')], allEvents.map((ev) => [
          formatEventWhen(ev, locale),
          refCell(ev.elementId, ev.elementLabel),
          ev.label,
          [ev.description, ev.geo ? geoText(ev.geo) : ''].filter(Boolean).join(' ') || '-',
        ]), [2, 2, 2, 4]),
        gap(),
      ];
    },

    elements: async () => {
      if (!options.includeElements) return [];
      const out: (Paragraph | Table)[] = [heading(`${t('elements')} (${elements.length})`, 1)];
      const writeList = (list: Element[], tagLevel: 2 | 3) => {
        if (options.groupElementsByTag) {
          for (const [tag, tagElements] of Object.entries(input.groupByTags(list))) {
            out.push(heading(`${tag} (${tagElements.length})`, tagLevel), elementsTable(tagElements), gap());
          }
        } else if (list.length > 0) {
          out.push(elementsTable(list), gap());
        }
      };
      // The elements of the scope first, then those linked to them
      const { primary, linked } = input.splitPrimary(sorted);
      writeList(primary, 2);
      if (linked.length > 0) {
        out.push(heading(`${t('linkedElements')} (${linked.length})`, 2));
        writeList(linked, 3);
      }
      return out;
    },

    links: async () => {
      if (!options.includeLinks || links.length === 0) return [];
      const headers = [t('from'), t('to'), t('type'), t('label'), t('notes')];
      const weights = [2.5, 2.5, 0.8, 2, 4];
      if (options.includeFiles) { headers.push(t('files')); weights.push(2); }
      return [
        heading(`${t('links')} (${links.length})`, 1),
        table(headers, links.map((lk) => {
          const row: CellContent[] = [
            refCell(lk.fromId, label(lk.fromId)),
            refCell(lk.toId, label(lk.toId)),
            lk.directed ? '→' : '↔',
            lk.label || '-',
            lk.notes ? markdownParagraphs(lk.notes, TABLE_TEXT) : '-',
          ];
          if (options.includeFiles) row.push(ownerAssets(lk.assetIds).map((a) => a.filename).join(', ') || '-');
          return row;
        }), weights),
        gap(),
      ];
    },

    files: async () => {
      if (!options.includeFiles || totalFiles === 0) return [];
      const owners = [
        ...elements.map((el) => ({ caption: el.label, files: ownerAssets(el.assetIds) })),
        ...links.map((lk) => ({ caption: linkCaption(lk), files: ownerAssets(lk.assetIds) })),
      ];
      const rows: CellContent[][] = [];
      for (const owner of owners) {
        for (const a of owner.files) {
          // Picture files show their thumbnail
          rows.push([await thumbnailCell(a), owner.caption, a.filename, a.mimeType, sizeKB(a)]);
        }
      }
      return [
        heading(`${t('attachedFiles')} (${totalFiles})`, 1),
        table(['', t('attachedTo'), t('filename'), t('fileType'), t('size')], rows, [1.3, 2.5, 3, 2, 1.2]),
        gap(),
      ];
    },

    fiches: async () => {
      if (!options.includeFiches) return [];
      const withData = sorted.filter(hasFiche);
      if (withData.length === 0) return [];
      // The sheets of the scope first, then those of the linked elements
      const { primary, linked } = input.splitPrimary(withData);
      // No empty heading when only linked elements have a sheet
      const out: (Paragraph | Table)[] = primary.length > 0 ? [heading(`${t('detailedSheets')} (${primary.length})`, 1)] : [];
      for (const el of [...primary, ...linked]) {
        if (el === linked[0]) out.push(heading(`${t('linkedSheets')} (${linked.length})`, 1, options.fichePerPage && primary.length > 0));
        // With a sheet per page, each sheet but the first after a heading starts a page
        const headed = el === primary[0] || el === linked[0];
        // The sheet's title is the bookmark the names lead to
        out.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
          keepNext: true,
          pageBreakBefore: options.fichePerPage && !headed,
          children: [new Bookmark({ id: ficheAnchor(el.id), children: [new TextRun(wordText(el.label))] })],
        }));
        // Files first, with their thumbnails: they are what the reader looks at first
        const files = ownerAssets(el.assetIds);
        if (files.length > 0) out.push(await filesTable(files, `${t('files')} (${files.length})`), gap());
        const identity: CellContent[][] = [
          [t('tags'), el.tags.join(', ') || '-'],
          [input.evaluationTitle(), input.evaluationText(el)],
          [t('source'), el.source ? sourceRuns(el.source, TABLE_TEXT) : '-'],
        ];
        if (el.notes) identity.push([t('notes'), markdownParagraphs(el.notes, TABLE_TEXT)]);
        out.push(table([t('identity'), ''], identity, [1, 3]), gap());
        if (el.properties.length > 0) {
          out.push(table([`${t('properties')} (${el.properties.length})`, ''],
            el.properties.map((p) => [p.key, formatPropertyValue(p.value, p.type, locale, p.timeZone)]), [1, 3]), gap());
        }
        if (el.events.length > 0) {
          out.push(table([`${t('events')} (${el.events.length})`, ''], el.events.map((ev) => [
            formatEventWhen(ev, locale),
            [new Paragraph({ children: [
              run(ev.label, { bold: true, size: TABLE_TEXT }),
              run(`${ev.description ? ` - ${ev.description}` : ''}${ev.geo ? ` ${geoText(ev.geo)}` : ''}`, { size: TABLE_TEXT }),
            ] })],
          ]), [1, 3]), gap());
        }
        const connections = links.filter((l) => l.fromId === el.id || l.toId === el.id);
        if (connections.length > 0) {
          out.push(table([`${t('relations')} (${connections.length})`, ''], connections.map((l) => {
            const other = l.fromId === el.id ? l.toId : l.fromId;
            return [l.fromId === el.id ? '→' : '←', [new Paragraph({ children: [
              refRun(other, label(other), { size: TABLE_TEXT }),
              run(l.label ? ` (${l.label})` : '', { size: TABLE_TEXT }),
            ] })]];
          }), [1, 3]), gap());
        }
      }
      return out;
    },
  };

  const now = new Date();
  const body: (Paragraph | Table)[] = [
    new Paragraph({ text: wordText(input.title), heading: HeadingLevel.TITLE }),
    para([run(t('generatedOn', { date: now.toLocaleDateString(dateLocale(locale)), time: now.toLocaleTimeString(dateLocale(locale)) }), { italics: true, color: '6B6560', size: 18 })], { spacingAfter: 200 }),
  ];
  // Each part after the first on a new page when asked, as a Word section of its own
  const pages: (Paragraph | Table)[][] = [body];
  let written = 0;
  for (const section of normalizeSectionOrder(options.sectionOrder)) {
    const items = await parts[section]();
    if (items.length === 0) continue;
    if (options.pageBreaks && written > 0) pages.push(items);
    else pages[pages.length - 1].push(...items);
    written++;
  }

  const doc = new Document({
    title: wordText(input.title),
    creator: 'ZeroNeurone',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: pages.map((children, index) => ({
      properties: index > 0 ? { type: SectionType.NEXT_PAGE } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              run(`${t('generatedBy')} - `, { size: 16, color: '6B6560' }),
              new ExternalHyperlink({ link: ZERONEURONE_URL, children: [new TextRun({ text: ZERONEURONE_URL.replace('https://', ''), style: 'Hyperlink', size: 16 })] }),
            ],
          })],
        }),
      },
      children,
    })),
  });
  return Packer.toBlob(doc);
}
