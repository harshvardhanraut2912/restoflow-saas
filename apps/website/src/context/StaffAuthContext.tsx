import React, { createContext, useContext, useEffect, useState } from 'react';
import { StaffUser } from '../types/index.js';
import { staffAuthApi } from '../services/api.js';

interface StaffAuthContextType {
  user: StaffUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<StaffUser>;
  logout: () => void;
  isAuthenticated: boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

// ─── Tab-Isolated Staff Session Storage ───────────────────────────────────────
// Use sessionStorage so each browser tab has its own login session.
// Opening a new tab and logging in as Kitchen won't overwrite the Waiter tab.
const SESSION_KEY = 'staff_token';
const getToken = () => sessionStorage.getItem(SESSION_KEY);
const setToken = (t: string) => sessionStorage.setItem(SESSION_KEY, t);
const clearToken = () => sessionStorage.removeItem(SESSION_KEY);

export const StaffAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Also check localStorage for a backward-compat migration:
    // If old token exists in localStorage, move it to sessionStorage for this tab
    const legacyToken = localStorage.getItem('staff_token');
    if (legacyToken && !getToken()) {
      setToken(legacyToken);
      localStorage.removeItem('staff_token');
    }

    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    staffAuthApi.getMe()
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string): Promise<StaffUser> => {
    const res = await staffAuthApi.login(email, password);
    // Store in sessionStorage (tab-isolated), NOT localStorage (shared across tabs)
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    window.location.href = '/s/login';
  };

  return (
    <StaffAuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
};

export const useStaffAuth = () => {
  const context = useContext(StaffAuthContext);
  if (!context) throw new Error('useStaffAuth must be used within StaffAuthProvider');
  return context;
};
