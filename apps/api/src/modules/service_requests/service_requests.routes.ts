import { Router, Request, Response } from 'express';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query } from '../../db/index.js';

export const serviceRequestsRouter = Router();

// Customer creates service request (water, cutlery, waiter, bill, cleaning)
serviceRequestsRouter.post('/customer', resolveTenant, async (req: Request, res: Response) => {
  let { table_id, table_session_id, order_id, request_type = 'waiter', notes } = req.body;
  const restaurant = req.restaurant!;

  if (order_id && (!table_id || !table_session_id)) {
    const oRes = await query(
      'SELECT table_id, table_session_id FROM orders WHERE id = $1 AND restaurant_id = $2',
      [order_id, restaurant.id]
    );
    if (oRes.rows.length > 0) {
      table_id = table_id || oRes.rows[0].table_id;
      table_session_id = table_session_id || oRes.rows[0].table_session_id;
    }
  }

  if (!table_id || !table_session_id || !request_type) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'Table, session, and request type are required.' });
    return;
  }

  if (!['water', 'cutlery', 'waiter', 'bill', 'cleaning', 'other'].includes(request_type)) {
    res.status(400).json({ error: 'INVALID_REQUEST_TYPE', message: 'Invalid request type.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO service_requests (restaurant_id, table_session_id, table_id, request_type, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [restaurant.id, table_session_id, table_id, request_type, notes || 'Customer called waiter']
    );

    res.status(201).json({ request: result.rows[0] });
  } catch (err: any) {
    console.error('Create service request error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to submit service request.' });
  }
});

// Waiter lists active service requests
serviceRequestsRouter.get('/waiter', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT sr.*, dt.table_number 
       FROM service_requests sr
       JOIN dining_tables dt ON dt.id = sr.table_id
       WHERE sr.restaurant_id = $1 AND sr.status = 'pending'
       ORDER BY sr.created_at ASC`,
      [restaurant.id]
    );

    res.json({ requests: result.rows });
  } catch (err: any) {
    console.error('Fetch service requests error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch service requests.' });
  }
});

// Waiter resolves service request
serviceRequestsRouter.patch('/waiter/:id/resolve', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `UPDATE service_requests 
       SET status = 'resolved', resolved_at = now(), resolved_by_staff_id = $1
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [req.staff?.userId, id, restaurant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Service request not found.' });
      return;
    }

    res.json({ request: result.rows[0] });
  } catch (err: any) {
    console.error('Resolve service request error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to resolve service request.' });
  }
});
