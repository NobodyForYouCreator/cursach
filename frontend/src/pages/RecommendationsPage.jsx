import { useEffect, useState } from 'react';
import { api } from '../api';
import { getCurrentPosition } from '../geo';
import { useActiveCities } from '../hooks';
import { CitySelect, Empty, ErrorAlert, ImpressionCard, Loading, Pager } from '../components/ui';

const PAGE_SIZE = 12;

export default function RecommendationsPage() {
  const cities = useActiveCities();
  const [mode, setMode] = useState('city');
  const [city, setCity] = useState('');
  const [filters, setFilters] = useState({ min_price: '', max_price: '', min_duration: '', max_duration: '', sort_by: 'score' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!city && cities.length) setCity(cities[0].external_city_id);
  }, [cities, city]);

  async function load(targetPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = { ...filters, page: targetPage, page_size: PAGE_SIZE };
      if (mode === 'city') {
        params.city_external_id = city;
      } else {
        const coords = await getCurrentPosition();
        params.latitude = coords.latitude;
        params.longitude = coords.longitude;
      }
      setResult(await api('/recommendations', { params }));
      setPage(targetPage);
    } catch (err) {
      setError(err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <>
      <h1>Рекомендации</h1>
      <p className="muted">Персональная подборка впечатлений по городу или рядом с вами.</p>
      <div className="card">
        <div className="tabs">
          <button className={mode === 'city' ? 'active' : ''} onClick={() => setMode('city')}>По городу</button>
          <button className={mode === 'geo' ? 'active' : ''} onClick={() => setMode('geo')}>Рядом со мной</button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
        >
          <div className="filters">
            {mode === 'city' && (
              <label className="field">
                <span>Город</span>
                <CitySelect value={city} onChange={setCity} cities={cities} allowEmpty={false} />
              </label>
            )}
            <label className="field">
              <span>Цена от</span>
              <input type="number" min="0" value={filters.min_price} onChange={set('min_price')} />
            </label>
            <label className="field">
              <span>Цена до</span>
              <input type="number" min="0" value={filters.max_price} onChange={set('max_price')} />
            </label>
            <label className="field">
              <span>Длит. от, мин</span>
              <input type="number" min="1" value={filters.min_duration} onChange={set('min_duration')} />
            </label>
            <label className="field">
              <span>Длит. до, мин</span>
              <input type="number" min="1" value={filters.max_duration} onChange={set('max_duration')} />
            </label>
            <label className="field">
              <span>Сортировка</span>
              <select value={filters.sort_by} onChange={set('sort_by')}>
                <option value="score">По оценке подборки</option>
                <option value="rating">По рейтингу</option>
                <option value="popularity_score">По популярности</option>
              </select>
            </label>
            <button className="btn" disabled={loading || (mode === 'city' && !city)}>
              {mode === 'geo' ? '📍 Показать ближайшие' : 'Подобрать'}
            </button>
          </div>
        </form>
      </div>
      <ErrorAlert error={error} />
      {loading ? (
        <Loading />
      ) : (
        result && (
          <>
            {result.items.length === 0 ? (
              <Empty>Подходящих впечатлений не нашлось</Empty>
            ) : (
              <div className="grid-cards">
                {result.items.map((imp) => (
                  <ImpressionCard key={imp.id} imp={imp} showScore />
                ))}
              </div>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={result.total} onPage={(p) => load(p)} />
          </>
        )
      )}
    </>
  );
}
