import { useCallback, useRef } from 'react';

type ResizeEnd = { x: number; y: number; width: number; height: number };
type ResizeLive = { width: number; height: number };

/**
 * NodeResizer callbacks that report the end of a resize only when the size
 * changed. Since React Flow 12.12, onResizeEnd also fires after a press on a
 * handle without any move: writing that size would fix an automatic one.
 */
export function useResizeEnd(onEnd: (params: ResizeEnd) => void, onLive?: (params: ResizeLive) => void) {
  const resizedRef = useRef(false);
  const onResizeStart = useCallback(() => {
    resizedRef.current = false;
  }, []);
  const onResize = useCallback((_event: unknown, params: ResizeLive) => {
    resizedRef.current = true;
    onLive?.(params);
  }, [onLive]);
  const onResizeEnd = useCallback((_event: unknown, params: ResizeEnd) => {
    if (!resizedRef.current) return;
    resizedRef.current = false;
    onEnd(params);
  }, [onEnd]);
  return { onResizeStart, onResize, onResizeEnd };
}
