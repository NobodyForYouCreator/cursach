import { useState } from 'react';
import { KNOWN_CITIES, api } from '../api';
import { CitySelect, Empty, ErrorAlert, Loading } from '../components/ui';

export default function PlacesPage() {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [useGeo, setUseGeo] = useState(false);
  const [lat, setLat] = useState('55.7558');
  const [lon, setLon] = useState('37.6173');
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  async function search(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = { q, city_external_id: city };
      if (useGeo) {
        params.latitude = lat;
        params.longitude = lon;
      }
      setPlaces(await api('/places/search', { params, auth: false }));
    } catch (err) {
      setError(err);
      setPlaces(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyCoords(place) {
    const text = `${place.latitude}, ${place.longitude}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(place.external_place_id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard недоступен */
    }
  }

  return (
    <>
      <h1>Поиск мест</h1>
      <p className="muted">Найдите место и скопируйте координаты, чтобы добавить его точкой маршрута.</p>
      <div className="card">
        <form onSubmit={search}>
          <div className="filters">
            <label className="field" style={{ flex: 2, minWidth: 220 }}>
              <span>Что ищем</span>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} required minLength={1} maxLength={80} placeholder="Например: Красная площадь" />
            </label>
            <label className="field">
              <span>Город</span>
              <CitySelect value={city} onChange={setCity} cities={KNOWN_CITIES} emptyLabel="Любой" />
            </label>
            <label className="field" style={{ minWidth: 'auto' }}>
              <span>&nbsp;</span>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={useGeo} onChange={(e) => setUseGeo(e.target.checked)} />
                Искать рядом с координатами
              </label>
            </label>
            {useGeo && (
              <>
                <label className="field">
                  <span>Широта</span>
                  <input type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} />
                </label>
                <label className="field">
                  <span>Долгота</span>
                  <input type="number" step="any" min="-180" max="180" value={lon} onChange={(e) => setLon(e.target.value)} />
                </label>
              </>
            )}
            <button className="btn" disabled={loading}>Найти</button>
          </div>
        </form>
      </div>
      <ErrorAlert error={error} />
      {loading ? (
        <Loading />
      ) : (
        places && (
          <div className="card">
            {places.length === 0 ? (
              <Empty>Места не найдены</Empty>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Место</th>
                    <th>Город</th>
                    <th>Координаты</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((p) => (
                    <tr key={p.external_place_id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.city_name}</td>
                      <td className="muted small">
                        {p.latitude != null ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : '—'}
                      </td>
                      <td>
                        {p.latitude != null && (
                          <button className="btn secondary sm" onClick={() => copyCoords(p)}>
                            {copied === p.external_place_id ? '✓ Скопировано' : 'Копировать координаты'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      )}
    </>
  );
}
