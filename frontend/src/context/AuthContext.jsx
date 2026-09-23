import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (values) => {
    const { data } = await api.post('/auth/login', values);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, isAdmin: user?.role === 'admin' }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
