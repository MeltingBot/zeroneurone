import { useTranslation } from 'react-i18next';
import { GeoPickerShell, PickedCoordinates, PickerActions } from './GeoPickerShell';
import { usePickerMap } from '../../hooks/usePickerMap';

interface GeoPickerProps {
  initialLat?: number;
  initialLng?: number;
  /** Pre-filled search text; the search itself still waits for the user. */
  initialQuery?: string;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

export function GeoPicker({ initialLat, initialLng, initialQuery, onConfirm, onCancel }: GeoPickerProps) {
  const { t } = useTranslation('panels');
  const { containerRef, mapRef, selectedLat, selectedLng, placeMarker } = usePickerMap({
    initialLat,
    initialLng,
    initialZoom: 12,
  });

  const handleConfirm = () => {
    if (selectedLat !== null && selectedLng !== null) onConfirm(selectedLat, selectedLng);
  };

  return (
    <GeoPickerShell
      title={t('detail.geoPicker.title')}
      onCancel={onCancel}
      mapContainerRef={containerRef}
      initialQuery={initialQuery}
      onPlaceFound={(lat, lng) => {
        placeMarker(lat, lng);
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
      }}
      footer={
        <>
          <PickedCoordinates lat={selectedLat} lng={selectedLng} hint={t('detail.geoPicker.clickToPlace')} />
          <PickerActions
            onCancel={onCancel}
            onConfirm={handleConfirm}
            canConfirm={selectedLat !== null && selectedLng !== null}
          />
        </>
      }
    />
  );
}
