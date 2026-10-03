import type {
  Dossier,
  Element,
  Evaluation,
  EvaluationModel,
  EvaluationScale,
  Link,
} from '../types';

/**
 * Grading grids of the two-axis evaluation models. Codes are listed from the
 * strongest to the weakest, the "cannot be assessed" code last: the order is
 * used for sorting. Labels live in i18n under `common:evaluation.<scale>`.
 */
export interface EvaluationGrid {
  sources: readonly string[];
  infos: readonly string[];
  /** Source codes kept by the "reliable sources only" quick filter */
  reliableSources: readonly string[];
}

export const EVALUATION_GRIDS: Record<EvaluationScale, EvaluationGrid> = {
  // Regulation (EU) 2016/794, art. 29
  europol: {
    sources: ['A', 'B', 'C', 'X'],
    infos: ['1', '2', '3', '4'],
    reliableSources: ['A', 'B'],
  },
  // NATO Admiralty code
  admiralty: {
    sources: ['A', 'B', 'C', 'D', 'E', 'F'],
    infos: ['1', '2', '3', '4', '5', '6'],
    reliableSources: ['A', 'B', 'C'],
  },
};

export const EVALUATION_MODELS: readonly EvaluationModel[] = ['zeroneurone', 'europol', 'admiralty'];

export function isEvaluationModel(value: unknown): value is EvaluationModel {
  return typeof value === 'string' && (EVALUATION_MODELS as readonly string[]).includes(value);
}

/** Evaluation model of a dossier, 'zeroneurone' when unset or unknown */
export function getEvaluationModel(dossier: Pick<Dossier, 'evaluationModel'> | null | undefined): EvaluationModel {
  const model = dossier?.evaluationModel;
  return isEvaluationModel(model) ? model : 'zeroneurone';
}

/** The grading scale of a model, null for the confidence model */
export function getModelScale(model: EvaluationModel): EvaluationScale | null {
  return model === 'zeroneurone' ? null : model;
}

/**
 * Normalize untrusted data (Y.Doc, import files) into a valid evaluation.
 * Unknown codes are dropped; an evaluation with neither axis becomes null.
 */
export function sanitizeEvaluation(raw: unknown): Evaluation | null {
  if (!raw || typeof raw !== 'object') return null;
  const { scale, source, info } = raw as Record<string, unknown>;
  if (scale !== 'europol' && scale !== 'admiralty') return null;
  const grid = EVALUATION_GRIDS[scale];
  const src = typeof source === 'string' ? source.trim().toUpperCase() : null;
  const inf = typeof info === 'string' || typeof info === 'number' ? String(info).trim() : null;
  const evaluation: Evaluation = {
    scale,
    source: src && grid.sources.includes(src) ? src : null,
    info: inf && grid.infos.includes(inf) ? inf : null,
  };
  return evaluation.source === null && evaluation.info === null ? null : evaluation;
}

/** "B2", "B-" or "-2"; empty string when there is no evaluation */
export function formatEvaluation(evaluation: Evaluation | null | undefined): string {
  if (!evaluation || (evaluation.source === null && evaluation.info === null)) return '';
  return `${evaluation.source ?? '-'}${evaluation.info ?? '-'}`;
}

/** True when the evaluation was given in the scale of the active model */
export function isInModel(evaluation: Evaluation | null | undefined, model: EvaluationModel): boolean {
  return !!evaluation && evaluation.scale === model;
}

/**
 * Sort key of an evaluation within the active model: lower is stronger,
 * Infinity for missing or out-of-model evaluations (sorted last).
 */
export function evaluationSortKey(evaluation: Evaluation | null | undefined, model: EvaluationModel): number {
  if (!evaluation || !isInModel(evaluation, model)) return Infinity;
  const grid = EVALUATION_GRIDS[evaluation.scale];
  const s = evaluation.source ? grid.sources.indexOf(evaluation.source) : grid.sources.length;
  const i = evaluation.info ? grid.infos.indexOf(evaluation.info) : grid.infos.length;
  return s * 10 + i;
}

/**
 * Numeric value growing with the strength of the grading, aligned with the
 * confidence scale semantics (higher = stronger, missing = lowest). Finite,
 * so it is safe to subtract in sort comparators.
 */
export function evaluationStrength(evaluation: Evaluation | null | undefined, model: EvaluationModel): number {
  const key = evaluationSortKey(evaluation, model);
  return key === Infinity ? -1000 : -key;
}

/** Number of graded elements and links whose scale differs from the given model */
export function countEvaluationsOutsideModel(
  items: ReadonlyArray<Pick<Element | Link, 'evaluation'>>,
  model: EvaluationModel,
): number {
  let count = 0;
  for (const item of items) {
    if (item.evaluation && item.evaluation.scale !== model) count++;
  }
  return count;
}

/**
 * Whether an item passes the evaluation filters of a view. The filters only
 * apply to grading models; out-of-model or missing evaluations fail them.
 */
export function matchesEvaluationFilters(
  evaluation: Evaluation | null | undefined,
  model: EvaluationModel,
  sources: readonly string[] | null | undefined,
  infos: readonly string[] | null | undefined,
): boolean {
  if (model === 'zeroneurone') return true;
  const hasSourceFilter = !!sources && sources.length > 0;
  const hasInfoFilter = !!infos && infos.length > 0;
  if (!hasSourceFilter && !hasInfoFilter) return true;
  if (!evaluation || !isInModel(evaluation, model)) return false;
  if (hasSourceFilter && (evaluation.source === null || !sources!.includes(evaluation.source))) return false;
  if (hasInfoFilter && (evaluation.info === null || !infos!.includes(evaluation.info))) return false;
  return true;
}

export interface EvaluationBadge {
  text: string;
  /** Grading made in another scale than the active model */
  muted: boolean;
}

/**
 * Canvas badge for an item: its confidence in the ZeroNeurone model, its
 * grading in the other models (muted when graded in another scale).
 */
export function getEvaluationBadge(
  confidence: number | null | undefined,
  evaluation: Evaluation | null | undefined,
  model: EvaluationModel,
): EvaluationBadge | null {
  if (model === 'zeroneurone') {
    return confidence != null ? { text: `${confidence}%`, muted: false } : null;
  }
  const text = formatEvaluation(evaluation);
  return text ? { text, muted: !isInModel(evaluation, model) } : null;
}
