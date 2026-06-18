import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert } from '../components/ui';

export default function LoginPage() {
  const { applyAuth } = useAuth();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { login, password }, auth: false });
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
      <h2>Вход</h2>
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <label className="field">
          <span>Email или имя пользователя</span>
          <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} required minLength={3} />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <div className="btn-row">
          <button className="btn" disabled={busy}>Войти</button>
          <span className="muted small">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </span>
        </div>
      </form>
    </div>
  );
}
