/** The phone's position, asked once (the browser asks the person the first time) */
export interface Located {
  lat: number;
  lng: number;
  /** Radius of uncertainty, in metres */
  accuracy: number;
}

export function locateOnce(): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}
