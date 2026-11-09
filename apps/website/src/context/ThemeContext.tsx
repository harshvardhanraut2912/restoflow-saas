import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isCustomerRoute: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isCustomerRoute = location.pathname.startsWith('/u/');

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('smartresto_staff_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;

    // "keep the customer parts always bright"
    if (isCustomerRoute) {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      if (theme === 'dark') {
        root.classList.remove('light');
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    }
  }, [theme, isCustomerRoute, location.pathname]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('smartresto_staff_theme', next);
      return next;
    });
  };

  const setTheme = (mode: ThemeMode) => {
    localStorage.setItem('smartresto_staff_theme', mode);
    setThemeState(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isCustomerRoute }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
