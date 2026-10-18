/** Potential causal connections between dated events of linked elements (timeline overlay). */

export interface CausalityInput {
  /** Element the event belongs to */
  sourceId?: string;
  start: Date;
  end?: Date | null;
}

export interface CausalConnection<T> {
  fromItem: T;
  toItem: T;
}

/**
 * Each event gets at most one incoming connection per linked element: from that element's latest
 * event ending before it, within `maxDays`. Older events of the same element would only repeat the
 * chain, read step by step through the nearer ones. Simultaneous events are not connected.
 */
export function computeCausalConnections<T extends CausalityInput>(
  items: T[],
  links: ReadonlyArray<{ fromId: string; toId: string }>,
  maxDays: number
): CausalConnection<T>[] {
  // Linked elements of each element
  const neighbours = new Map<string, Set<string>>();
  const addNeighbour = (a: string, b: string) => {
    let set = neighbours.get(a);
    if (!set) { set = new Set(); neighbours.set(a, set); }
    set.add(b);
  };
  for (const link of links) {
    if (link.fromId === link.toId) continue;
    addNeighbour(link.fromId, link.toId);
    addNeighbour(link.toId, link.fromId);
  }

  // Events of each linked element
  const itemsByElement = new Map<string, T[]>();
  for (const item of items) {
    if (!item.sourceId || !neighbours.has(item.sourceId)) continue;
    const list = itemsByElement.get(item.sourceId);
    if (list) list.push(item);
    else itemsByElement.set(item.sourceId, [item]);
  }

  const maxGap = maxDays * 24 * 60 * 60 * 1000;
  const connections: CausalConnection<T>[] = [];
  for (const target of items) {
    if (!target.sourceId) continue;
    const targetStart = target.start.getTime();
    for (const elementId of neighbours.get(target.sourceId) ?? []) {
      let nearest: T | null = null;
      let nearestEnd = -Infinity;
      for (const candidate of itemsByElement.get(elementId) ?? []) {
        const candidateEnd = (candidate.end || candidate.start).getTime();
        // Ends before the target starts (strictly: simultaneous events are not causal)
        if (candidateEnd >= targetStart || targetStart - candidateEnd > maxGap) continue;
        if (candidateEnd > nearestEnd) {
          nearest = candidate;
          nearestEnd = candidateEnd;
        }
      }
      if (nearest) connections.push({ fromItem: nearest, toItem: target });
    }
  }
  return connections;
}
