import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { resolveTenant } from '../../middleware/tenant.js';
import { query, withTransaction } from '../../db/index.js';

export const restaurantRouter = Router();

// Public Restaurant Dynamic Branding & Settings
restaurantRouter.get('/restaurant', resolveTenant, (req: Request, res: Response) => {
  const r = req.restaurant!;
  const s = req.restaurantSettings!;

  res.json({
    restaurant: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      primary_domain: r.primary_domain,
      logo_url: r.logo_url,
      favicon_url: r.favicon_url,
      primary_color: r.primary_color,
      secondary_color: r.secondary_color,
      currency: r.currency,
      timezone: r.timezone,
      status: r.status,
    },
    settings: {
      tax_rate_percent: Number(s.tax_rate_percent),
      service_charge_percent: Number(s.service_charge_percent),
      packaging_charge_paise: s.packaging_charge_paise,
      dine_in_enabled: s.dine_in_enabled,
      takeaway_enabled: s.takeaway_enabled,
      loyalty_enabled: s.loyalty_enabled,
      loyalty_earn_ratio: Number(s.loyalty_earn_ratio),
    }
  });
});

// Public List of Dining Tables for Customer Table Selection
restaurantRouter.get('/tables', resolveTenant, async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT 
        dt.id,
        dt.table_number,
        dt.capacity,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.table_id = dt.id 
              AND o.restaurant_id = dt.restaurant_id 
              AND o.status NOT IN ('completed', 'cancelled', 'rejected')
          ) THEN 'occupied'
          WHEN dt.status = 'occupied' AND EXISTS (
            SELECT 1 FROM table_sessions ts 
            WHERE ts.table_id = dt.id AND ts.status != 'closed'
          ) THEN 'occupied'
          ELSE 'available'
        END as status,
        dt.is_active
       FROM dining_tables dt
       WHERE dt.restaurant_id = $1 AND dt.is_active = true AND dt.status != 'out_of_service'
       ORDER BY 
         CASE 
           WHEN dt.table_number ~ '^[0-9]+$' THEN LPAD(dt.table_number, 10, '0')
           WHEN dt.table_number ~ '^T-[0-9]+$' THEN LPAD(SUBSTRING(dt.table_number FROM 3), 10, '0')
           ELSE dt.table_number 
         END ASC`,
      [restaurant.id]
    );

    res.json({ tables: result.rows });
  } catch (err: any) {
    console.error('Public fetch tables error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch tables.' });
  }
});

// Resolve Opaque QR Token (Resolves directly to its associated restaurant and table)
restaurantRouter.get('/qr/resolve', async (req: Request, res: Response) => {
  const token = req.query.t as string;

  if (!token) {
    res.status(400).json({ error: 'MISSING_TOKEN', message: 'Valid opaque QR token is required.' });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const qrResult = await query(
      `SELECT 
        qt.*, 
        dt.table_number, 
        dt.capacity, 
        dt.status as table_status, 
        dt.is_active as table_active,
        r.id as restaurant_id,
        r.name as restaurant_name,
        r.slug as restaurant_slug,
        r.logo_url as restaurant_logo_url,
        r.primary_color as restaurant_primary_color,
        r.status as restaurant_status
       FROM table_qr_tokens qt
       JOIN dining_tables dt ON dt.id = qt.table_id
       JOIN restaurants r ON r.id = qt.restaurant_id
       WHERE qt.token_hash = $1 AND qt.is_revoked = false`,
      [tokenHash]
    );

    let qr = qrResult.rows[0];

    // If opaque hash didn't match, check if token is a direct table number/identifier on the tenant
    if (!qr) {
      const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '') as string;
      const hostClean = hostHeader.split(':')[0].toLowerCase();
      let tenantSlug = (req.headers['x-restaurant-slug'] || req.query.resto) as string;

      const isTunnelOrGeneric = 
        hostClean.includes('trycloudflare.com') ||
        hostClean.includes('loca.lt') ||
        hostClean.includes('ngrok') ||
        hostClean.includes('serveo.net') ||
        hostClean.includes('pinggy') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostClean);

      if (!tenantSlug && hostClean && !isTunnelOrGeneric) {
        const parts = hostClean.split('.');
        if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
          tenantSlug = parts[0];
        }
      }

      // Extract numeric digits for distinct numeric table matching (e.g. 1 -> 1, 10 -> 10, prevents 1 vs 10 overlap)
      const rawDigits = token.replace(/\D/g, '');
      const tableNumInt = rawDigits ? parseInt(rawDigits, 10) : null;

      // Query dining_tables matching exact table number or formatted table number
      const tableQuery = `
        SELECT 
          dt.id as table_id, 
          dt.table_number, 
          dt.capacity, 
          dt.status as table_status, 
          dt.is_active as table_active,
          r.id as restaurant_id,
          r.name as restaurant_name,
          r.slug as restaurant_slug,
          r.logo_url as restaurant_logo_url,
          r.primary_color as restaurant_primary_color,
          r.status as restaurant_status
        FROM dining_tables dt
        JOIN restaurants r ON r.id = dt.restaurant_id
        WHERE (r.slug = $1 OR r.primary_domain = $2 OR ($1 IS NULL AND r.status != 'deleted'))
          AND (
            LOWER(dt.table_number) = LOWER($3)
            OR ($4::integer IS NOT NULL AND (regexp_replace(dt.table_number, '[^0-9]', '', 'g'))::integer = $4::integer)
            OR dt.id::text = $3
          )
        ORDER BY CASE WHEN r.slug = 'royalspice' THEN 0 ELSE 1 END, r.created_at ASC
        LIMIT 1
      `;
      const tableResult = await query(tableQuery, [tenantSlug || null, hostClean, token.trim(), tableNumInt]);
      if (tableResult.rows.length > 0) {
        qr = tableResult.rows[0];
      }
    }

    if (!qr) {
      res.status(404).json({ error: 'INVALID_QR', message: 'This QR code is invalid or has been revoked.' });
      return;
    }

    if (qr.restaurant_status === 'suspended') {
      res.status(403).json({
        error: 'RESTAURANT_SUSPENDED',
        message: `Service for "${qr.restaurant_name}" is temporarily suspended.`
      });
      return;
    }

    if (!qr.table_active || qr.table_status === 'out_of_service') {
      res.status(403).json({ error: 'TABLE_UNAVAILABLE', message: 'This table is currently unavailable for ordering.' });
      return;
    }

    // Resolve or create active table session atomically
    const session = await withTransaction(async (client) => {
      let activeSession = await client.query(
        `SELECT * FROM table_sessions 
         WHERE restaurant_id = $1 AND table_id = $2 AND status IN ('open', 'bill_requested', 'bill_generated')
         ORDER BY opened_at DESC LIMIT 1`,
        [qr.restaurant_id, qr.table_id]
      );

      if (activeSession.rows.length === 0) {
        // Ensure any past non-closed sessions are marked closed
        await client.query(
          `UPDATE table_sessions SET status = 'closed', closed_at = COALESCE(closed_at, now())
           WHERE restaurant_id = $1 AND table_id = $2 AND status != 'closed'`,
          [qr.restaurant_id, qr.table_id]
        );

        activeSession = await client.query(
          `INSERT INTO table_sessions (restaurant_id, table_id, status)
           VALUES ($1, $2, 'open')
           RETURNING *`,
          [qr.restaurant_id, qr.table_id]
        );

        // Update table status to occupied
        await client.query(
          `UPDATE dining_tables SET status = 'occupied' WHERE id = $1`,
          [qr.table_id]
        );
      }

      return activeSession.rows[0];
    });

    res.json({
      valid: true,
      restaurant: {
        id: qr.restaurant_id,
        name: qr.restaurant_name,
        slug: qr.restaurant_slug,
        logo_url: qr.restaurant_logo_url,
        primary_color: qr.restaurant_primary_color
      },
      table: {
        id: qr.table_id,
        table_number: qr.table_number,
        capacity: qr.capacity
      },
      session: {
        id: session.id,
        status: session.status,
        opened_at: session.opened_at
      }
    });
  } catch (err: any) {
    console.error('QR resolve error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to resolve QR token.' });
  }
});
