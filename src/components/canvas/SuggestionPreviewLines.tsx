import { ViewportPortal, useInternalNode } from '@xyflow/react';
import { useSuggestionsStore } from '../../stores';

/** Point where the segment from the centre of a box towards `to` leaves the box */
function borderPoint(cx: number, cy: number, halfW: number, halfH: number, toX: number, toY: number) {
  const dx = toX - cx;
  const dy = toY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(dx ? halfW / Math.abs(dx) : Infinity, dy ? halfH / Math.abs(dy) : Infinity, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

function PreviewLine({ fromId, toId }: { fromId: string; toId: string }) {
  const from = useInternalNode(fromId);
  const to = useInternalNode(toId);
  // An end not on this canvas (other tab, hidden): nothing to draw
  if (!from || !to) return null;

  const box = (n: NonNullable<typeof from>) => {
    const w = n.measured.width ?? 0;
    const h = n.measured.height ?? 0;
    const { x, y } = n.internals.positionAbsolute;
    return { cx: x + w / 2, cy: y + h / 2, halfW: w / 2, halfH: h / 2 };
  };
  const a = box(from);
  const b = box(to);
  const start = borderPoint(a.cx, a.cy, a.halfW, a.halfH, b.cx, b.cy);
  const end = borderPoint(b.cx, b.cy, b.halfW, b.halfH, a.cx, a.cy);
  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="suggestion-preview-line" />;
}

/**
 * Links the checked suggestions would draw, dashed and moving, in a layer of
 * their own: not edges of the dossier, nothing to click or select, gone once
 * the suggestion is unchecked, accepted or dismissed.
 */
export function SuggestionPreviewLines() {
  const pairs = useSuggestionsStore((s) => s.previewPairs);
  if (pairs.length === 0) return null;
  return (
    <ViewportPortal>
      <svg
        className="absolute left-0 top-0 overflow-visible pointer-events-none"
        width={1}
        height={1}
        style={{ zIndex: 1000 }}
        data-testid="suggestion-preview-lines"
      >
        {pairs.map((p) => <PreviewLine key={p.id} fromId={p.fromId} toId={p.toId} />)}
      </svg>
    </ViewportPortal>
  );
}
