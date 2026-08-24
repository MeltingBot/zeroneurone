// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Dossier, Element, Link, Report } from '../types';

// The export pulls in fileService for asset thumbnails; no assets are used here.
vi.mock('./fileService', () => ({
  fileService: { getFileBlob: vi.fn().mockResolvedValue(null) },
}));

vi.mock('i18next', () => ({
  default: { t: (key: string) => key, language: 'en' },
}));

let exportInteractiveReport: typeof import('./exportInteractiveReportService').exportInteractiveReport;

beforeAll(async () => {
  ({ exportInteractiveReport } = await import('./exportInteractiveReportService'));
});

// Payloads an attacker could plant via an imported file or a collaboration peer.
const SCRIPT_BREAKOUT = '</script><img src=x onerror=alert(1)>';
const ATTR_BREAKOUT = 'x"/><img src=y onerror=alert(2)>';

function makeElement(over: Partial<Element> = {}): Element {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dossierId: 'd1',
    label: 'Target',
    notes: '',
    tags: [],
    properties: [],
    confidence: null,
    source: '',
    date: null,
    dateRange: null,
    events: [],
    geo: null,
    position: { x: 0, y: 0 },
    isPositionLocked: false,
    assetIds: [],
    visual: { color: '#93c5fd', borderColor: '#6b7280', shape: 'rectangle' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as Element;
}

function makeReport(content: string, title = 'Report'): Report {
  return {
    id: 'r1',
    dossierId: 'd1',
    title,
    sections: [{ id: 's1', title: 'Section', order: 0, content, elementIds: [], graphSnapshot: null }],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as Report;
}

const DOSSIER = {
  id: 'd1',
  name: 'Case',
  description: '',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as Dossier;

async function exportHtml(report: Report, elements: Element[], links: Link[] = []) {
  const blob = await exportInteractiveReport(DOSSIER, report, elements, links, []);
  return blob.text();
}

/**
 * Parse the exported document and report anything the browser would treat as
 * executable. Substring matching is not enough here: an escaped payload is
 * inert but still contains the attacker's text.
 */
function findExecutableContent(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const eventHandlers: string[] = [];
  const unsafeHrefs: string[] = [];
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) eventHandlers.push(`${el.tagName}.${attr.name}`);
      if (
        (attr.name === 'href' || attr.name === 'src') &&
        /^\s*(javascript|data|vbscript):/i.test(attr.value)
      ) {
        unsafeHrefs.push(`${el.tagName}.${attr.name}=${attr.value.slice(0, 40)}`);
      }
    }
  }

  // The export emits exactly one runtime script. A </script> breakout would
  // terminate it early and leave a second one behind.
  const scriptCount = doc.querySelectorAll('script').length;

  return { eventHandlers, unsafeHrefs, scriptCount };
}

const EXPECTED_SCRIPT_COUNT = 1;

async function expectInert(report: Report, elements: Element[]) {
  const html = await exportHtml(report, elements);
  const { eventHandlers, unsafeHrefs, scriptCount } = findExecutableContent(html);
  expect(eventHandlers).toEqual([]);
  expect(unsafeHrefs).toEqual([]);
  expect(scriptCount).toBe(EXPECTED_SCRIPT_COUNT);
  return html;
}

describe('exportInteractiveReport — untrusted content cannot execute', () => {
  it('neutralises a </script> breakout in report content', async () => {
    const html = await expectInert(makeReport(SCRIPT_BREAKOUT), [makeElement()]);
    // The payload survives as text, which is what makes it harmless.
    expect(html).toContain('&lt;/script&gt;');
  });

  it('neutralises a breakout in the report and section titles', async () => {
    await expectInert(makeReport('body text', SCRIPT_BREAKOUT), [makeElement()]);
  });

  it('drops javascript: URLs from markdown links', async () => {
    const html = await expectInert(
      makeReport('[click me](javascript:alert(1))'),
      [makeElement()]
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('click me');
  });

  it('rejects a markdown link URL carrying an attribute payload', async () => {
    const html = await expectInert(
      makeReport(`[click](https://example.com" onmouseover="alert(1))`),
      [makeElement()]
    );
    // Rejected outright: no anchor is produced, the link degrades to plain text.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('#report-panel a'));
    expect(anchors).toEqual([]);
  });

  it('strips event handlers and script tags from element notes', async () => {
    await expectInert(
      makeReport('body'),
      [makeElement({ notes: '<img src=x onerror=alert(3)><script>alert(4)</script>' })]
    );
  });

  it('falls back on a colour that would break out of an SVG attribute', async () => {
    const html = await expectInert(
      makeReport('body'),
      [makeElement({
        visual: { color: ATTR_BREAKOUT, borderColor: ATTR_BREAKOUT, shape: 'rectangle' },
      } as Partial<Element>)]
    );
    expect(html).not.toContain(ATTR_BREAKOUT);
  });

  it('keeps the embedded JSON parseable and free of script terminators', async () => {
    const html = await exportHtml(makeReport(SCRIPT_BREAKOUT), [makeElement()]);
    const match = html.match(/var reportMarkdown=(".*?");\n/s);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('</script>');
    // Still valid JSON, so the export button keeps working.
    expect(JSON.parse(match![1])).toContain(SCRIPT_BREAKOUT);
  });

  it('still renders legitimate content and formatting', async () => {
    const html = await exportHtml(
      makeReport('Some **bold** text and a [link](https://example.com).'),
      [makeElement({ label: 'Alice' })]
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('Alice');
  });
});

describe('exportInteractiveReport — report rendering', () => {
  async function reportPanel(content: string) {
    const html = await exportHtml(makeReport(content), [makeElement()]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector('#report-panel')!;
  }

  it('keeps block elements out of paragraphs', async () => {
    const panel = await reportPanel(
      'Opening paragraph.\n\n## A heading\n\n- item one\n- item two\n\nClosing paragraph.\n\n---\n\nAfter the rule.'
    );

    // A <p> wrapping a list or a rule would be hoisted by the browser and leave
    // an empty paragraph behind, shifting the layout.
    expect(panel.querySelectorAll('p > ul')).toHaveLength(0);
    expect(panel.querySelectorAll('p > hr')).toHaveLength(0);
    const empty = Array.from(panel.querySelectorAll('p')).filter(
      (p) => p.textContent?.trim() === ''
    );
    expect(empty).toHaveLength(0);
  });

  it('renders paragraphs, headings and lists', async () => {
    const panel = await reportPanel('Opening paragraph.\n\n## A heading\n\n- item one\n- item two');

    expect(panel.querySelector('h2:not([id])')?.textContent).toBe('A heading');
    expect(panel.querySelectorAll('ul li')).toHaveLength(2);
    const paragraphs = Array.from(panel.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs).toContain('Opening paragraph.');
  });

  it('turns element references into navigable anchors', async () => {
    // parseElementReferences runs after sanitisation, so this ordering is
    // load-bearing: sanitising afterwards would strip data-element-id.
    const id = '11111111-1111-4111-8111-111111111111';
    const panel = await reportPanel(`See [[Alice|${id}]] for details.`);

    const anchor = panel.querySelector('a.element-ref');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('data-element-id')).toBe(id);
    expect(anchor!.textContent).toBe('Alice');
  });
});
