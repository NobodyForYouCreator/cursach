import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert } from '../components/ui';

export default function RegisterPage() {
  const { applyAuth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: form, auth: false });
      applyAuth(data);
      navigate('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>Регистрация</h2>
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <label className="field">
          <span>Имя пользователя</span>
          <input type="text" value={form.username} onChange={set('username')} required />
          <span className="hint">3–30 символов: латинские буквы, цифры, подчёркивание</span>
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" value={form.password} onChange={set('password')} required />
          <span className="hint">8–64 символа, минимум одна буква, цифра и спецсимвол</span>
        </label>
        <div className="btn-row">
          <button className="btn" disabled={busy}>Создать аккаунт</button>
          <span className="muted small">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </span>
        </div>
      </form>
    </div>
  );
}
