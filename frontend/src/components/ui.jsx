import { Link } from 'react-router-dom';
import { formatApiError, formatPrice } from '../api';

const STATUS_LABELS = {
  draft: 'Черновик',
  on_moderation: 'На модерации',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  archived: 'В архиве',
  created: 'Создана',
  paid: 'Оплачена',
  failed: 'Ошибка оплаты',
};

export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  return <div className="alert error">{typeof error === 'string' ? error : formatApiError(error)}</div>;
}

export function SuccessAlert({ message }) {
  if (!message) return null;
  return <div className="alert success">{message}</div>;
}

export function Loading() {
  return <div className="empty">Загрузка…</div>;
}

export function Empty({ children = 'Ничего не найдено' }) {
  return <div className="empty">{children}</div>;
}

export function Stars({ rating }) {
  const filled = Math.round(rating);
  return (
    <span className="rating-stars" title={`Рейтинг: ${rating}`}>
      {'★'.repeat(filled)}
      {'☆'.repeat(5 - filled)} {Number(rating).toFixed(1)}
    </span>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn secondary sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Назад
      </button>
      <span className="muted small">
        Стр. {page} из {pages} (всего {total})
      </span>
      <button className="btn secondary sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Вперёд →
      </button>
    </div>
  );
}

export function ImpressionCard({ imp, showScore }) {
  return (
    <div className="card imp-card">
      <div className="cover">🏞️</div>
      <h3>
        <Link to={`/impressions/${imp.id}`}>{imp.name}</Link>
      </h3>
      <div className="desc">{imp.description}</div>
      <div className="meta">
        <span className="price-tag">{formatPrice(imp.price)}</span>
        <Stars rating={imp.rating} />
        <span title="Популярность">🔥 {imp.popularity_score}</span>
        {showScore && imp.score !== undefined && (
          <span className="chip" title="Оценка подборки: учитывает рейтинг и популярность">
            оценка {imp.score}
          </span>
        )}
      </div>
    </div>
  );
}

export function CitySelect({ value, onChange, cities, allowEmpty = true, emptyLabel = 'Все города' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {cities.map((c) => (
        <option key={c.external_city_id} value={c.external_city_id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
