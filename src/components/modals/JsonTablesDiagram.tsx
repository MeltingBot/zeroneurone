import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { diagramColumns, type DiagramTable } from '../../utils/jsonDiagramLayout';

export type { DiagramTable };


interface JsonTablesDiagramProps {
  tables: DiagramTable[];
  activeKey: string;
  onOpen: (key: string) => void;
  /** Point `field` of `table` into `target` (null: no longer a reference) */
  onSetRef: (table: string, field: string, target: string | null) => void;
}

interface Arrow { id: string; d: string; table: string; field: string; label: string }

/**
 * The checked tables and the references between them, editable by hand: drag
 * from a field's dot onto a table to point it there, click an arrow to remove
 * the reference, "+" to turn another field into a reference.
 */
export function JsonTablesDiagram({ tables, activeKey, onOpen, onSetRef }: JsonTablesDiagramProps) {
  const { t } = useTranslation('modals');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [drag, setDrag] = useState<{ table: string; field: string; x1: number; y1: number; x2: number; y2: number } | null>(null);

  const rel = useCallback((r: DOMRect) => {
    const w = wrapRef.current!.getBoundingClientRect();
    return { x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height };
  }, []);

  // Arrows follow the boxes: recomputed when the tables change or the boxes reflow
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const next: Arrow[] = [];
    // Arrows into the same table land at different heights of its left edge
    const incoming = new Map<string, number>();
    const landed = new Map<string, number>();
    for (const table of tables) {
      for (const ref of table.refs) if (ref.target !== table.key) incoming.set(ref.target, (incoming.get(ref.target) ?? 0) + 1);
    }
    for (const table of tables) {
      for (const ref of table.refs) {
        const dot = wrap.querySelector<HTMLElement>(`[data-dot="${CSS.escape(table.key)}|${CSS.escape(ref.field)}"]`);
        const box = wrap.querySelector<HTMLElement>(`[data-box="${CSS.escape(ref.target)}"]`);
        if (!dot || !box) continue;
        const a = rel(dot.getBoundingClientRect());
        const b = rel(box.getBoundingClientRect());
        const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2;
        let d: string;
        if (ref.target === table.key) {
          // Reference inside the table: a loop on its right edge
          const right = b.x + b.w;
          d = `M ${x1} ${y1} C ${right + 40} ${y1}, ${right + 40} ${b.y + 12}, ${right} ${b.y + 12}`;
        } else {
          const n = incoming.get(ref.target) ?? 1;
          const i = landed.get(ref.target) ?? 0;
          landed.set(ref.target, i + 1);
          // Spread over the upper part of the left edge, header first
          const span = Math.min(b.h - 16, 14 * (n - 1));
          const y2 = b.y + 12 + (n > 1 ? (span * i) / (n - 1) : 0);
          if (b.x > x1) {
            // Usual case: the target sits in a column to the right
            const x2 = b.x;
            const bend = Math.max(24, (x2 - x1) / 2);
            d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
          } else {
            // Cycle back to the left: around the right of both boxes
            const x2 = b.x + b.w;
            const out = Math.max(x1, x2) + 40;
            d = `M ${x1} ${y1} C ${out} ${y1}, ${out} ${y2}, ${x2} ${y2}`;
          }
        }
        next.push({ id: `${table.key}|${ref.field}`, d, table: table.key, field: ref.field, label: ref.field });
      }
    }
    setArrows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [tables, rel]);

  useLayoutEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(wrap);
    wrap.querySelectorAll('[data-box]').forEach((box) => observer.observe(box));
    return () => observer.disconnect();
  }, [measure]);

  const columns = useMemo(() => diagramColumns(tables), [tables]);

  const startDrag = (e: React.PointerEvent, table: string, field: string) => {
    e.preventDefault();
    const a = rel((e.currentTarget as HTMLElement).getBoundingClientRect());
    const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2;
    setDrag({ table, field, x1, y1, x2: x1, y2: y1 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const w = wrapRef.current!.getBoundingClientRect();
    setDrag({ ...drag, x2: e.clientX - w.left, y2: e.clientY - w.top });
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const box = document.elementsFromPoint(e.clientX, e.clientY)
      .map((el) => (el as HTMLElement).closest?.('[data-box]') as HTMLElement | null)
      .find(Boolean);
    const target = box?.dataset.box;
    if (target) onSetRef(drag.table, drag.field, target);
    setDrag(null);
  };

  return (
    <div className="rounded border border-border-default bg-bg-secondary overflow-x-auto" data-testid="json-tables-diagram">
    <div
      ref={wrapRef}
      className="relative w-max min-w-full p-3 pr-12"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
    >
      {/* Arrows under the boxes: one passing behind a box never hides its fields */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <defs>
          <marker id="json-diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-secondary)" />
          </marker>
        </defs>
        {arrows.map((a) => (
          <g key={a.id} className="pointer-events-auto cursor-pointer" onClick={() => onSetRef(a.table, a.field, null)}>
            <title>{t('importJsonMapping.diagram.removeHint', { field: a.label })}</title>
            {/* Wide invisible stroke: an easy target for the click */}
            <path d={a.d} fill="none" stroke="transparent" strokeWidth={12} />
            <path d={a.d} fill="none" stroke="var(--color-text-secondary)" strokeWidth={1.5} markerEnd="url(#json-diagram-arrow)" className="hover:stroke-[var(--color-error)]" />
          </g>
        ))}
      </svg>
      <div className="flex items-start gap-x-20">
        {columns.map((column, c) => (
        <div key={c} className="flex flex-col gap-y-4">
        {column.map((table) => (
          <div
            key={table.key}
            data-box={table.key}
            className={`relative z-10 min-w-36 rounded border bg-bg-primary text-xs ${table.key === activeKey ? 'border-accent' : 'border-border-default'} ${drag && drag.table !== table.key ? 'ring-1 ring-accent/30' : ''}`}
          >
            <button
              onClick={() => onOpen(table.key)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1 border-b border-border-default font-medium text-text-primary hover:bg-bg-secondary"
            >
              <span className="truncate">{table.name}</span>
              <span className="text-text-tertiary font-normal">{table.count}</span>
            </button>
            <div className="py-1">
              <div className="flex items-center gap-1.5 px-2 py-0.5 text-text-secondary" title={t('importJsonMapping.diagram.id')}>
                <KeyRound size={11} className="text-text-tertiary" />
                <span className="font-mono truncate">{table.idField ?? t('importJsonMapping.diagram.noId')}</span>
              </div>
              {table.refs.map((ref) => (
                <div key={ref.field} className="relative flex items-center gap-1.5 px-2 py-0.5 text-text-primary">
                  <span className="font-mono truncate">{ref.field}</span>
                  <span
                    className={`ml-auto text-[10px] tabular-nums ${ref.matched < 0.5 ? 'text-warning' : 'text-text-tertiary'}`}
                    title={t('importJsonMapping.diagram.matchedHint')}
                  >
                    {Math.round(ref.matched * 100)} %
                  </span>
                  <span
                    data-dot={`${table.key}|${ref.field}`}
                    onPointerDown={(e) => startDrag(e, table.key, ref.field)}
                    title={t('importJsonMapping.diagram.dragHint')}
                    className="w-2.5 h-2.5 rounded-full bg-accent cursor-crosshair shrink-0"
                  />
                </div>
              ))}
              {table.candidates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) onSetRef(table.key, e.target.value, table.key); }}
                  aria-label={t('importJsonMapping.diagram.addRef')}
                  className="mx-2 mt-1 mb-0.5 max-w-[calc(100%-1rem)] px-1 py-0.5 text-[11px] bg-bg-primary border border-dashed border-border-default rounded text-text-tertiary focus:outline-none focus:border-accent"
                >
                  <option value="">+ {t('importJsonMapping.diagram.addRef')}</option>
                  {table.candidates.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
            </div>
          </div>
        ))}
        </div>
        ))}
      </div>

      {/* The drag line stays above the boxes */}
      <svg className="absolute inset-0 z-20 w-full h-full pointer-events-none overflow-visible">
        {drag && (
          <path
            d={`M ${drag.x1} ${drag.y1} L ${drag.x2} ${drag.y2}`}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd="url(#json-diagram-arrow)"
          />
        )}
      </svg>
    </div>
      <p className="px-3 pb-2 text-[10px] text-text-tertiary">{t('importJsonMapping.diagram.hint')}</p>
    </div>
  );
}
