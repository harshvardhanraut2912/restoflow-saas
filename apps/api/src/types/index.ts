import { Request } from 'express';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  primary_domain: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  currency: string;
  timezone: string;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface RestaurantSettings {
  restaurant_id: string;
  tax_rate_percent: number;
  service_charge_percent: number;
  packaging_charge_paise: number;
  dine_in_enabled: boolean;
  takeaway_enabled: boolean;
  auto_accept_orders: boolean;
  loyalty_enabled: boolean;
  loyalty_earn_ratio: number;
}

export interface StaffUser {
  id: string;
  restaurant_id: string;
  email: string;
  full_name: string;
  role: 'manager' | 'waiter' | 'kitchen';
  is_active: boolean;
}

export interface DevAdminPayload {
  role: 'devadmin';
  email: string;
}

export interface StaffAuthPayload {
  userId: string;
  restaurantId: string;
  role: 'manager' | 'waiter' | 'kitchen';
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      restaurant?: Restaurant;
      restaurantSettings?: RestaurantSettings;
      staff?: StaffAuthPayload;
      devadmin?: DevAdminPayload;
    }
  }
}
