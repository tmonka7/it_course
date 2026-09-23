import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api';
import { hasPermission } from '../permissions';
import { hasSavedLanguage, useLanguage } from '../i18n';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));
  const { setLang } = useLanguage();

  // Use the language saved on the account unless this browser already has a choice.
  const adopt = useCallback(
    (u) => {
      setUser(u);
      if (u?.language && !hasSavedLanguage()) setLang(u.language);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Re-read the account when the window regains focus, so permission changes apply without signing out.
  useEffect(() => {
    const onFocus = () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      api
        .get('/auth/me')
        .then(({ data }) => setUser(data))
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get('/auth/me')
      .then(({ data }) => adopt(data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (values) => {
    const { data } = await api.post('/auth/login', values);
    localStorage.setItem(TOKEN_KEY, data.token);
    adopt(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const can = useCallback((page, action = 'view') => hasPermission(user, page, action), [user]);

  const value = useMemo(
    // updateUser: replace the signed-in user after they edit their own profile.
    () => ({ user, loading, login, logout, can, updateUser: setUser, isAdmin: user?.role === 'admin' }),
    [user, loading, login, logout, can]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
