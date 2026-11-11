/**
 * React Flow rendering of a neighbourhood layout (NeighborhoodGraph.tsx).
 * Read only: no dragging, connecting or selecting; pinch to zoom, drag to pan,
 * tap a neighbour to open it. Its own chunk, loaded when a graph is shown.
 */

import { useMemo } from 'react';
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Layout, PlacedNode } from './neighborhoodLayout';

type PillData = { node: PlacedNode };

function Pill({ data }: NodeProps<Node<PillData>>) {
  const { node } = data;
  const center = node.ring === 0;
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded sketchy-border bg-bg-primary whitespace-nowrap ${
        center ? 'border-2 border-accent text-sm font-semibold' : 'border border-border-strong text-xs'
      } ${node.ring === 2 ? 'text-text-secondary' : 'text-text-primary'}`}
    >
      {/* Hidden handles: edges attach to the node centre */}
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-px !h-px !min-w-0 !min-h-0 !border-0 !top-1/2 !left-1/2" />
      <Handle type="source" position={Position.Top} className="!opacity-0 !w-px !h-px !min-w-0 !min-h-0 !border-0 !top-1/2 !left-1/2" />
      <span className="w-2 h-2 rounded-sm flex-shrink-0 border border-border-strong" style={{ backgroundColor: node.color }} />
      {node.label}
    </div>
  );
}

const nodeTypes = { pill: Pill };

export default function NeighborhoodFlow({ layout, onOpen }: { layout: Layout; onOpen: (id: string) => void }) {
  const nodes = useMemo<Node<PillData>[]>(() => layout.nodes.map((n) => ({
    id: n.id,
    type: 'pill',
    position: { x: n.x, y: n.y },
    origin: [0.5, 0.5],
    data: { node: n },
  })), [layout]);

  const edges = useMemo<Edge[]>(() => layout.edges.map((e) => ({
    id: `${e.from}|${e.to}`,
    source: e.from,
    target: e.to,
    type: 'straight',
    style: { stroke: 'var(--color-border-strong)', strokeWidth: 1.2 },
  })), [layout]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.2}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      panOnDrag
      zoomOnPinch
      zoomOnDoubleClick={false}
      preventScrolling
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        if ((node.data as PillData).node.ring !== 0) onOpen(node.id);
      }}
    />
  );
}
