import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WS_BASE, api } from '../api';
import { getCurrentPosition } from '../geo';
import { ErrorAlert, Loading } from '../components/ui';
import YandexMap from '../components/YandexMap';

export default function WalkPage() {
  const { id } = useParams();
  const [imp, setImp] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [wsState, setWsState] = useState('connecting');
  const [distance, setDistance] = useState(null);
  const [position, setPosition] = useState(null);
  const [pointNotice, setPointNotice] = useState(null);
  const [locating, setLocating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const wsRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await api(`/bff/impressions/${id}`);
        if (cancelled) return;
        setImp(detail);
        const prog = await api(`/progress/${id}`);
        if (!cancelled) setProgress(prog);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!imp) return undefined;
    let closed = false;
    let retryTimer = null;
    let attempts = 0;

    function connect() {
      const token = localStorage.getItem('travel_token');
      const ws = new WebSocket(`${WS_BASE}/ws/${id}?token=${encodeURIComponent(token || '')}`);
      wsRef.current = ws;
      setWsState('connecting');
      ws.onopen = () => {
        attempts = 0;
        setWsState('connected');
      };
      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.status !== 'success') {
          setError(msg.error?.message || 'Ошибка');
          return;
        }
        pendingRef.current = false;
        const { progress: prog, point_reached, distance_meters } = msg.data;
        setProgress(prog);
        setDistance(distance_meters);
        if (prog.is_completed) setRestarting(false);
        if (point_reached && !prog.is_completed) {
          setPointNotice(`Точка №${prog.current_point} пройдена!`);
          clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = setTimeout(() => setPointNotice(null), 4000);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempts += 1;
        setWsState('connecting');
        retryTimer = setTimeout(connect, Math.min(5000, 1000 * attempts));
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(noticeTimerRef.current);
      wsRef.current?.close();
    };
  }, [imp, id]);

  const canSend = wsState === 'connected' && (!progress?.is_completed || restarting);

  function send(latitude, longitude) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (pendingRef.current) return;
    if (progress?.is_completed && !restarting) return;
    pendingRef.current = true;
    setTimeout(() => {
      pendingRef.current = false;
    }, 3000);
    setError(null);
    setPosition({ latitude, longitude });
    wsRef.current.send(JSON.stringify({ latitude, longitude }));
  }

  async function useGeolocation() {
    setLocating(true);
    setError(null);
    try {
      const coords = await getCurrentPosition();
      send(coords.latitude, coords.longitude);
    } catch (err) {
      setError(`${err.message} — кликните по карте.`);
    } finally {
      setLocating(false);
    }
  }

  if (error && (!imp || !progress)) return <ErrorAlert error={error} />;
  if (!imp || !progress) return <Loading />;

  const points = imp.route.points;
  const nextPoint = points[progress.current_point];
  const mapPoints = points.map((p, idx) => ({
    ...p,
    reached: progress.is_completed || idx < progress.current_point,
  }));

  return (
    <>
      <div className="page-title">
        <h1>{imp.name}</h1>
        <Link to={`/impressions/${id}`}>← к впечатлению</Link>
      </div>
      <ErrorAlert error={typeof error === 'string' ? error : null} />
      {pointNotice && <div className="alert success">✅ {pointNotice}</div>}
      {progress.is_completed && !restarting && (
        <div className="alert success">
          🎉 Маршрут пройден! <Link to={`/impressions/${id}`}>Оставьте отзыв</Link>.{' '}
          <button className="btn secondary sm" style={{ marginLeft: 8 }} onClick={() => setRestarting(true)}>
            Пройти заново
          </button>
        </div>
      )}
      {progress.is_completed && restarting && (
        <div className="alert info">
          Отправьте свою позицию — прохождение начнётся с первой точки.
          <button className="btn secondary sm" style={{ marginLeft: 8 }} onClick={() => setRestarting(false)}>
            Отмена
          </button>
        </div>
      )}

      <div className="card">
        <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="btn-row">
            <span className={`badge ${wsState === 'connected' ? 'published' : 'on_moderation'}`}>
              {wsState === 'connected' ? 'На связи' : 'Подключение…'}
            </span>
            {!progress.is_completed && (
              <span>
                Пройдено <strong>{progress.current_point} из {points.length}</strong>
                {nextPoint && <> · следующая точка: <strong>{nextPoint.name}</strong></>}
                {distance != null && <> · до неё {distance >= 1000 ? `${(distance / 1000).toFixed(1)} км` : `${Math.round(distance)} м`}</>}
              </span>
            )}
          </div>
          <button className="btn" onClick={useGeolocation} disabled={!canSend || locating}>
            📍 {locating ? 'Определение…' : 'Моё местоположение'}
          </button>
        </div>
        <YandexMap
          points={mapPoints}
          position={position}
          height={420}
          onClick={canSend ? ({ latitude, longitude }) => send(latitude, longitude) : undefined}
        />
      </div>

      <div className="card">
        <h2>Точки маршрута</h2>
        {points.map((p, idx) => {
          const done = idx < progress.current_point || progress.is_completed;
          const current = idx === progress.current_point && !progress.is_completed;
          return (
            <div className="point-row" key={p.id}>
              <span className={`point-num ${done ? 'done' : current ? 'current' : ''}`}>
                {done ? '✓' : p.point_order}
              </span>
              <div>
                <strong>{p.name}</strong>
                {p.description && <span className="muted"> — {p.description}</span>}
                <div className="muted small">остановка {p.stay_minutes} мин</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
