import type { Confidence, Element, ElementId, EvaluationModel, Link, LinkId } from '../../types';
import { EVALUATION_GRIDS, isInModel } from '../../utils/evaluation';
import { dateEndInclusive, linkInterval, overlaps, toMinuteStart } from '../../utils/temporalUtils';

/**
 * Path search restricted to the links an analyst trusts or cares about:
 * by label or tag, by period, by confidence or grading, following link
 * direction or not. Pure module: no store, no graphology, testable alone.
 */

export interface ValueFilter {
  mode: 'include' | 'exclude';
  values: string[];
}

export interface PathConstraints {
  /** Link labels (trimmed, case-insensitive) */
  labels?: ValueFilter | null;
  /** Link tags: include keeps a link carrying one of them, exclude drops it */
  tags?: ValueFilter | null;
  /** Period the link dates must meet; undated links pass when keepUndated */
  period?: { start: Date | null; end: Date | null; keepUndated: boolean } | null;
  /** Minimum confidence (zeroneurone model) */
  minConfidence?: Confidence | null;
  /** Weakest codes still accepted on each axis (europol / admiralty models) */
  minEvaluation?: { source: string | null; info: string | null } | null;
  /** Links with no confidence / no grading pass the two thresholds above */
  keepUnrated?: boolean;
  /** forward / backward links walked one way only; none / both either way */
  respectDirection?: boolean;
}

export interface ConstrainedPath {
  path: ElementId[];
  /** linkIds[i]: the admitted links between path[i] and path[i + 1] */
  linkIds: LinkId[][];
  length: number;
}

export interface ConstrainedPathsResult {
  paths: ConstrainedPath[];
  /** No admitted path, but one exists when the constraints are dropped */
  blockedByConstraints: boolean;
}

/** Arcs u → v with the links carrying them */
export type Adjacency = Map<ElementId, Map<ElementId, LinkId[]>>;

const fold = (s: string) => s.trim().toLowerCase();

/**
 * Whether any constraint narrows the search (direction counts). With a model,
 * a threshold of the other kind (confidence vs grading) is inert and ignored.
 */
export function hasActiveConstraints(c: PathConstraints | null | undefined, model?: EvaluationModel): boolean {
  if (!c) return false;
  const confidenceApplies = model === undefined || model === 'zeroneurone';
  const gradingApplies = model === undefined || model !== 'zeroneurone';
  return (
    (!!c.labels && c.labels.values.length > 0) ||
    (!!c.tags && c.tags.values.length > 0) ||
    (!!c.period && (c.period.start !== null || c.period.end !== null)) ||
    (confidenceApplies && c.minConfidence !== null && c.minConfidence !== undefined) ||
    (gradingApplies && !!c.minEvaluation && (c.minEvaluation.source !== null || c.minEvaluation.info !== null)) ||
    !!c.respectDirection
  );
}

function passesValueFilter(values: string[], filter: ValueFilter | null | undefined): boolean {
  if (!filter || filter.values.length === 0) return true;
  const wanted = new Set(filter.values.map(fold));
  const hit = values.some((v) => wanted.has(fold(v)));
  return filter.mode === 'include' ? hit : !hit;
}

/**
 * Whether a code is at least as strong as the threshold in a grid axis. An
 * axis left ungraded passes only when ungraded links are kept.
 */
function atLeast(axis: readonly string[], code: string | null, threshold: string | null, keepUnrated: boolean): boolean {
  if (threshold === null) return true;
  if (code === null) return keepUnrated;
  const i = axis.indexOf(code);
  const t = axis.indexOf(threshold);
  return i !== -1 && t !== -1 && i <= t;
}

/** Whether a link may be walked under the constraints (direction aside) */
export function linkPasses(link: Link, c: PathConstraints, model: EvaluationModel): boolean {
  if (!passesValueFilter([link.label ?? ''], c.labels)) return false;
  if (!passesValueFilter(link.tags ?? [], c.tags)) return false;

  if (c.period && (c.period.start !== null || c.period.end !== null)) {
    const interval = linkInterval(link);
    if (interval === null) {
      if (!c.period.keepUndated) return false;
    } else {
      const window = {
        from: c.period.start !== null ? toMinuteStart(c.period.start).getTime() : -Infinity,
        until: c.period.end !== null ? dateEndInclusive(toMinuteStart(c.period.end)) : Infinity,
      };
      if (!overlaps(interval, window)) return false;
    }
  }

  const keepUnrated = !!c.keepUnrated;
  if (model === 'zeroneurone') {
    if (c.minConfidence !== null && c.minConfidence !== undefined) {
      if (link.confidence === null || link.confidence === undefined) {
        if (!keepUnrated) return false;
      } else if (link.confidence < c.minConfidence) {
        return false;
      }
    }
  } else if (c.minEvaluation && (c.minEvaluation.source !== null || c.minEvaluation.info !== null)) {
    const evaluation = link.evaluation;
    if (!evaluation || !isInModel(evaluation, model)) {
      if (!keepUnrated) return false;
    } else {
      const grid = EVALUATION_GRIDS[evaluation.scale];
      if (!atLeast(grid.sources, evaluation.source, c.minEvaluation.source, keepUnrated)) return false;
      if (!atLeast(grid.infos, evaluation.info, c.minEvaluation.info, keepUnrated)) return false;
    }
  }

  return true;
}

function addArc(adj: Adjacency, u: ElementId, v: ElementId, linkId: LinkId): void {
  let row = adj.get(u);
  if (!row) {
    row = new Map();
    adj.set(u, row);
  }
  const ids = row.get(v);
  if (ids) ids.push(linkId);
  else row.set(v, [linkId]);
}

/**
 * Simple adjacency of the admitted links, parallel links merged. Groups are
 * not graph nodes (as in insightsService.buildGraph); self-loops are dropped.
 */
export function buildFilteredAdjacency(
  elements: readonly Pick<Element, 'id' | 'isGroup'>[],
  links: readonly Link[],
  c: PathConstraints | null | undefined,
  model: EvaluationModel,
): Adjacency {
  const nodes = new Set<ElementId>();
  for (const el of elements) if (!el.isGroup) nodes.add(el.id);

  const adj: Adjacency = new Map();
  const constraints = c ?? {};
  for (const link of links) {
    if (link.fromId === link.toId) continue;
    if (!nodes.has(link.fromId) || !nodes.has(link.toId)) continue;
    if (!linkPasses(link, constraints, model)) continue;
    const direction = link.direction ?? (link.directed ? 'forward' : 'none');
    if (!constraints.respectDirection || direction === 'none' || direction === 'both') {
      addArc(adj, link.fromId, link.toId, link.id);
      addArc(adj, link.toId, link.fromId, link.id);
    } else if (direction === 'forward') {
      addArc(adj, link.fromId, link.toId, link.id);
    } else {
      addArc(adj, link.toId, link.fromId, link.id);
    }
  }
  return adj;
}

const arcKey = (u: ElementId, v: ElementId) => `${u}\u0000${v}`;
const pathKey = (p: ElementId[]) => p.join('\u0000');

/**
 * Steps from every node to `to`, walking arcs backwards. A lower bound of the
 * remaining distance whatever is blocked later: blocking only lengthens paths.
 */
function distancesTo(adj: Adjacency, to: ElementId, maxEdges: number): Map<ElementId, number> {
  const reverse = new Map<ElementId, ElementId[]>();
  for (const [u, row] of adj) {
    for (const v of row.keys()) {
      const preds = reverse.get(v);
      if (preds) preds.push(u);
      else reverse.set(v, [u]);
    }
  }
  const dist = new Map<ElementId, number>([[to, 0]]);
  const queue: ElementId[] = [to];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    const d = dist.get(v)!;
    if (d >= maxEdges) continue;
    for (const u of reverse.get(v) ?? []) {
      if (dist.has(u)) continue;
      dist.set(u, d + 1);
      queue.push(u);
    }
  }
  return dist;
}

/** Shortest path by BFS, avoiding some nodes and arcs, bounded in edges */
function bfs(
  adj: Adjacency,
  from: ElementId,
  to: ElementId,
  blockedNodes: ReadonlySet<ElementId>,
  blockedArcs: ReadonlySet<string>,
  maxEdges: number,
  /** Lower bound of the steps left to `to`: nodes that cannot make it in time are skipped */
  distTo?: ReadonlyMap<ElementId, number>,
): ElementId[] | null {
  if (from === to) return [from];
  if (maxEdges <= 0) return null;
  const parent = new Map<ElementId, ElementId>();
  const depth = new Map<ElementId, number>([[from, 0]]);
  const queue: ElementId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    const d = depth.get(u)!;
    if (d >= maxEdges) continue;
    const row = adj.get(u);
    if (!row) continue;
    for (const v of row.keys()) {
      if (depth.has(v) || blockedNodes.has(v) || blockedArcs.has(arcKey(u, v))) continue;
      if (distTo) {
        const left = distTo.get(v);
        if (left === undefined || d + 1 + left > maxEdges) continue;
      }
      depth.set(v, d + 1);
      parent.set(v, u);
      if (v === to) {
        const path = [to];
        let cur = to;
        while (cur !== from) {
          cur = parent.get(cur)!;
          path.push(cur);
        }
        return path.reverse();
      }
      queue.push(v);
    }
  }
  return null;
}

/**
 * The k shortest loopless paths (Yen's algorithm), shortest first, each at
 * most `maxDepth` edges long. Unweighted: the length is the number of steps.
 */
export function kShortestPaths(
  adj: Adjacency,
  from: ElementId,
  to: ElementId,
  k: number,
  maxDepth: number,
): ElementId[][] {
  if (from === to || k <= 0 || !adj.has(from)) return [];
  const distTo = distancesTo(adj, to, maxDepth);
  if (!distTo.has(from)) return [];
  const first = bfs(adj, from, to, new Set(), new Set(), maxDepth, distTo);
  if (!first) return [];

  const accepted: ElementId[][] = [first];
  const seen = new Set<string>([pathKey(first)]);
  const candidates: ElementId[][] = [];

  while (accepted.length < k) {
    const prev = accepted[accepted.length - 1];
    for (let i = 0; i < prev.length - 1; i++) {
      const spur = prev[i];
      const root = prev.slice(0, i + 1);
      const rootKey = pathKey(root);

      const blockedArcs = new Set<string>();
      for (const p of accepted) {
        if (p.length > i + 1 && pathKey(p.slice(0, i + 1)) === rootKey) {
          blockedArcs.add(arcKey(p[i], p[i + 1]));
        }
      }
      const blockedNodes = new Set<ElementId>(root.slice(0, -1));

      const spurPath = bfs(adj, spur, to, blockedNodes, blockedArcs, maxDepth - i, distTo);
      if (!spurPath) continue;
      const total = [...root.slice(0, -1), ...spurPath];
      const key = pathKey(total);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(total);
    }
    if (candidates.length === 0) break;
    // Shortest candidate first; ties keep discovery order (stable sort).
    candidates.sort((a, b) => a.length - b.length);
    accepted.push(candidates.shift()!);
  }
  return accepted;
}

/** k shortest paths through admitted links, with the links of each step */
export function findConstrainedPaths(
  elements: readonly Pick<Element, 'id' | 'isGroup'>[],
  links: readonly Link[],
  from: ElementId,
  to: ElementId,
  options: { k: number; maxDepth: number; constraints?: PathConstraints | null; model: EvaluationModel },
): ConstrainedPathsResult {
  const { k, maxDepth, constraints, model } = options;
  const adj = buildFilteredAdjacency(elements, links, constraints, model);
  const raw = kShortestPaths(adj, from, to, k, maxDepth);
  const paths = raw.map((path) => ({
    path,
    linkIds: path.slice(0, -1).map((u, i) => adj.get(u)?.get(path[i + 1]) ?? []),
    length: path.length - 1,
  }));

  let blockedByConstraints = false;
  if (paths.length === 0 && from !== to && hasActiveConstraints(constraints, model)) {
    const free = buildFilteredAdjacency(elements, links, null, model);
    blockedByConstraints = kShortestPaths(free, from, to, 1, maxDepth).length > 0;
  }
  return { paths, blockedByConstraints };
}
