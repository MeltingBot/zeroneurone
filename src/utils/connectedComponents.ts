import type Graph from 'graphology';

/** Groups of nodes linked to each other (links read in both directions) */
export function connectedComponents(graph: Graph): string[][] {
  const seen = new Set<string>();
  const components: string[][] = [];
  graph.forEachNode((start) => {
    if (seen.has(start)) return;
    seen.add(start);
    const component = [start];
    for (let i = 0; i < component.length; i++) {
      graph.forEachNeighbor(component[i], (next) => {
        if (!seen.has(next)) {
          seen.add(next);
          component.push(next);
        }
      });
    }
    components.push(component);
  });
  return components;
}
