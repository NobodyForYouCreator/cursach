import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api';
import { Empty, ErrorAlert, Loading, StatusBadge, SuccessAlert } from '../components/ui';

const EVENT_TYPES = [
  'impression_viewed',
  'impression_started',
  'impression_completed',
  'purchase_created',
  'purchase_paid',
  'route_created',
  'impression_published',
];

function RejectForm({ onReject, busy }) {
  const [comment, setComment] = useState('');
  return (
    <form
      className="btn-row"
      onSubmit={(e) => {
        e.preventDefault();
        onReject(comment);
        setComment('');
      }}
    >
      <input
        type="text"
        placeholder="Причина отклонения"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        required
        maxLength={1000}
        style={{ width: 220 }}
      />
      <button className="btn danger sm" disabled={busy}>Отклонить</button>
    </form>
  );
}

function ModerationRoutes() {
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/moderation/routes').then(setRoutes).catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(routeId, action, body) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/moderation/routes/${routeId}/${action}`, { method: 'POST', body });
      setNotice(action === 'publish' ? 'Маршрут опубликован.' : 'Маршрут отклонён.');
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!routes && !error) return <Loading />;
  return (
    <>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      {routes && routes.length === 0 ? (
        <Empty>Маршрутов на модерации нет</Empty>
      ) : (
        routes &&
        routes.map((r) => (
          <div className="card" key={r.id}>
            <div className="page-title">
              <h3>
                <Link to={`/routes/${r.id}`}>#{r.id} {r.name}</Link>
              </h3>
              <StatusBadge status={r.status} />
            </div>
            <p className="muted">{r.description}</p>
            <div className="muted small">
              Автор #{r.user_id} · {r.duration_minutes} мин · города: {r.cities.map((c) => c.name).join(', ')}
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn success sm" disabled={busy} onClick={() => act(r.id, 'publish')}>
                Опубликовать
              </button>
              <RejectForm busy={busy} onReject={(comment) => act(r.id, 'reject', { moderation_comment: comment })} />
            </div>
          </div>
        ))
      )}
    </>
  );
}

function ModerationImpressions() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/moderation/impressions').then(setItems).catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(impressionId, action, body) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/moderation/impressions/${impressionId}/${action}`, { method: 'POST', body });
      setNotice(action === 'publish' ? 'Впечатление опубликовано.' : 'Впечатление отклонено.');
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!items && !error) return <Loading />;
  return (
    <>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      {items && items.length === 0 ? (
        <Empty>Впечатлений на модерации нет</Empty>
      ) : (
        items &&
        items.map((imp) => (
          <div className="card" key={imp.id}>
            <div className="page-title">
              <h3>
                <Link to={`/impressions/${imp.id}`}>#{imp.id} {imp.name}</Link>
              </h3>
              <StatusBadge status={imp.status} />
            </div>
            <p className="muted">{imp.description}</p>
            <div className="muted small">
              Автор #{imp.author_id} · маршрут #{imp.route_id} · {formatPrice(imp.price)}
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn success sm" disabled={busy} onClick={() => act(imp.id, 'publish')}>
                Опубликовать
              </button>
              <RejectForm busy={busy} onReject={(comment) => act(imp.id, 'reject', { moderation_comment: comment })} />
            </div>
          </div>
        ))
      )}
    </>
  );
}

function UsersAdmin() {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function act(action) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      let user;
      if (action === 'verify') {
        user = await api(`/admin/users/${userId}/verify-author`, { method: 'PATCH' });
        setNotice(`Пользователю «${user.username}» выдана роль автора.`);
      } else {
        user = await api(`/admin/users/${userId}/block`, {
          method: 'PATCH',
          body: { is_blocked: action === 'block' },
        });
        setNotice(action === 'block' ? `Пользователь «${user.username}» заблокирован.` : `Пользователь «${user.username}» разблокирован.`);
      }
      setResult(user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Управление пользователем по ID</h3>
      <p className="hint">ID пользователя виден в маршрутах, отзывах и аналитике.</p>
      <div className="filters">
        <label className="field">
          <span>ID пользователя</span>
          <input type="number" min="1" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <button className="btn sm" disabled={busy || !userId} onClick={() => act('verify')}>
          Сделать автором
        </button>
        <button className="btn danger sm" disabled={busy || !userId} onClick={() => act('block')}>
          Заблокировать
        </button>
        <button className="btn secondary sm" disabled={busy || !userId} onClick={() => act('unblock')}>
          Разблокировать
        </button>
      </div>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      {result && (
        <table className="data" style={{ maxWidth: 560 }}>
          <tbody>
            <tr><th>ID</th><td>{result.id}</td></tr>
            <tr><th>Имя</th><td>{result.username}</td></tr>
            <tr><th>Email</th><td>{result.email}</td></tr>
            <tr><th>Роль</th><td><span className="badge role">{result.role}</span></td></tr>
            <tr><th>Заблокирован</th><td>{result.is_blocked ? 'Да' : 'Нет'}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function Analytics() {
  const [filters, setFilters] = useState({ event_type: '', date_from: '', date_to: '' });
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dates = {
        date_from: filters.date_from ? new Date(filters.date_from).toISOString() : '',
        date_to: filters.date_to ? new Date(filters.date_to).toISOString() : '',
      };
      const [summaryData, eventsData] = await Promise.all([
        api('/analytics/summary', { params: dates }),
        api('/analytics/events', { params: { ...dates, event_type: filters.event_type } }),
      ]);
      setSummary(summaryData);
      setEvents(eventsData);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="filters card">
        <label className="field">
          <span>Тип события</span>
          <select value={filters.event_type} onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}>
            <option value="">Все</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>С даты</span>
          <input type="datetime-local" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        </label>
        <label className="field">
          <span>По дату</span>
          <input type="datetime-local" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        </label>
      </div>
      <ErrorAlert error={error} />
      {loading ? (
        <Loading />
      ) : (
        <>
          {summary && (
            <div className="stat-cards" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="value">{summary.total}</div>
                <div className="label">Всего событий</div>
              </div>
              {Object.entries(summary.by_event_type).map(([type, count]) => (
                <div className="stat-card" key={type}>
                  <div className="value">{count}</div>
                  <div className="label">{type}</div>
                </div>
              ))}
            </div>
          )}
          {events && (
            <div className="card">
              <h3>События ({events.length})</h3>
              {events.length === 0 ? (
                <Empty>Событий нет</Empty>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Событие</th>
                      <th>Сущность</th>
                      <th>Пользователь</th>
                      <th>Метаданные</th>
                      <th>Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(0, 100).map((ev) => (
                      <tr key={ev.id}>
                        <td>{ev.id}</td>
                        <td><span className="chip">{ev.event_type}</span></td>
                        <td>{ev.entity_type} #{ev.entity_id}</td>
                        <td>{ev.user_id ? `#${ev.user_id}` : '—'}</td>
                        <td className="muted small">{Object.keys(ev.metadata).length ? JSON.stringify(ev.metadata) : '—'}</td>
                        <td className="muted small">{formatDate(ev.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('mod-routes');
  return (
    <>
      <h1>Админка</h1>
      <div className="tabs">
        <button className={tab === 'mod-routes' ? 'active' : ''} onClick={() => setTab('mod-routes')}>Модерация маршрутов</button>
        <button className={tab === 'mod-imps' ? 'active' : ''} onClick={() => setTab('mod-imps')}>Модерация впечатлений</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Пользователи</button>
        <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>Аналитика</button>
      </div>
      {tab === 'mod-routes' && <ModerationRoutes />}
      {tab === 'mod-imps' && <ModerationImpressions />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'analytics' && <Analytics />}
    </>
  );
}
