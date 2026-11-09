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
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.table_id = dt.id 
              AND o.restaurant_id = dt.restaurant_id 
              AND o.status NOT IN ('completed', 'cancelled', 'rejected')
          ) THEN 'occupied'
          WHEN dt.status = 'occupied' AND ts.id IS NOT NULL AND ts.status != 'closed' THEN 'occupied'
          ELSE 'available'
        END as status,
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
    const updatedTable = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE dining_tables SET status = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
        [status, id, restaurant.id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // If clearing/setting table to available, completely delete active orders, unpaid bills, and close sessions
      if (status === 'available') {
        // 1. Delete unpaid bills linked to this table or its sessions
        await client.query(
          `DELETE FROM bills 
           WHERE restaurant_id = $1 AND (
             table_session_id IN (SELECT id FROM table_sessions WHERE table_id = $2 AND restaurant_id = $1)
             OR order_id IN (
               SELECT id FROM orders 
               WHERE restaurant_id = $1 AND (
                 table_id = $2 OR table_session_id IN (SELECT id FROM table_sessions WHERE table_id = $2 AND restaurant_id = $1)
               ) AND status != 'completed'
             )
           ) AND status != 'paid'`,
          [restaurant.id, id]
        );

        // 2. Completely delete all active/uncompleted orders linked to this table
        // (cascades automatically to order_items, order_item_modifiers, kitchen_tickets)
        await client.query(
          `DELETE FROM orders 
           WHERE restaurant_id = $1 AND (
             table_id = $2 OR table_session_id IN (SELECT id FROM table_sessions WHERE table_id = $2 AND restaurant_id = $1)
           ) AND status != 'completed'`,
          [restaurant.id, id]
        );

        // 3. Close any open sessions on this table
        await client.query(
          `UPDATE table_sessions 
           SET status = 'closed', closed_at = now() 
           WHERE table_id = $1 AND restaurant_id = $2 AND status != 'closed'`,
          [id, restaurant.id]
        );

        // 4. Resolve any pending guest service requests on this table
        await client.query(
          `UPDATE service_requests 
           SET status = 'resolved', resolved_at = now() 
           WHERE table_id = $1 AND restaurant_id = $2 AND status = 'pending'`,
          [id, restaurant.id]
        );
      }

      return result.rows[0];
    });

    if (!updatedTable) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Table not found.' });
      return;
    }

    res.json({ table: updatedTable });
  } catch (err: any) {
    console.error('Update table status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update table status.' });
  }
});
