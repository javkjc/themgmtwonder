'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { apiFetchJson } from '../lib/api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setThemeFromServer: (serverTheme: Theme, options?: { force?: boolean }) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const lastSourceRef = useRef<'default' | 'server' | 'user'>('default');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setThemeFromServer = (serverTheme: Theme, options?: { force?: boolean }) => {
    if (!options?.force && lastSourceRef.current === 'user' && serverTheme !== theme) {
      return;
    }
    lastSourceRef.current = 'server';
    setTheme(serverTheme);
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    lastSourceRef.current = 'user';
    setTheme(newTheme);

    // Save to server (will fail gracefully if not logged in)
    try {
      await apiFetchJson('/auth/theme', {
        method: 'PATCH',
        body: JSON.stringify({ theme: newTheme }),
      });
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeFromServer }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
