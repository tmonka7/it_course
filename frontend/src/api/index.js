import axios from 'axios';
import { t } from '../i18n';

export const TOKEN_KEY = 'sist_token';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

// Server messages are English; fixed ones are translated through the dictionary (others show as sent).
export const errMsg = (err) => t(err?.response?.data?.message || err?.message || 'Something went wrong');

export default api;
