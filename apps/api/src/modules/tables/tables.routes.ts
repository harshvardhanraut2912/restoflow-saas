import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';
import { env } from '../../config/env.js';

export const tablesRouter = Router();

// List tables for staff/manager
tablesRouter.get('/', resolveTenant, requireStaff(['manager', 'waiter']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT 
        dt.id,
        dt.restaurant_id,
        dt.table_number,
        dt.capacity,
        dt.is_active,
        dt.created_at,
        CASE WHEN ts.id IS NULL THEN 'available' ELSE dt.status END as status,
        ts.id as active_session_id,
        ts.status as session_status,
        ts.opened_at as session_opened_at,
        tqr.token_hash as active_qr_hash
       FROM dining_tables dt
       LEFT JOIN LATERAL (
         SELECT id, status, opened_at FROM table_sessions 
         WHERE table_id = dt.id AND status != 'closed'
         ORDER BY opened_at DESC LIMIT 1
       ) ts ON true
       LEFT JOIN LATERAL (
         SELECT token_hash FROM table_qr_tokens 
         WHERE table_id = dt.id AND is_revoked = false
         ORDER BY created_at DESC LIMIT 1
       ) tqr ON true
       WHERE dt.restaurant_id = $1 AND dt.is_active = true
       ORDER BY dt.table_number ASC`,
      [restaurant.id]
    );

    res.json({ tables: result.rows });
  } catch (err: any) {
    console.error('Fetch tables error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch tables.' });
  }
});

// Manager Create Table
tablesRouter.post('/', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { table_number, capacity } = req.body;
  const restaurant = req.restaurant!;

  if (!table_number) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Table number is required.' });
    return;
  }

  try {
    const newTable = await withTransaction(async (client) => {
      // 1. Insert Table
      const tRes = await client.query(
        `INSERT INTO dining_tables (restaurant_id, table_number, capacity, status)
         VALUES ($1, $2, $3, 'available')
         RETURNING *`,
        [restaurant.id, table_number.trim(), capacity || 4]
      );
      const table = tRes.rows[0];

      // 2. Automatically generate initial opaque QR token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await client.query(
        `INSERT INTO table_qr_tokens (restaurant_id, table_id, token_hash)
         VALUES ($1, $2, $3)`,
        [restaurant.id, table.id, tokenHash]
      );

      return {
        ...table,
        raw_qr_token: rawToken
      };
    });

    res.status(201).json({ table: newTable });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'DUPLICATE_TABLE', message: `Table "${table_number}" already exists.` });
      return;
    }
    console.error('Create table error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create table.' });
  }
});

// Generate / Regenerate Opaque QR for Table
tablesRouter.post('/:id/qr', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurant = req.restaurant!;

  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await withTransaction(async (client) => {
      // Revoke previous tokens (preserving deterministic demo token for local testing/dev)
      const demoHash = crypto.createHash('sha256').update('demo_token_table_1_royalspice').digest('hex');
      await client.query(
        `UPDATE table_qr_tokens SET is_revoked = true 
         WHERE table_id = $1 AND restaurant_id = $2 AND token_hash != $3`,
        [id, restaurant.id, demoHash]
      );

      // Insert new active token
      await client.query(
        `INSERT INTO table_qr_tokens (restaurant_id, table_id, token_hash)
         VALUES ($1, $2, $3)`,
        [restaurant.id, id, tokenHash]
      );
    });

    // Generate real scannable QR Code Data URL pointing to the customer route with restaurant subdomain
    const domain = restaurant.primary_domain || `${restaurant.slug}.localhost:5173`;
    const qrBase = domain.includes(':') ? `http://${domain}` : `https://${domain}`;
    const qrUrl = `${qrBase}/u/customer/table?t=${rawToken}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: restaurant.primary_color || '#e11d48',
        light: '#ffffff'
      }
    });

    res.json({
      raw_token: rawToken,
      qr_url: qrUrl,
      qr_image: qrDataUrl
    });
  } catch (err: any) {
    console.error('Generate QR error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to generate QR.' });
  }
});

// Update Table Physical Status (e.g. Waiter clears table to 'available')
tablesRouter.patch('/:id/status', resolveTenant, requireStaff(['manager', 'waiter']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const restaurant = req.restaurant!;

  if (!['available', 'occupied', 'reserved', 'out_of_service'].includes(status)) {
    res.status(400).json({ error: 'INVALID_STATUS', message: 'Invalid table status.' });
    return;
  }

  try {
    const result = await query(
      `UPDATE dining_tables SET status = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
      [status, id, restaurant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Table not found.' });
      return;
    }

    res.json({ table: result.rows[0] });
  } catch (err: any) {
    console.error('Update table status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update table status.' });
  }
});
