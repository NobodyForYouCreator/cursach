import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('travel_token'));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('travel_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const applyAuth = useCallback((tokenData) => {
    const { access_token, user_id, username, email, role } = tokenData;
    const userData = { id: user_id, username, email, role };
    localStorage.setItem('travel_token', access_token);
    localStorage.setItem('travel_user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('travel_token');
    localStorage.removeItem('travel_user');
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('travel_token')) return;
    try {
      const me = await api('/users/me');
      const userData = { id: me.id, username: me.username, email: me.email, role: me.role };
      localStorage.setItem('travel_user', JSON.stringify(userData));
      setUser(userData);
    } catch (err) {
      if (err.status === 401 || err.status === 403) logout();
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const value = useMemo(
    () => ({ token, user, applyAuth, logout, refreshUser, isAdmin: user?.role === 'admin' }),
    [token, user, applyAuth, logout, refreshUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
