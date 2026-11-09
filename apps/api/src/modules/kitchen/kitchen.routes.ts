import { Router, Request, Response } from 'express';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';

export const kitchenRouter = Router();

// Kitchen Tickets List (Tablet-friendly high contrast feed, sanitized from customer financial secrets)
kitchenRouter.get('/tickets', resolveTenant, requireStaff(['kitchen', 'manager', 'waiter']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const ticketsRes = await query(
      `SELECT 
        kt.id as ticket_id,
        kt.ticket_number,
        kt.status as ticket_status,
        kt.created_at,
        kt.acknowledged_at,
        kt.ready_at,
        o.id as order_id,
        o.order_number,
        o.order_type,
        o.notes as order_notes,
        dt.table_number,
        (
          CASE WHEN o.table_session_id IS NOT NULL THEN (
            SELECT COUNT(*) + 1 
            FROM orders prev 
            WHERE prev.table_session_id = o.table_session_id 
              AND prev.restaurant_id = o.restaurant_id 
              AND prev.status NOT IN ('cancelled', 'rejected') 
              AND prev.created_at < o.created_at
          ) ELSE 1 END
        ) as round_number
       FROM kitchen_tickets kt
       JOIN orders o ON o.id = kt.order_id
       LEFT JOIN dining_tables dt ON dt.id = o.table_id
       WHERE kt.restaurant_id = $1 AND kt.status != 'ready'
       ORDER BY kt.created_at ASC`,
      [restaurant.id]
    );

    // Fetch items and modifiers for each ticket
    const ticketIds = ticketsRes.rows.map((t) => t.ticket_id);
    const itemsByOrderId: Record<string, any[]> = {};

    if (ticketIds.length > 0) {
      const orderIds = ticketsRes.rows.map((t) => t.order_id);
      const itemsRes = await query(
        `SELECT 
          oi.order_id,
          oi.name_snapshot,
          oi.variant_name_snapshot,
          oi.quantity,
          COALESCE(
            json_agg(json_build_object('name', oim.name_snapshot)) 
            FILTER (WHERE oim.id IS NOT NULL), '[]'
          ) as modifiers
         FROM order_items oi
         LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
         WHERE oi.order_id = ANY($1)
         GROUP BY oi.id`,
        [orderIds]
      );

      for (const item of itemsRes.rows) {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push(item);
      }
    }

    const tickets = ticketsRes.rows.map((t) => ({
      ...t,
      items: itemsByOrderId[t.order_id] || []
    }));

    res.json({ tickets });
  } catch (err: any) {
    console.error('Fetch kitchen tickets error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch kitchen tickets.' });
  }
});

// Update Ticket Status (acknowledged, preparing, ready)
kitchenRouter.patch('/tickets/:id/status', resolveTenant, requireStaff(['kitchen', 'manager', 'waiter']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const restaurant = req.restaurant!;

  if (!['acknowledged', 'preparing', 'ready'].includes(status)) {
    res.status(400).json({ error: 'INVALID_STATUS', message: 'Invalid ticket status.' });
    return;
  }

  try {
    const updated = await withTransaction(async (client) => {
      let timeUpdate = '';
      if (status === 'acknowledged') timeUpdate = ', acknowledged_at = now()';
      if (status === 'ready') timeUpdate = ', ready_at = now()';

      const tRes = await client.query(
        `UPDATE kitchen_tickets 
         SET status = $1 ${timeUpdate}
         WHERE id = $2 AND restaurant_id = $3
         RETURNING *`,
        [status, id, restaurant.id]
      );

      if (tRes.rows.length === 0) {
        throw new Error('Ticket not found.');
      }

      const ticket = tRes.rows[0];

      // Synchronize order status
      if (status === 'preparing') {
        await client.query(`UPDATE orders SET status = 'preparing', updated_at = now() WHERE id = $1`, [ticket.order_id]);
      } else if (status === 'ready') {
        await client.query(`UPDATE orders SET status = 'ready', updated_at = now() WHERE id = $1`, [ticket.order_id]);
      }

      return ticket;
    });

    res.json({ ticket: updated });
  } catch (err: any) {
    console.error('Update kitchen ticket status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Failed to update ticket.' });
  }
});
