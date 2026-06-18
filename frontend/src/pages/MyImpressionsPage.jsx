import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorAlert, Loading, Pager, StatusBadge, SuccessAlert } from '../components/ui';

const PAGE_SIZE = 10;

function ImpressionForm({ initial, routes, onSubmit, onCancel, busy, submitLabel }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          route_id: Number(form.route_id),
          name: form.name,
          description: form.description,
          price: Number(form.price),
        });
      }}
    >
      <div className="form-row">
        <label className="field" style={{ flex: 2 }}>
          <span>Маршрут</span>
          <select value={form.route_id} onChange={set('route_id')} required>
            <option value="">— выберите маршрут —</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} {r.name} ({r.status})
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>Название</span>
          <input type="text" value={form.name} onChange={set('name')} required minLength={3} maxLength={120} />
        </label>
        <label className="field">
          <span>Цена, ₽ (0 — бесплатно)</span>
          <input type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={set('price')} required />
        </label>
      </div>
      <label className="field">
        <span>Описание</span>
        <textarea value={form.description} onChange={set('description')} required minLength={10} maxLength={2000} />
      </label>
      <div className="btn-row">
        <button className="btn" disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  );
}

export default function MyImpressionsPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState('own');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [myRoutes, setMyRoutes] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api('/impressions', { params: { scope, page, page_size: PAGE_SIZE } }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [scope, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api('/routes', { params: { author_id: user.id, page_size: 100 } })
      .then((data) => setMyRoutes(data.items))
      .catch(() => setMyRoutes([]));
  }, [user.id]);

  async function run(action, message) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (message) setNotice(message);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const create = (body) =>
    run(() => api('/impressions', { method: 'POST', body }), 'Впечатление создано (черновик).');

  const update = (impressionId, body) =>
    run(async () => {
      await api(`/impressions/${impressionId}`, { method: 'PATCH', body });
      setEditingId(null);
    }, 'Впечатление обновлено.');

  const submit = (impressionId) =>
    run(async () => {
      const imp = await api(`/impressions/${impressionId}/submit`, { method: 'POST' });
      setNotice(imp.status === 'published' ? 'Впечатление опубликовано.' : 'Впечатление отправлено на модерацию.');
    });

  const remove = (impressionId) => {
    if (!window.confirm('Удалить впечатление?')) return;
    run(() => api(`/impressions/${impressionId}`, { method: 'DELETE' }), 'Впечатление удалено или архивировано.');
  };

  return (
    <>
      <h1>Мои впечатления</h1>
      <div className="card">
        <h2>Новое впечатление</h2>
        {myRoutes.length === 0 ? (
          <p className="muted">
            Сначала <Link to="/routes">создайте маршрут</Link>.
          </p>
        ) : (
          <ImpressionForm
            initial={{ route_id: '', name: '', description: '', price: 0 }}
            routes={myRoutes}
            busy={busy}
            submitLabel="Создать впечатление"
            onSubmit={create}
          />
        )}
      </div>

      <div className="card">
        <div className="tabs">
          <button className={scope === 'own' ? 'active' : ''} onClick={() => { setScope('own'); setPage(1); }}>Мои</button>
          <button className={scope === 'public' ? 'active' : ''} onClick={() => { setScope('public'); setPage(1); }}>Опубликованные</button>
          {user.role === 'admin' && (
            <button className={scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setPage(1); }}>Все (админ)</button>
          )}
        </div>
        <ErrorAlert error={error} />
        <SuccessAlert message={notice} />
        {loading ? (
          <Loading />
        ) : result && result.items.length === 0 ? (
          <Empty>Впечатлений нет</Empty>
        ) : (
          result && (
            <>
              <table className="data">
                <thead>
                  <tr>
                    <th>Впечатление</th>
                    <th>Маршрут</th>
                    <th>Цена</th>
                    <th>Рейтинг</th>
                    <th>Статус</th>
                    <th>Создано</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((imp) => {
                    const isOwner = imp.author_id === user.id || user.role === 'admin';
                    if (editingId === imp.id) {
                      return (
                        <tr key={imp.id}>
                          <td colSpan={7}>
                            <ImpressionForm
                              initial={{ route_id: imp.route_id, name: imp.name, description: imp.description, price: imp.price }}
                              routes={myRoutes.some((r) => r.id === imp.route_id) ? myRoutes : [{ id: imp.route_id, name: '(текущий маршрут)', status: '' }, ...myRoutes]}
                              busy={busy}
                              submitLabel="Сохранить"
                              onCancel={() => setEditingId(null)}
                              onSubmit={(body) => update(imp.id, body)}
                            />
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={imp.id}>
                        <td>
                          <Link to={`/impressions/${imp.id}`}><strong>{imp.name}</strong></Link>
                          {imp.moderation_comment && <div className="mod-comment small">Модератор: {imp.moderation_comment}</div>}
                        </td>
                        <td><Link to={`/routes/${imp.route_id}`}>#{imp.route_id}</Link></td>
                        <td>{formatPrice(imp.price)}</td>
                        <td>★ {Number(imp.rating).toFixed(1)}</td>
                        <td><StatusBadge status={imp.status} /></td>
                        <td className="muted small">{formatDate(imp.created_at)}</td>
                        <td>
                          {isOwner && (
                            <div className="btn-row">
                              <button className="btn secondary sm" onClick={() => setEditingId(imp.id)}>Изменить</button>
                              {(imp.status === 'draft' || imp.status === 'rejected') && imp.author_id === user.id && (
                                <button className="btn sm" onClick={() => submit(imp.id)}>На модерацию</button>
                              )}
                              <button className="btn danger sm" onClick={() => remove(imp.id)}>Удалить</button>
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
