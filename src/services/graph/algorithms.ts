import type Graph from 'graphology';

/**
 * Graph algorithms shared by the worker and the main-thread service.
 *
 * They lived only in the worker, while `insightsService` kept naive versions
 * of the same computations. On a 5 000-element dossier the naive articulation
 * points took 52 s against 5 ms here — the same work, four orders of magnitude
 * apart. One implementation, used by both, removes that gap for good.
 */

/**
 * Articulation points: nodes whose removal splits the graph into more
 * connected components. Tarjan's algorithm, a single DFS, O(V + E).
 *
 * The naive alternative — remove each node, recount components — is
 * O(V · (V + E)) and copies the whole graph V times.
 */
export function findArticulationPoints(graph: Graph): string[] {
  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationPoints = new Set<string>();
  let timer = 0;

  // Iterative: a recursive DFS overflows the stack on long chains, which a
  // timeline or a genealogy import produces naturally.
  function dfs(root: string) {
    const stack: { node: string; neighbors: string[]; index: number; children: number }[] = [];

    visited.add(root);
    disc.set(root, timer);
    low.set(root, timer);
    timer++;
    stack.push({ node: root, neighbors: graph.neighbors(root), index: 0, children: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const u = frame.node;

      if (frame.index < frame.neighbors.length) {
        const v = frame.neighbors[frame.index];
        frame.index++;

        if (!visited.has(v)) {
          frame.children++;
          parent.set(v, u);
          visited.add(v);
          disc.set(v, timer);
          low.set(v, timer);
          timer++;
          stack.push({ node: v, neighbors: graph.neighbors(v), index: 0, children: 0 });
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
        continue;
      }

      // All neighbours explored: fold this frame into its parent.
      stack.pop();
      const p = parent.get(u) ?? null;
      if (p !== null) {
        low.set(p, Math.min(low.get(p)!, low.get(u)!));
        // A non-root parent is an articulation point when a child's subtree
        // cannot reach above it.
        if (low.get(u)! >= disc.get(p)! && parent.get(p) !== null) {
          articulationPoints.add(p);
        }
        // The DFS root is one when it has more than one child subtree.
        if (parent.get(p) === null) {
          const parentFrame = stack[stack.length - 1];
          if (parentFrame && parentFrame.children > 1) articulationPoints.add(p);
        }
      }
    }
  }

  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  });

  return Array.from(articulationPoints);
}
