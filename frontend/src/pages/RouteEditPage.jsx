import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KNOWN_CITIES, api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorAlert, Loading, StatusBadge, SuccessAlert } from '../components/ui';
import YandexMap from '../components/YandexMap';

const EMPTY_POINT = { name: '', latitude: '', longitude: '', description: '', point_order: 1, stay_minutes: 10 };

function PointForm({ initial, onSubmit, onCancel, busy, submitLabel, pickedCoords }) {
  const [point, setPoint] = useState(initial);
  const set = (key) => (e) => setPoint({ ...point, [key]: e.target.value });

  useEffect(() => {
    if (pickedCoords) {
      setPoint((p) => ({
        ...p,
        latitude: pickedCoords.latitude.toFixed(6),
        longitude: pickedCoords.longitude.toFixed(6),
      }));
    }
  }, [pickedCoords]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: point.name,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          description: point.description,
          point_order: Number(point.point_order),
          stay_minutes: Number(point.stay_minutes),
        });
      }}
    >
      <div className="form-row">
        <label className="field" style={{ flex: 2 }}>
          <span>Название точки</span>
          <input type="text" value={point.name} onChange={set('name')} required minLength={3} maxLength={120} />
        </label>
        <label className="field">
          <span>Широта</span>
          <input type="number" step="any" min="-90" max="90" value={point.latitude} onChange={set('latitude')} required />
        </label>
        <label className="field">
          <span>Долгота</span>
          <input type="number" step="any" min="-180" max="180" value={point.longitude} onChange={set('longitude')} required />
        </label>
        <label className="field">
          <span>№ по порядку</span>
          <input type="number" min="1" value={point.point_order} onChange={set('point_order')} required />
        </label>
        <label className="field">
          <span>Остановка, мин</span>
          <input type="number" min="0" max="1440" value={point.stay_minutes} onChange={set('stay_minutes')} required />
        </label>
      </div>
      <label className="field">
        <span>Описание точки (необязательно)</span>
        <input type="text" value={point.description} onChange={set('description')} maxLength={1000} />
      </label>
      <div className="btn-row">
        <button className="btn" disabled={busy}>{submitLabel}</button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>Отмена</button>
        )}
      </div>
    </form>
  );
}

export default function RouteEditPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [cityIds, setCityIds] = useState([]);
  const [editingPoint, setEditingPoint] = useState(null);
  const [pickedCoords, setPickedCoords] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api(`/routes/${id}`);
      setRoute(data);
      setForm({
        name: data.name,
        description: data.description,
        duration_minutes: data.duration_minutes,
      });
      setCityIds(data.cities.map((c) => c.external_city_id));
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !route) return <ErrorAlert error={error} />;
  if (!route || !form) return <Loading />;

  const isOwner = route.user_id === user.id || user.role === 'admin';
  const editable = isOwner;
  const nextOrder = route.points.length ? Math.max(...route.points.map((p) => p.point_order)) + 1 : 1;

  function toggleCity(cid) {
    setCityIds((ids) => (ids.includes(cid) ? ids.filter((x) => x !== cid) : [...ids, cid]));
  }

  async function run(action, successMessage) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const saveRoute = () =>
    run(
      () =>
        api(`/routes/${id}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            description: form.description,
            duration_minutes: Number(form.duration_minutes),
            cities: KNOWN_CITIES.filter((c) => cityIds.includes(c.external_city_id)),
          },
        }),
      'Маршрут сохранён.'
    );

  const submitRoute = () =>
    run(async () => {
      const updated = await api(`/routes/${id}/submit`, { method: 'POST' });
      setNotice(updated.status === 'published' ? 'Маршрут опубликован.' : 'Маршрут отправлен на модерацию.');
    });

  const deleteRoute = () => {
    if (!window.confirm('Удалить маршрут?')) return;
    run(async () => {
      await api(`/routes/${id}`, { method: 'DELETE' });
      navigate('/routes');
    });
  };

  const addPoint = (body) =>
    run(() => api(`/routes/${id}/points`, { method: 'POST', body }), 'Точка добавлена.');

  const updatePoint = (pointId, body) =>
    run(async () => {
      await api(`/routes/${id}/points/${pointId}`, { method: 'PATCH', body });
      setEditingPoint(null);
    }, 'Точка обновлена.');

  const deletePoint = (pointId) =>
    run(() => api(`/routes/${id}/points/${pointId}`, { method: 'DELETE' }), 'Точка удалена.');

  return (
    <>
      <div className="page-title">
        <h1>Маршрут #{route.id}</h1>
        <div className="btn-row">
          <StatusBadge status={route.status} />
          <Link to="/routes">← к списку</Link>
        </div>
      </div>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      {route.moderation_comment && (
        <div className="mod-comment">Комментарий модератора: {route.moderation_comment}</div>
      )}

      <div className="card">
        <h2>Параметры маршрута</h2>
        {!editable && <p className="muted">Вы не владелец маршрута — редактирование недоступно.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveRoute();
          }}
        >
          <div className="form-row">
            <label className="field" style={{ flex: 2 }}>
              <span>Название</span>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editable} required minLength={3} maxLength={120} />
            </label>
            <label className="field">
              <span>Длительность, мин</span>
              <input type="number" min="1" max="1440" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} disabled={!editable} required />
            </label>
          </div>
          <label className="field">
            <span>Описание</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!editable} required minLength={10} maxLength={2000} />
          </label>
          <label className="field">
            <span>Города</span>
            <div className="btn-row">
              {KNOWN_CITIES.map((c) => (
                <label key={c.external_city_id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" checked={cityIds.includes(c.external_city_id)} onChange={() => toggleCity(c.external_city_id)} disabled={!editable} />
                  {c.name}
                </label>
              ))}
            </div>
          </label>
          {editable && (
            <div className="btn-row">
              <button className="btn" disabled={busy || cityIds.length === 0}>Сохранить</button>
              {(route.status === 'draft' || route.status === 'rejected') && route.user_id === user.id && (
                <button type="button" className="btn success" onClick={submitRoute} disabled={busy}>
                  Отправить на модерацию
                </button>
              )}
              <button type="button" className="btn danger" onClick={deleteRoute} disabled={busy}>Удалить</button>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <h2>Точки маршрута ({route.points.length})</h2>
        {editable && <p className="hint">Клик по карте подставляет координаты в форму точки.</p>}
        <div style={{ marginBottom: 14 }}>
          <YandexMap
            points={route.points}
            position={pickedCoords}
            height={360}
            onClick={editable ? setPickedCoords : undefined}
          />
        </div>
        {route.points.length === 0 ? (
          <Empty>Точек пока нет — добавьте хотя бы одну, иначе маршрут не пройдёт модерацию</Empty>
        ) : (
          route.points.map((p) =>
            editingPoint === p.id ? (
              <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
                <PointForm
                  initial={{ ...p }}
                  busy={busy}
                  submitLabel="Сохранить точку"
                  pickedCoords={editingPoint === p.id ? pickedCoords : null}
                  onCancel={() => setEditingPoint(null)}
                  onSubmit={(body) => updatePoint(p.id, body)}
                />
              </div>
            ) : (
              <div className="point-row" key={p.id}>
                <span className="point-num">{p.point_order}</span>
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.description && <span className="muted"> — {p.description}</span>}
                  <div className="muted small">
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · остановка {p.stay_minutes} мин
                  </div>
                </div>
                {editable && (
                  <div className="btn-row">
                    <button className="btn secondary sm" onClick={() => setEditingPoint(p.id)}>Изменить</button>
                    <button className="btn danger sm" onClick={() => deletePoint(p.id)}>Удалить</button>
                  </div>
                )}
              </div>
            )
          )
        )}
        {editable && (
          <>
            <h3>Добавить точку</h3>
            <PointForm
              key={`new-${route.points.length}-${nextOrder}`}
              initial={{ ...EMPTY_POINT, point_order: nextOrder }}
              busy={busy}
              submitLabel="Добавить точку"
              pickedCoords={editingPoint === null ? pickedCoords : null}
              onSubmit={addPoint}
            />
          </>
        )}
      </div>
    </>
  );
}
