import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KNOWN_CITIES, api, formatDate, formatDuration } from '../api';
import { useAuth } from '../auth';
import { CitySelect, Empty, ErrorAlert, Loading, Pager, StatusBadge, SuccessAlert } from '../components/ui';

const PAGE_SIZE = 10;

function CreateRouteForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', duration_minutes: 60 });
  const [cityIds, setCityIds] = useState(['msk']);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function toggleCity(id) {
    setCityIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cities = KNOWN_CITIES.filter((c) => cityIds.includes(c.external_city_id));
      const route = await api('/routes', {
        method: 'POST',
        body: { ...form, duration_minutes: Number(form.duration_minutes), cities },
      });
      setForm({ name: '', description: '', duration_minutes: 60 });
      onCreated(route);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Новый маршрут</h2>
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <div className="form-row">
          <label className="field" style={{ flex: 2 }}>
            <span>Название</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} maxLength={120} />
          </label>
          <label className="field">
            <span>Длительность, мин (1–1440)</span>
            <input type="number" min="1" max="1440" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required />
          </label>
        </div>
        <label className="field">
          <span>Описание</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={2000} />
        </label>
        <label className="field">
          <span>Города (минимум один)</span>
          <div className="btn-row">
            {KNOWN_CITIES.map((c) => (
              <label key={c.external_city_id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={cityIds.includes(c.external_city_id)}
                  onChange={() => toggleCity(c.external_city_id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </label>
        <button className="btn" disabled={busy || cityIds.length === 0}>Создать маршрут</button>
      </form>
    </div>
  );
}

export default function RoutesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mine');
  const [page, setPage] = useState(1);
  const [city, setCity] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        page_size: PAGE_SIZE,
        external_city_id: city,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (tab === 'mine') params.author_id = user.id;
      setResult(await api('/routes', { params }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tab, page, city, sortBy, sortOrder, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitRoute(routeId) {
    setError(null);
    setNotice(null);
    try {
      const route = await api(`/routes/${routeId}/submit`, { method: 'POST' });
      setNotice(
        route.status === 'published'
          ? `Маршрут «${route.name}» опубликован.`
          : `Маршрут «${route.name}» отправлен на модерацию.`
      );
      load();
    } catch (err) {
      setError(err);
    }
  }

  async function deleteRoute(routeId) {
    if (!window.confirm('Удалить маршрут?')) return;
    setError(null);
    setNotice(null);
    try {
      await api(`/routes/${routeId}`, { method: 'DELETE' });
      setNotice('Маршрут удалён или перенесён в архив.');
      load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <h1>Маршруты</h1>
      <CreateRouteForm onCreated={() => { setNotice('Маршрут создан. Добавьте точки и отправьте на модерацию.'); load(); }} />
      <div className="card">
        <div className="tabs">
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => { setTab('mine'); setPage(1); }}>Мои маршруты</button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => { setTab('all'); setPage(1); }}>
            {user.role === 'admin' ? 'Все маршруты' : 'Опубликованные'}
          </button>
        </div>
        <div className="filters">
          <label className="field">
            <span>Город</span>
            <CitySelect value={city} onChange={(v) => { setCity(v); setPage(1); }} cities={KNOWN_CITIES} />
          </label>
          <label className="field">
            <span>Сортировка</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="created_at">По дате создания</option>
              <option value="updated_at">По дате изменения</option>
              <option value="name">По названию</option>
            </select>
          </label>
          <label className="field">
            <span>Порядок</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">По убыванию</option>
              <option value="asc">По возрастанию</option>
            </select>
          </label>
        </div>
        <ErrorAlert error={error} />
        <SuccessAlert message={notice} />
        {loading ? (
          <Loading />
        ) : result && result.items.length === 0 ? (
          <Empty>Маршрутов нет</Empty>
        ) : (
          result && (
            <>
              <table className="data">
                <thead>
                  <tr>
                    <th>Маршрут</th>
                    <th>Города</th>
                    <th>Длительность</th>
                    <th>Статус</th>
                    <th>Создан</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((r) => {
                    const isOwner = r.user_id === user.id || user.role === 'admin';
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/routes/${r.id}`}><strong>{r.name}</strong></Link>
                          <div className="muted small">{r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}</div>
                          {r.moderation_comment && <div className="mod-comment small">Модератор: {r.moderation_comment}</div>}
                        </td>
                        <td>
                          <div className="chips">
                            {r.cities.map((c) => <span className="chip" key={c.external_city_id}>{c.name}</span>)}
                          </div>
                        </td>
                        <td>{formatDuration(r.duration_minutes)}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="muted small">{formatDate(r.created_at)}</td>
                        <td>
                          {isOwner && (
                            <div className="btn-row">
                              <Link className="btn secondary sm" to={`/routes/${r.id}`}>Открыть</Link>
                              {(r.status === 'draft' || r.status === 'rejected') && r.user_id === user.id && (
                                <button className="btn sm" onClick={() => submitRoute(r.id)}>На модерацию</button>
                              )}
                              <button className="btn danger sm" onClick={() => deleteRoute(r.id)}>Удалить</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pager page={page} pageSize={PAGE_SIZE} total={result.total} onPage={setPage} />
            </>
          )
        )}
      </div>
    </>
  );
}
