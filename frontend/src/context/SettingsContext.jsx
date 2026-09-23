import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';

const DEFAULTS = { schoolName: 'School of Information Science and Technology', logo: null };
const SettingsContext = createContext({ settings: DEFAULTS, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const refresh = useCallback(() => {
    api
      .get('/settings/public')
      .then(({ data }) => setSettings({ ...DEFAULTS, ...data }))
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
