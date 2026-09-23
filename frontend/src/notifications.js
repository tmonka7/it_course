import api from './api';

// Fired after notifications are read so the header bell and the Notifications page stay in sync.
const CHANGED = 'notifications:changed';

export const onNotificationsChanged = (fn) => {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
};

const changed = () => window.dispatchEvent(new Event(CHANGED));

export const fetchMyNotifications = (limit = 20) => api.get('/notifications/mine', { params: { limit } }).then((r) => r.data);

export const markRead = (id) => api.post(`/notifications/${id}/read`).then(changed);

export const markAllRead = () => api.post('/notifications/read-all').then(changed);

export const NOTIFICATION_COLORS = { Info: '#2f7bf5', Success: '#16a34a', Warning: '#f08a24', Alert: '#ef4444' };
