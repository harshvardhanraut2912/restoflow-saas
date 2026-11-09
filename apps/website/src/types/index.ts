export interface RestaurantIdentity {
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
}

export interface RestaurantSettings {
  tax_rate_percent: number;
  service_charge_percent: number;
  packaging_charge_paise: number;
  dine_in_enabled: boolean;
  takeaway_enabled: boolean;
  loyalty_enabled: boolean;
  loyalty_earn_ratio: number;
}

export interface MenuItemModifier {
  id: string;
  name: string;
  price_paise: number;
}

export interface MenuItemModifierGroup {
  id: string;
  name: string;
  min_selection: number;
  max_selection: number;
  is_required: boolean;
  modifiers: MenuItemModifier[];
}

export interface MenuItemVariant {
  id: string;
  name: string;
  price_paise: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price_paise: number;
  image_url: string | null;
  dietary_type: 'veg' | 'non_veg' | 'egg' | 'vegan';
  preparation_time_minutes: number;
  is_available: boolean;
  sort_order: number;
  variants?: MenuItemVariant[];
  modifier_groups?: MenuItemModifierGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  items: MenuItem[];
}

export interface CartItem {
  id: string; // unique cart entry id
  menuItem: MenuItem;
  selectedVariant?: MenuItemVariant;
  selectedModifiers: MenuItemModifier[];
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
}

export interface StaffUser {
  id: string;
  restaurantId: string;
  restaurantName: string;
  email: string;
  fullName: string;
  role: 'manager' | 'waiter' | 'kitchen';
}
