import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatDuration, formatPrice } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorAlert, Loading, Pager, Stars, StatusBadge, SuccessAlert } from '../components/ui';
import YandexMap from '../components/YandexMap';

const REVIEWS_PAGE_SIZE = 5;

function ReviewForm({ impressionId, onCreated }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/impressions/${impressionId}/reviews`, {
        method: 'POST',
        body: { rating: Number(rating), comment },
      });
      setComment('');
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3>Оставить отзыв</h3>
      <p className="hint">Отзыв можно оставить только после полного прохождения впечатления.</p>
      <ErrorAlert error={error} />
      <div className="form-row">
        <label className="field" style={{ flex: '0 0 120px' }}>
          <span>Оценка</span>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            {[5, 4, 3, 2, 1].map((v) => (
              <option key={v} value={v}>{'★'.repeat(v)}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Комментарий</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} required maxLength={1000} />
        </label>
      </div>
      <button className="btn" disabled={busy}>Отправить отзыв</button>
    </form>
  );
}

export default function ImpressionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [imp, setImp] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState(null);
  const [reviewsPage, setReviewsPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setImp(await api(`/bff/impressions/${id}`));
    } catch (err) {
      setError(err);
    }
  }, [id]);

  const loadReviews = useCallback(async () => {
    try {
      setReviews(
        await api(`/impressions/${id}/reviews`, {
          params: { page: reviewsPage, page_size: REVIEWS_PAGE_SIZE },
        })
      );
    } catch {
      setReviews(null);
    }
  }, [id, reviewsPage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  async function buy() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await api('/purchases', { method: 'POST', body: { impression_id: Number(id) } });
      setNotice('Покупка создана. Теперь её нужно оплатить.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function pay(success) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const purchase = await api(`/purchases/${imp.purchase.id}/pay`, {
        method: 'POST',
        body: { success },
      });
      setNotice(purchase.status === 'paid' ? 'Оплата прошла успешно!' : 'Платёж отклонён.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (error && !imp) return <ErrorAlert error={error} />;
  if (!imp) return <Loading />;

  const route = imp.route;
  const isFree = Number(imp.price) === 0;
  const isAuthorOrAdmin = user && (user.id === imp.author_id || user.role === 'admin');
  const hasPaid = imp.purchase?.status === 'paid';
  const canWalk = user && imp.status === 'published' && (isFree || hasPaid || isAuthorOrAdmin);

  return (
    <>
      <div className="page-title">
        <h1>{imp.name}</h1>
        <StatusBadge status={imp.status} />
      </div>
      <div className="muted small" style={{ marginBottom: 12 }}>
        Впечатление #{imp.id} · автор #{imp.author_id} · создано {formatDate(imp.created_at)}
      </div>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      {imp.moderation_comment && (
        <div className="mod-comment">Комментарий модератора: {imp.moderation_comment}</div>
      )}

      <div className="card">
        <p>{imp.description}</p>
        <div className="btn-row" style={{ gap: 18 }}>
          <span className="price-tag" style={{ fontSize: 20 }}>{formatPrice(imp.price)}</span>
          <Stars rating={imp.rating} />
          <span title="Популярность">🔥 Популярность: {imp.popularity_score}</span>
        </div>
      </div>

      <div className="card">
        <h2>Покупка и прохождение</h2>
        {!user ? (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы купить и пройти это впечатление.
          </p>
        ) : (
          <>
            {imp.purchase && (
              <p>
                Ваша покупка: <StatusBadge status={imp.purchase.status} /> на сумму{' '}
                {formatPrice(imp.purchase.price_at_purchase)} от {formatDate(imp.purchase.created_at)}
              </p>
            )}
            <div className="btn-row">
              {isFree && <span className="badge published">Бесплатное впечатление</span>}
              {!isFree && !imp.purchase && (
                <button className="btn" onClick={buy} disabled={busy || imp.status !== 'published'}>
                  Купить за {formatPrice(imp.price)}
                </button>
              )}
              {imp.purchase && imp.purchase.status !== 'paid' && (
                <>
                  <button className="btn success" onClick={() => pay(true)} disabled={busy}>
                    Оплатить (успех)
                  </button>
                  <button className="btn danger" onClick={() => pay(false)} disabled={busy}>
                    Оплатить (неудача)
                  </button>
                </>
              )}
              {canWalk && (
                <Link className="btn" to={`/impressions/${imp.id}/walk`}>
                  🚶 Пройти маршрут
                </Link>
              )}
            </div>
            {!canWalk && !isFree && !hasPaid && (
              <p className="hint">Прохождение доступно после оплаты покупки.</p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Маршрут: {route.name}</h2>
        <p className="muted">{route.description}</p>
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <span>⏱ {formatDuration(route.duration_minutes)}</span>
          <div className="chips">
            {route.cities.map((c) => (
              <span key={c.external_city_id} className="chip">{c.name}</span>
            ))}
          </div>
        </div>
        {route.points.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <YandexMap points={route.points} height={340} />
          </div>
        )}
        <h3>Точки маршрута ({route.points.length})</h3>
        {route.points.length === 0 ? (
          <Empty>Точки не добавлены</Empty>
        ) : (
          route.points.map((p) => (
            <div className="point-row" key={p.id}>
              <span className="point-num">{p.point_order}</span>
              <div>
                <strong>{p.name}</strong>
                {p.description && <span className="muted"> — {p.description}</span>}
                <div className="muted small">
                  {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · остановка {p.stay_minutes} мин
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Отзывы {reviews ? `(${reviews.total})` : ''}</h2>
        {!reviews || reviews.items.length === 0 ? (
          <Empty>Отзывов пока нет</Empty>
        ) : (
          <>
            {reviews.items.map((r) => (
              <div className="review" key={r.id}>
                <div>
                  <strong>{r.username || `пользователь #${r.user_id}`}</strong>{' '}
                  <span className="rating-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>{' '}
                  <span className="muted small">{formatDate(r.created_at)}</span>
                </div>
                <div>{r.comment}</div>
              </div>
            ))}
            <Pager page={reviewsPage} pageSize={REVIEWS_PAGE_SIZE} total={reviews.total} onPage={setReviewsPage} />
          </>
        )}
        {user && imp.status === 'published' && (
          <ReviewForm impressionId={imp.id} onCreated={() => { loadReviews(); load(); }} />
        )}
      </div>
    </>
  );
}
