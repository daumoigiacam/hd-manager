import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  normalizeHDThemePreference,
  readHDThemePreference,
  resolveHDTheme,
  writeHDThemePreference,
} from './themePreferences.js';

const HDThemeContext = createContext({
  preference: 'system',
  theme: 'light',
  setPreference: () => {},
});

function readSystemDarkPreference() {
  try {
    return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

export function HDThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readHDThemePreference);
  const [prefersDark, setPrefersDark] = useState(readSystemDarkPreference);
  const theme = resolveHDTheme(preference, prefersDark);

  useEffect(() => {
    let mediaQuery;
    try {
      mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    } catch {
      mediaQuery = null;
    }
    if (!mediaQuery) return undefined;

    const handleChange = (event) => setPrefersDark(Boolean(event.matches));
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleChange);
    else mediaQuery.addListener?.(handleChange);
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', handleChange);
      else mediaQuery.removeListener?.(handleChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.hdTheme = theme;
    root.style.colorScheme = theme;
    if (document.body) {
      document.body.dataset.hdTheme = theme;
      document.body.style.colorScheme = theme;
    }
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === 'hd_manager_theme_preference') {
        setPreferenceState(normalizeHDThemePreference(event.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setPreference = useCallback((value) => {
    setPreferenceState(writeHDThemePreference(value));
  }, []);
  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);

  return <HDThemeContext.Provider value={value}>{children}</HDThemeContext.Provider>;
}

export function useHDTheme() {
  return useContext(HDThemeContext);
}
