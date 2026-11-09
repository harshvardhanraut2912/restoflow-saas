import React, { createContext, useContext, useEffect, useState } from 'react';
import { RestaurantIdentity, RestaurantSettings } from '../types/index.js';
import { publicApi, ApiError, getActiveSubdomainSlug } from '../services/api.js';

interface TenantContextType {
  restaurant: RestaurantIdentity | null;
  settings: RestaurantSettings | null;
  isLoading: boolean;
  isSuspended: boolean;
  suspendedMessage: string;
  error: string | null;
  switchTenant: (slug: string) => void;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [restaurant, setRestaurant] = useState<RestaurantIdentity | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedMessage, setSuspendedMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadTenant = async () => {
    setIsLoading(true);
    setIsSuspended(false);
    setError(null);

    try {
      const subdomain = getActiveSubdomainSlug();
      const data = await publicApi.getRestaurant(subdomain || undefined);
      setRestaurant(data.restaurant);
      setSettings(data.settings);
      localStorage.setItem('active_tenant_slug', data.restaurant.slug);
      localStorage.setItem('active_tenant_id', data.restaurant.id);

      // Update page title and favicon dynamically
      document.title = `${data.restaurant.name} | Dine-In & QR Ordering`;
      if (data.restaurant.favicon_url) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = data.restaurant.favicon_url;
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'RESTAURANT_SUSPENDED') {
        setIsSuspended(true);
        setSuspendedMessage(err.message);
      } else {
        setError(err.message || 'Failed to connect to restaurant.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // If route is DevAdmin, don't block on tenant resolution
    if (window.location.pathname.startsWith('/d/devadmin')) {
      setIsLoading(false);
      return;
    }
    loadTenant();
  }, []);

  const switchTenant = (slug: string) => {
    localStorage.setItem('active_tenant_slug', slug);
    localStorage.removeItem('active_tenant_id');
    // Clear staff session when switching tenants
    localStorage.removeItem('staff_token');
    window.location.reload();
  };

  return (
    <TenantContext.Provider
      value={{
        restaurant,
        settings,
        isLoading,
        isSuspended,
        suspendedMessage,
        error,
        switchTenant,
        refreshTenant: loadTenant
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant must be used within TenantProvider');
  return context;
};
