import { lazy, Suspense } from 'react';
import { settleGeoPick, useGeoPickRequest } from '../../plugins/pluginUi';

// Same lazy loading as the element panel: maplibre-gl is heavy.
const GeoPicker = lazy(() => import('../panels/GeoPicker').then((m) => ({ default: m.GeoPicker })));

/** Renders the ZN components that plugins open through pluginAPI.ui. */
export function PluginUiHost() {
  const geoRequest = useGeoPickRequest();
  if (!geoRequest) return null;
  return (
    <Suspense fallback={null}>
      <GeoPicker
        key={geoRequest.id}
        initialLat={geoRequest.initial?.lat}
        initialLng={geoRequest.initial?.lng}
        initialQuery={geoRequest.query}
        onConfirm={(lat, lng) => settleGeoPick({ lat, lng })}
        onCancel={() => settleGeoPick(null)}
      />
    </Suspense>
  );
}
