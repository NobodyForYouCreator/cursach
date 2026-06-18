let ymapsPromise = null;

export function loadYmaps() {
  if (!ymapsPromise) {
    ymapsPromise = new Promise((resolve, reject) => {
      if (window.ymaps) {
        window.ymaps.ready(() => resolve(window.ymaps));
        return;
      }
      const key = import.meta.env.VITE_YANDEX_MAPS_API_KEY;
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${key ? `&apikey=${key}` : ''}`;
      script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
      script.onerror = () => {
        ymapsPromise = null;
        reject(new Error('Не удалось загрузить Яндекс.Карты'));
      };
      document.head.appendChild(script);
    });
  }
  return ymapsPromise;
}

// Определяет местоположение: сначала геолокация браузера, при недоступности —
// определение по IP через Яндекс.Карты.
export async function getCurrentPosition() {
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 30000,
        })
      );
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (err) {
      if (err?.code === 1) {
        throw new Error('Доступ к геолокации запрещён — разрешите его в браузере');
      }
    }
  }
  try {
    const ymaps = await loadYmaps();
    const result = await ymaps.geolocation.get({ provider: 'yandex', autoReverseGeocode: false });
    const coords = result.geoObjects.get(0)?.geometry?.getCoordinates();
    if (coords) return { latitude: coords[0], longitude: coords[1] };
  } catch {
    /* провайдер недоступен */
  }
  throw new Error('Не удалось определить местоположение');
}
