/**
 * The synthesis template: the options the user saved, taken again each time
 * the synthesis window opens, in every dossier. The title, the scope and the
 * order of the parts (kept on its own) are not part of it.
 */
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from '../../services/reportService';
import type { CaptureView } from './synthesisCapture';

const TEMPLATE_KEY = 'zn:synthesis:template';

/** Options a template holds */
export type TemplateOptions = Omit<ReportOptions, 'title' | 'sectionOrder' | 'primaryElementIds' | 'canvasScreenshot' | 'mapSvg' | 'timelineSvg'>;

export interface SynthesisTemplate {
  options: TemplateOptions;
  captures: Record<CaptureView, boolean>;
}

const SORTS: readonly ReportOptions['sortElementsBy'][] = ['label', 'date', 'confidence'];
const CAPTURE_VIEWS: readonly CaptureView[] = ['canvas', 'map', 'timeline'];

/** Default options of a template */
export function defaultTemplate(): SynthesisTemplate {
  const { title: _t, sectionOrder: _o, ...options } = DEFAULT_REPORT_OPTIONS;
  return { options, captures: { canvas: false, map: false, timeline: false } };
}

/**
 * Read a stored template, keeping only the known options with a valid value:
 * an option added later takes its default, one removed is dropped.
 */
export function parseTemplate(raw: unknown): SynthesisTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = raw as { options?: Record<string, unknown>; captures?: Record<string, unknown> };
  const template = defaultTemplate();
  const options = template.options as unknown as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    const value = stored.options?.[key];
    if (key === 'sortElementsBy') {
      if (SORTS.includes(value as ReportOptions['sortElementsBy'])) options[key] = value;
    } else if (typeof value === typeof options[key]) {
      options[key] = value;
    }
  }
  for (const view of CAPTURE_VIEWS) {
    if (typeof stored.captures?.[view] === 'boolean') template.captures[view] = stored.captures[view] as boolean;
  }
  return template;
}

export function loadTemplate(): SynthesisTemplate | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? parseTemplate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Save the template; false when the storage refuses it */
export function saveTemplate(options: ReportOptions, captures: Record<CaptureView, boolean>): boolean {
  const template = parseTemplate({ options, captures });
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
    return true;
  } catch {
    return false;
  }
}

export function clearTemplate(): void {
  try {
    localStorage.removeItem(TEMPLATE_KEY);
  } catch {
    // Storage disabled: nothing was kept
  }
}
