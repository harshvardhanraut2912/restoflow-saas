import { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { Restaurant, RestaurantSettings } from '../types/index.js';

export async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customId = req.headers['x-restaurant-id'] as string;
    const customSlug = req.headers['x-restaurant-slug'] as string;
    const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '') as string;
    const hostClean = hostHeader.split(':')[0].toLowerCase();

    let restaurant: Restaurant | null = null;

    if (customId) {
      const result = await query<Restaurant>('SELECT * FROM restaurants WHERE id = $1', [customId]);
      if (result.rows.length > 0) {
        restaurant = result.rows[0];
      }
    }

    if (!restaurant && customSlug) {
      const result = await query<Restaurant>('SELECT * FROM restaurants WHERE slug = $1', [customSlug.toLowerCase()]);
      if (result.rows.length > 0) {
        restaurant = result.rows[0];
      }
    }

    // Try host matching
    if (!restaurant && hostClean) {
      // Direct primary_domain match
      let result = await query<Restaurant>('SELECT * FROM restaurants WHERE primary_domain = $1', [hostClean]);
      if (result.rows.length > 0) {
        restaurant = result.rows[0];
      } else {
        // Subdomain extraction e.g. "bistro.localhost" -> "bistro"
        const parts = hostClean.split('.');
        if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
          const subSlug = parts[0];
          result = await query<Restaurant>('SELECT * FROM restaurants WHERE slug = $1', [subSlug]);
          if (result.rows.length > 0) {
            restaurant = result.rows[0];
          }
        }
      }
    }

    // If still no restaurant resolved, check if there's only 1 active restaurant in DB as fallback for development
    if (!restaurant) {
      const countRes = await query<Restaurant>('SELECT * FROM restaurants WHERE status != \'deleted\' ORDER BY created_at ASC LIMIT 1');
      if (countRes.rows.length > 0) {
        restaurant = countRes.rows[0];
      }
    }

    if (!restaurant) {
      res.status(404).json({
        error: 'RESTAURANT_NOT_FOUND',
        message: 'No active restaurant found for this domain or identifier.'
      });
      return;
    }

    // Check restaurant status (Pausing/Suspended capability requested by user)
    if (restaurant.status === 'suspended') {
      res.status(403).json({
        error: 'RESTAURANT_SUSPENDED',
        message: `Service for "${restaurant.name}" is temporarily suspended. Please contact management.`
      });
      return;
    }

    if (restaurant.status === 'deleted') {
      res.status(404).json({
        error: 'RESTAURANT_DELETED',
        message: 'This restaurant is no longer available.'
      });
      return;
    }

    // Load restaurant settings
    const settingsRes = await query<RestaurantSettings>(
      'SELECT * FROM restaurant_settings WHERE restaurant_id = $1',
      [restaurant.id]
    );

    req.restaurant = restaurant;
    req.restaurantSettings = settingsRes.rows[0] || {
      restaurant_id: restaurant.id,
      tax_rate_percent: 5.0,
      service_charge_percent: 0.0,
      packaging_charge_paise: 0,
      dine_in_enabled: true,
      takeaway_enabled: true,
      auto_accept_orders: false,
      loyalty_enabled: true,
      loyalty_earn_ratio: 1.0
    };

    next();
  } catch (err: any) {
    console.error('Tenant resolution error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to resolve restaurant tenant.' });
  }
}
