import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useActiveCities } from '../hooks';
import { CitySelect, Empty, ErrorAlert, ImpressionCard, Loading, Pager } from '../components/ui';

const SORTS = [
  { value: 'created_at', label: 'По новизне' },
  { value: 'price', label: 'По цене' },
  { value: 'rating', label: 'По рейтингу' },
  { value: 'popularity_score', label: 'По популярности' },
];

const PAGE_SIZE = 12;

export default function ShowcasePage() {
  const cities = useActiveCities();
  const [filters, setFilters] = useState({
    city_external_id: '',
    min_price: '',
    max_price: '',
    min_duration: '',
    max_duration: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api('/showcase/impressions', {
          params: { ...filters, page, page_size: PAGE_SIZE },
          auth: false,
        })
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <>
      <h1>Витрина впечатлений</h1>
      <div className="filters card">
        <label className="field">
          <span>Город</span>
          <CitySelect value={filters.city_external_id} onChange={set('city_external_id')} cities={cities} />
        </label>
        <label className="field">
          <span>Цена от, ₽</span>
          <input type="number" min="0" value={filters.min_price} onChange={(e) => set('min_price')(e.target.value)} />
        </label>
        <label className="field">
          <span>Цена до, ₽</span>
          <input type="number" min="0" value={filters.max_price} onChange={(e) => set('max_price')(e.target.value)} />
        </label>
        <label className="field">
          <span>Длительность от, мин</span>
          <input type="number" min="1" value={filters.min_duration} onChange={(e) => set('min_duration')(e.target.value)} />
        </label>
        <label className="field">
          <span>Длительность до, мин</span>
          <input type="number" min="1" value={filters.max_duration} onChange={(e) => set('max_duration')(e.target.value)} />
        </label>
        <label className="field">
          <span>Сортировка</span>
          <select value={filters.sort_by} onChange={(e) => set('sort_by')(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Порядок</span>
          <select value={filters.sort_order} onChange={(e) => set('sort_order')(e.target.value)}>
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </label>
      </div>
      <ErrorAlert error={error} />
      {loading ? (
        <Loading />
      ) : (
        result && (
          <>
            {result.items.length === 0 ? (
              <Empty>По заданным фильтрам ничего не найдено</Empty>
            ) : (
              <div className="grid-cards">
                {result.items.map((imp) => (
                  <ImpressionCard key={imp.id} imp={imp} />
                ))}
              </div>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} />
          </>
        )
      )}
    </>
  );
}
