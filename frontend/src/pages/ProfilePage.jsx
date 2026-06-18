import { useEffect, useState } from 'react';
import { api, formatDate } from '../api';
import { ErrorAlert, Loading } from '../components/ui';

const ROLE_LABELS = {
  user: 'Пользователь',
  author: 'Верифицированный автор',
  admin: 'Администратор',
};

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/users/me')
      .then(setMe)
      .catch(setError);
  }, []);

  if (error) return <ErrorAlert error={error} />;
  if (!me) return <Loading />;

  return (
    <>
      <h1>Профиль</h1>
      <div className="card" style={{ maxWidth: 520 }}>
        <table className="data">
          <tbody>
            <tr><th>ID</th><td>{me.id}</td></tr>
            <tr><th>Имя пользователя</th><td>{me.username}</td></tr>
            <tr><th>Email</th><td>{me.email}</td></tr>
            <tr><th>Роль</th><td><span className="badge role">{ROLE_LABELS[me.role] || me.role}</span></td></tr>
            <tr><th>Блокировка</th><td>{me.is_blocked ? 'Заблокирован' : 'Активен'}</td></tr>
            <tr><th>Зарегистрирован</th><td>{formatDate(me.created_at)}</td></tr>
            <tr><th>Обновлён</th><td>{formatDate(me.updated_at)}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
