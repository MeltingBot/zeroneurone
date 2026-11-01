import { useEffect } from 'react';
import { useStoreApi } from '@xyflow/react';
import { LINK_WIDTH_SCALE_VAR } from '../../utils/linkWidthScale';


/**
 * Zoomed in, links keep their width in screen pixels instead of growing with
 * the view (a 3-unit link was 10 px wide at zoom 3). Sets a CSS variable on
 * React Flow's container from its store, so no edge re-renders on zoom.
 */
export function LinkWidthScale() {
  const store = useStoreApi();
  useEffect(() => {
    let applied = NaN;
    const apply = () => {
      const { transform, domNode } = store.getState();
      const scale = Math.min(1, 1 / transform[2]);
      if (!domNode || scale === applied) return;
      applied = scale;
      domNode.style.setProperty(LINK_WIDTH_SCALE_VAR, String(scale));
    };
    apply();
    return store.subscribe((s, prev) => {
      if (s.transform[2] !== prev.transform[2] || s.domNode !== prev.domNode) apply();
    });
  }, [store]);
  return null;
}
