import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

const STORAGE_KEY = 'icloud_theme'; // 'system' | 'light' | 'dark'
const DARK_QUERY = '(prefers-color-scheme: dark)';

const getSystemDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(DARK_QUERY).matches
    : false;

const getStoredTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
};

export function ThemeProvider({ children }) {
  // Default is "system": follows the Android system theme automatically
  const [theme, setThemeState] = useState(getStoredTheme);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  // Live-update when the Android system theme changes
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (e) => setSystemDark(e.matches);
    setSystemDark(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  const darkMode = theme === 'system' ? systemDark : theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch { /* storage unavailable */ }
  }, []);

  const toggleDarkMode = useCallback(
    () => setTheme(darkMode ? 'light' : 'dark'),
    [darkMode, setTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}