import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ShowcasePage from './pages/ShowcasePage';
import ImpressionDetailPage from './pages/ImpressionDetailPage';
import WalkPage from './pages/WalkPage';
import RoutesPage from './pages/RoutesPage';
import RouteEditPage from './pages/RouteEditPage';
import MyImpressionsPage from './pages/MyImpressionsPage';
import PurchasesPage from './pages/PurchasesPage';
import RecommendationsPage from './pages/RecommendationsPage';
import PlacesPage from './pages/PlacesPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

function HealthDot() {
  const [state, setState] = useState('unknown');
  useEffect(() => {
    let alive = true;
    const check = () =>
      api('/health', { auth: false })
        .then(() => alive && setState('ok'))
        .catch(() => alive && setState('fail'));
    check();
    const timer = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const title = state === 'ok' ? 'Бекенд доступен' : state === 'fail' ? 'Бекенд недоступен' : 'Проверка…';
  return <span className={`health-dot ${state}`} title={title} />;
}

function RequireAuth({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <header className="navbar">
        <NavLink to="/" className="brand">
          🧭 Travel
        </NavLink>
        <nav>
          <NavLink to="/" end>Главная</NavLink>
          <NavLink to="/showcase">Витрина</NavLink>
          <NavLink to="/recommendations">Рекомендации</NavLink>
          <NavLink to="/places">Места</NavLink>
          {user && <NavLink to="/routes">Мои маршруты</NavLink>}
          {user && <NavLink to="/my-impressions">Мои впечатления</NavLink>}
          {user && <NavLink to="/purchases">Покупки</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Админка</NavLink>}
        </nav>
        <div className="spacer" />
        <div className="nav-user">
          <HealthDot />
          {user ? (
            <>
              <NavLink to="/profile" style={{ color: '#fff', fontWeight: 600 }}>
                {user.username}
              </NavLink>
              <span className="badge role">{user.role}</span>
              <button
                className="btn secondary sm"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" style={{ color: '#fff' }}>Войти</NavLink>
              <NavLink to="/register" style={{ color: '#fff' }}>Регистрация</NavLink>
            </>
          )}
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/showcase" element={<ShowcasePage />} />
          <Route path="/impressions/:id" element={<ImpressionDetailPage />} />
          <Route path="/impressions/:id/walk" element={<RequireAuth><WalkPage /></RequireAuth>} />
          <Route path="/routes" element={<RequireAuth><RoutesPage /></RequireAuth>} />
          <Route path="/routes/:id" element={<RequireAuth><RouteEditPage /></RequireAuth>} />
          <Route path="/my-impressions" element={<RequireAuth><MyImpressionsPage /></RequireAuth>} />
          <Route path="/purchases" element={<RequireAuth><PurchasesPage /></RequireAuth>} />
          <Route path="/recommendations" element={<RequireAuth><RecommendationsPage /></RequireAuth>} />
          <Route path="/places" element={<PlacesPage />} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
