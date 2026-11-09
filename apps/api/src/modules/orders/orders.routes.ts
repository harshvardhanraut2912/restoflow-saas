import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';

export const ordersRouter = Router();

// Zod Schema for Checkout / Order Placement
const orderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(50),
  modifier_ids: z.array(z.string().uuid()).optional().default([])
});

const placeOrderSchema = z.object({
  order_type: z.enum(['dine_in', 'takeaway']),
  table_id: z.string().uuid().optional().nullable(),
  table_session_id: z.string().uuid().optional().nullable(),
  phone: z.string().min(8).max(16),
  customer_name: z.string().optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
  items: z.array(orderItemSchema).min(1)
});

// Helper: Normalize phone to E.164
function normalizePhone(raw: string, defaultCountry = '+91'): string {
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = defaultCountry + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

// ==========================================
// UNIFIED ORDER CREATION DOMAIN SERVICE
// ==========================================
export async function createOrderService(params: {
  restaurantId: string;
  orderType: 'dine_in' | 'takeaway';
  tableId?: string | null;
  tableSessionId?: string | null;
  phoneRaw: string;
  customerName?: string | null;
  notes?: string | null;
  items: z.infer<typeof orderItemSchema>[];
  staffUserId?: string | null;
}) {
  const {
    restaurantId,
    orderType,
    tableId,
    tableSessionId,
    phoneRaw,
    customerName,
    notes,
    items,
    staffUserId
  } = params;

  const phoneE164 = normalizePhone(phoneRaw);

  return await withTransaction(async (client) => {
    // 1. Resolve or Upsert Customer Profile
    let customerRes = await client.query(
      `SELECT * FROM customers WHERE restaurant_id = $1 AND phone_e164 = $2`,
      [restaurantId, phoneE164]
    );

    let customerId: string;
    if (customerRes.rows.length === 0) {
      const newCust = await client.query(
        `INSERT INTO customers (restaurant_id, phone_e164, name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [restaurantId, phoneE164, customerName || null]
      );
      customerId = newCust.rows[0].id;
    } else {
      customerId = customerRes.rows[0].id;
      if (customerName && !customerRes.rows[0].name) {
        await client.query(`UPDATE customers SET name = $1 WHERE id = $2`, [customerName, customerId]);
      }
    }

    // 2. Validate Items & Recalculate Prices Directly from DB
    let orderSubtotalPaise = 0;
    const preparedItems: any[] = [];

    for (const itemInput of items) {
      // Query item
      const itemDb = await client.query(
        `SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2`,
        [itemInput.menu_item_id, restaurantId]
      );

      if (itemDb.rows.length === 0) {
        throw new Error(`Menu item not found: ${itemInput.menu_item_id}`);
      }

      const item = itemDb.rows[0];
      if (!item.is_available) {
        throw new Error(`Item "${item.name}" is currently sold out.`);
      }

      let unitPricePaise = item.base_price_paise;
      let variantNameSnapshot: string | null = null;

      // Check variant if specified
      if (itemInput.variant_id) {
        const variantDb = await client.query(
          `SELECT * FROM menu_variants WHERE id = $1 AND menu_item_id = $2 AND is_available = true`,
          [itemInput.variant_id, item.id]
        );

        if (variantDb.rows.length === 0) {
          throw new Error(`Variant not found or unavailable for item: ${item.name}`);
        }
        unitPricePaise = variantDb.rows[0].price_paise;
        variantNameSnapshot = variantDb.rows[0].name;
      }

      // Check modifiers
      const preparedModifiers: any[] = [];
      if (itemInput.modifier_ids && itemInput.modifier_ids.length > 0) {
        for (const modId of itemInput.modifier_ids) {
          const modDb = await client.query(
            `SELECT * FROM modifiers WHERE id = $1 AND restaurant_id = $2 AND is_available = true`,
            [modId, restaurantId]
          );
          if (modDb.rows.length > 0) {
            const mod = modDb.rows[0];
            unitPricePaise += mod.price_paise;
            preparedModifiers.push({
              modifier_id: mod.id,
              name_snapshot: mod.name,
              unit_price_paise: mod.price_paise
            });
          }
        }
      }

      const itemTotalPaise = unitPricePaise * itemInput.quantity;
      orderSubtotalPaise += itemTotalPaise;

      preparedItems.push({
        menu_item_id: item.id,
        variant_id: itemInput.variant_id || null,
        name_snapshot: item.name,
        variant_name_snapshot: variantNameSnapshot,
        unit_price_paise: unitPricePaise,
        quantity: itemInput.quantity,
        total_price_paise: itemTotalPaise,
        modifiers: preparedModifiers
      });
    }

    // 3. Generate Sequential Daily Order Number (e.g. #101)
    const countRes = await client.query(
      `SELECT COUNT(*) FROM orders 
       WHERE restaurant_id = $1 AND created_at >= CURRENT_DATE`,
      [restaurantId]
    );
    const dailySeq = parseInt(countRes.rows[0].count, 10) + 1;
    const orderNumber = `#${100 + dailySeq}`;

    // 4. Generate Unguessable Customer Tracking Access Token
    const rawAccessToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');

    // 5. Insert Order
    const orderRes = await client.query(
      `INSERT INTO orders 
        (restaurant_id, order_number, order_type, table_session_id, table_id, customer_id, customer_phone_snapshot, status, access_token_hash, subtotal_paise, notes, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'placed', $8, $9, $10, $11)
       RETURNING *`,
      [
        restaurantId,
        orderNumber,
        orderType,
        orderType === 'dine_in' ? tableSessionId || null : null,
        orderType === 'dine_in' ? tableId || null : null,
        customerId,
        phoneE164,
        tokenHash,
        orderSubtotalPaise,
        notes || null,
        staffUserId || null
      ]
    );
    const newOrder = orderRes.rows[0];

    // 6. Insert Order Items & Modifiers
    for (const pItem of preparedItems) {
      const oiRes = await client.query(
        `INSERT INTO order_items 
          (order_id, menu_item_id, variant_id, name_snapshot, variant_name_snapshot, unit_price_paise, quantity, total_price_paise)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          newOrder.id,
          pItem.menu_item_id,
          pItem.variant_id,
          pItem.name_snapshot,
          pItem.variant_name_snapshot,
          pItem.unit_price_paise,
          pItem.quantity,
          pItem.total_price_paise
        ]
      );
      const orderItemId = oiRes.rows[0].id;

      for (const mod of pItem.modifiers) {
        await client.query(
          `INSERT INTO order_item_modifiers (order_item_id, modifier_id, name_snapshot, unit_price_paise)
           VALUES ($1, $2, $3, $4)`,
          [orderItemId, mod.modifier_id, mod.name_snapshot, mod.unit_price_paise]
        );
      }
    }

    // 7. Create Kitchen Ticket
    const ticketRes = await client.query(
      `INSERT INTO kitchen_tickets (restaurant_id, order_id, ticket_number, status)
       VALUES ($1, $2, $3, 'new')
       RETURNING *`,
      [restaurantId, newOrder.id, `K-${orderNumber.replace('#', '')}`]
    );

    return {
      order: newOrder,
      items: preparedItems,
      ticket: ticketRes.rows[0],
      raw_access_token: rawAccessToken
    };
  });
}

// Customer QR Checkout Endpoint
ordersRouter.post('/customer/checkout', resolveTenant, async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = placeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const { order_type, table_id, table_session_id, phone, customer_name, notes, items } = parsed.data;

  // Validate dine-in requires active table session
  if (order_type === 'dine_in' && (!table_id || !table_session_id)) {
    res.status(400).json({ error: 'TABLE_REQUIRED', message: 'Dine-in orders require a valid table and active session.' });
    return;
  }

  try {
    const result = await createOrderService({
      restaurantId: restaurant.id,
      orderType: order_type,
      tableId: table_id,
      tableSessionId: table_session_id,
      phoneRaw: phone,
      customerName: customer_name,
      notes,
      items
    });

    res.status(201).json({
      order_id: result.order.id,
      order_number: result.order.order_number,
      order_type: result.order.order_type,
      status: result.order.status,
      subtotal_paise: result.order.subtotal_paise,
      access_token: result.raw_access_token,
      tracking_url: `/u/customer/order/${result.order.id}?token=${result.raw_access_token}`
    });
  } catch (err: any) {
    console.error('Customer checkout error:', err);
    res.status(400).json({ error: 'ORDER_FAILED', message: err.message || 'Failed to place order.' });
  }
});

// Waiter Manual Order Placement Endpoint (uses the exact same domain service)
ordersRouter.post('/waiter/order', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = placeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const { order_type, table_id, table_session_id, phone, customer_name, notes, items } = parsed.data;

  try {
    const result = await createOrderService({
      restaurantId: restaurant.id,
      orderType: order_type,
      tableId: table_id,
      tableSessionId: table_session_id,
      phoneRaw: phone,
      customerName: customer_name,
      notes,
      items,
      staffUserId: req.staff?.userId
    });

    res.status(201).json({
      order: result.order,
      ticket: result.ticket
    });
  } catch (err: any) {
    console.error('Waiter order error:', err);
    res.status(400).json({ error: 'ORDER_FAILED', message: err.message || 'Failed to place order.' });
  }
});

// Customer Secure Order Tracking
ordersRouter.get('/customer/:id', resolveTenant, async (req: Request, res: Response) => {
  const { id } = req.params;
  const token = req.query.token as string;
  const restaurant = req.restaurant!;

  if (!token) {
    res.status(401).json({ error: 'TOKEN_REQUIRED', message: 'Tracking access token required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const orderRes = await query(
      `SELECT o.*, dt.table_number 
       FROM orders o
       LEFT JOIN dining_tables dt ON dt.id = o.table_id
       WHERE o.id = $1 AND o.restaurant_id = $2 AND o.access_token_hash = $3`,
      [id, restaurant.id, tokenHash]
    );

    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Order not found or invalid access token.' });
      return;
    }

    const order = orderRes.rows[0];

    // Fetch items & modifiers
    const itemsRes = await query(
      `SELECT oi.*, 
        COALESCE(
          json_agg(json_build_object('name', oim.name_snapshot, 'price_paise', oim.unit_price_paise)) 
          FILTER (WHERE oim.id IS NOT NULL), '[]'
        ) as modifiers
       FROM order_items oi
       LEFT JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
       WHERE oi.order_id = $1
       GROUP BY oi.id`,
      [order.id]
    );

    res.json({
      order: {
        ...order,
        items: itemsRes.rows
      }
    });
  } catch (err: any) {
    console.error('Fetch customer order error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch order.' });
  }
});

// Staff / Waiter / Manager Active Orders List
ordersRouter.get('/staff/list', resolveTenant, requireStaff(['manager', 'waiter']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const statusFilter = req.query.status as string;

  try {
    let sql = `
      SELECT o.*, dt.table_number, c.name as customer_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN dining_tables dt ON dt.id = o.table_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.restaurant_id = $1
    `;
    const params: any[] = [restaurant.id];

    if (statusFilter) {
      sql += ` AND o.status = $2`;
      params.push(statusFilter);
    }

    sql += ` ORDER BY o.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    res.json({ orders: result.rows });
  } catch (err: any) {
    console.error('Fetch staff orders error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch orders.' });
  }
});

// Update Order Status (Enforces Order State Machine)
ordersRouter.patch('/:id/status', resolveTenant, requireStaff(['manager', 'waiter', 'kitchen']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const restaurant = req.restaurant!;

  const validTransitions: Record<string, string[]> = {
    placed: ['accepted', 'cancelled', 'rejected'],
    accepted: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['served', 'completed'],
    served: ['completed']
  };

  try {
    const currentOrder = await query('SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2', [id, restaurant.id]);
    if (currentOrder.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Order not found.' });
      return;
    }

    const currentStatus = currentOrder.rows[0].status;
    const allowed = validTransitions[currentStatus] || [];

    if (!allowed.includes(status)) {
      res.status(400).json({
        error: 'INVALID_TRANSITION',
        message: `Cannot transition order from "${currentStatus}" to "${status}".`
      });
      return;
    }

    const updated = await query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    // If order is ready, update kitchen ticket as well
    if (status === 'ready') {
      await query(`UPDATE kitchen_tickets SET status = 'ready', ready_at = now() WHERE order_id = $1`, [id]);
    }

    res.json({ order: updated.rows[0] });
  } catch (err: any) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update order status.' });
  }
});
