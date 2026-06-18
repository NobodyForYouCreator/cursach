export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const KNOWN_CITIES = [
  { external_city_id: 'msk', name: 'Москва' },
  { external_city_id: 'spb', name: 'Санкт-Петербург' },
  { external_city_id: 'kzn', name: 'Казань' },
  { external_city_id: 'ekb', name: 'Екатеринбург' },
  { external_city_id: 'nsk', name: 'Новосибирск' },
  { external_city_id: 'kgd', name: 'Калининград' },
];

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getToken() {
  return localStorage.getItem('travel_token');
}

export async function api(path, { method = 'GET', body, params, auth = true } = {}) {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Бекенд недоступен. Проверьте, что сервер запущен.', 0);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* пустое тело */
  }

  if (!response.ok || !payload || payload.status !== 'success') {
    const message = payload?.error?.message || `Ошибка ${response.status}`;
    throw new ApiError(message, response.status, payload?.error?.details);
  }
  return payload.data;
}

export function formatApiError(err) {
  if (err instanceof ApiError && Array.isArray(err.details) && err.details.length) {
    return err.details.map((d) => `${d.field}: ${d.message}`).join('; ');
  }
  return err?.message || 'Неизвестная ошибка';
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatPrice(value) {
  const num = Number(value);
  if (num === 0) return 'Бесплатно';
  return `${num.toLocaleString('ru-RU')} ₽`;
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}
