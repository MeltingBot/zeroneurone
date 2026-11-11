import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { LatLng } from './MapPicker';

// MapLibre loads with the picker, not with the companion
const MapPicker = lazy(() => import('./MapPicker'));

/** The map picker, loaded on first use */
export function PositionPicker(props: {
  initial: LatLng | null;
  around: LatLng[];
  onPick: (point: LatLng) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary"><Loader2 size={20} className="animate-spin text-text-tertiary" /></div>}>
      <MapPicker {...props} />
    </Suspense>
  );
}
