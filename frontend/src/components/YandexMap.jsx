import { useEffect, useRef, useState } from 'react';
import { loadYmaps } from '../geo';

export default function YandexMap({ points = [], position = null, onClick, height = 360 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const fittedRef = useRef(false);
  const onClickRef = useRef(onClick);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  onClickRef.current = onClick;

  useEffect(() => {
    let destroyed = false;
    loadYmaps()
      .then((ymaps) => {
        if (destroyed || !containerRef.current || mapRef.current) return;
        const map = new ymaps.Map(
          containerRef.current,
          { center: [55.7558, 37.6173], zoom: 13, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true }
        );
        map.events.add('click', (e) => {
          const [latitude, longitude] = e.get('coords');
          onClickRef.current?.({ latitude, longitude });
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => !destroyed && setFailed(true));
    return () => {
      destroyed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = window.ymaps;
    if (!ready || !map || !ymaps) return;
    map.geoObjects.removeAll();
    points.forEach((p, idx) => {
      const mark = new ymaps.Placemark(
        [p.latitude, p.longitude],
        { iconCaption: `${idx + 1}. ${p.name || ''}` },
        {
          preset: p.reached
            ? 'islands#greenCircleDotIconWithCaption'
            : 'islands#blueCircleDotIconWithCaption',
        }
      );
      if (onClickRef.current) {
        mark.events.add('click', () =>
          onClickRef.current?.({ latitude: p.latitude, longitude: p.longitude })
        );
      }
      map.geoObjects.add(mark);
    });
    if (points.length > 1) {
      map.geoObjects.add(
        new ymaps.Polyline(
          points.map((p) => [p.latitude, p.longitude]),
          {},
          { strokeColor: '#2563eb', strokeWidth: 3, strokeOpacity: 0.7 }
        )
      );
    }
    if (position) {
      map.geoObjects.add(
        new ymaps.Placemark(
          [position.latitude, position.longitude],
          { iconCaption: 'Вы здесь' },
          { preset: 'islands#redDotIconWithCaption', zIndex: 1000 }
        )
      );
    }
    if (!fittedRef.current && points.length) {
      if (points.length === 1) {
        map.setCenter([points[0].latitude, points[0].longitude], 15);
      } else {
        const bounds = map.geoObjects.getBounds();
        if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
      }
      fittedRef.current = true;
    }
  }, [ready, points, position]);

  if (failed) {
    return (
      <div className="map-box map-fallback" style={{ height }}>
        Карта недоступна (нет связи с Яндекс.Картами)
      </div>
    );
  }
  return <div className="map-box" style={{ height }} ref={containerRef} />;
}
