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

export const StaffAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('staff_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    staffAuthApi.getMe()
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem('staff_token');
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string): Promise<StaffUser> => {
    const res = await staffAuthApi.login(email, password);
    localStorage.setItem('staff_token', res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
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
