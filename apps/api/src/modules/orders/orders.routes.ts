import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';
import {
  WALKIN_PHONE_E164,
  WALKIN_CUSTOMER_NAME,
  SETTLED_SESSION_REUSE_MINUTES,
  syncSessionBill,
  getSessionLedger,
  settleSessionIfPaid
} from '../billing/billing.utils.js';

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

// Waiter POS: identical payload, but the guest's phone/name are optional
// (the waiter may not ask for them; the guest is already sitting at the table).
const waiterOrderSchema = z.object({
  order_type: z.enum(['dine_in', 'takeaway']).default('dine_in'),
  table_id: z.string().uuid().optional().nullable(),
  table_session_id: z.string().uuid().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  customer_name: z.string().max(80).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
  items: z.array(orderItemSchema).min(1)
});

// Session statuses that still count as "the table is being served"
const LIVE_SESSION_STATUSES = ['open', 'bill_requested', 'bill_generated'];

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
  phoneRaw?: string | null;
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

  return await withTransaction(async (client) => {
    // 0. Dine-in: bind to the table's live session (validate the hinted one, else
    //    reuse the active one, else open a fresh one) and mark the table occupied.
    let resolvedSessionId: string | null = null;
    if (orderType === 'dine_in' && tableId) {
      // 0a. A hinted session is only trusted if it belongs to this table and is still live
      if (tableSessionId) {
        const hinted = await client.query(
          `SELECT id FROM table_sessions
           WHERE id = $1 AND restaurant_id = $2 AND table_id = $3 AND status = ANY($4)`,
          [tableSessionId, restaurantId, tableId, LIVE_SESSION_STATUSES]
        );
        if (hinted.rows.length > 0) resolvedSessionId = hinted.rows[0].id;

        // The guest paid (session auto-closed) and now orders more from the same phone:
        // re-open that session so it continues on the SAME bill (total grows, paid stays,
        // only the new dish is unpaid). Only if the table has no other live session.
        if (!resolvedSessionId) {
          const recent = await client.query(
            `SELECT ts.id FROM table_sessions ts
             WHERE ts.id = $1 AND ts.restaurant_id = $2 AND ts.table_id = $3 AND ts.status = 'closed'
               AND ts.closed_at > now() - ($4 || ' minutes')::interval
               AND EXISTS (SELECT 1 FROM bills b WHERE b.table_session_id = ts.id AND b.order_id IS NULL AND b.status = 'paid')
               AND NOT EXISTS (SELECT 1 FROM table_sessions o WHERE o.table_id = ts.table_id AND o.status != 'closed')`,
            [tableSessionId, restaurantId, tableId, String(SETTLED_SESSION_REUSE_MINUTES)]
          );
          if (recent.rows.length > 0) {
            await client.query(
              `UPDATE table_sessions SET status = 'open', closed_at = NULL WHERE id = $1`,
              [recent.rows[0].id]
            );
            resolvedSessionId = recent.rows[0].id;
          }
        }
      }

      // 0b. Otherwise the table's active session, or open a new one
      if (!resolvedSessionId) {
        let active = await client.query(
          `SELECT id FROM table_sessions
           WHERE restaurant_id = $1 AND table_id = $2 AND status = ANY($3)
           ORDER BY opened_at DESC LIMIT 1`,
          [restaurantId, tableId, LIVE_SESSION_STATUSES]
        );

        if (active.rows.length === 0) {
          // Retire leftovers (e.g. 'settled') so the one-active-session-per-table index never blocks us
          await client.query(
            `UPDATE table_sessions SET status = 'closed', closed_at = COALESCE(closed_at, now())
             WHERE restaurant_id = $1 AND table_id = $2 AND status != 'closed'`,
            [restaurantId, tableId]
          );
          active = await client.query(
            `INSERT INTO table_sessions (restaurant_id, table_id, status)
             VALUES ($1, $2, 'open')
             ON CONFLICT (restaurant_id, table_id) WHERE status != 'closed' DO NOTHING
             RETURNING id`,
            [restaurantId, tableId]
          );
          if (active.rows.length === 0) {
            // Lost a race with a concurrent request: use the session it created
            active = await client.query(
              `SELECT id FROM table_sessions
               WHERE restaurant_id = $1 AND table_id = $2 AND status = ANY($3)
               ORDER BY opened_at DESC LIMIT 1`,
              [restaurantId, tableId, LIVE_SESSION_STATUSES]
            );
          }
        }
        resolvedSessionId = active.rows[0].id;
      }

      // Mark table occupied unconditionally
      await client.query(
        `UPDATE dining_tables SET status = 'occupied' WHERE id = $1 AND restaurant_id = $2`,
        [tableId, restaurantId]
      );
    }

    // 1. Resolve or Upsert Customer Profile
    let phoneE164: string;
    let customerId: string;
    const phoneDigits = (phoneRaw || '').replace(/\D/g, '');

    if (phoneDigits.length >= 8) {
      phoneE164 = normalizePhone(phoneRaw as string);
      const customerRes = await client.query(
        `SELECT * FROM customers WHERE restaurant_id = $1 AND phone_e164 = $2`,
        [restaurantId, phoneE164]
      );

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
    } else {
      // No phone given (waiter flow): attach to the guest already known on this table session,
      // so loyalty/receipts follow the real customer; otherwise fall back to the walk-in guest.
      let known: { customer_id: string; customer_phone_snapshot: string } | null = null;
      if (resolvedSessionId) {
        const prev = await client.query(
          `SELECT o.customer_id, o.customer_phone_snapshot
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
           WHERE o.table_session_id = $1 AND o.restaurant_id = $2 AND c.phone_e164 <> $3
           ORDER BY o.created_at ASC LIMIT 1`,
          [resolvedSessionId, restaurantId, WALKIN_PHONE_E164]
        );
        if (prev.rows.length > 0) known = prev.rows[0];
      }

      if (known) {
        customerId = known.customer_id;
        phoneE164 = known.customer_phone_snapshot;
      } else {
        phoneE164 = WALKIN_PHONE_E164;
        const walkIn = await client.query(
          `INSERT INTO customers (restaurant_id, phone_e164, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (restaurant_id, phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
           RETURNING id`,
          [restaurantId, phoneE164, WALKIN_CUSTOMER_NAME]
        );
        customerId = walkIn.rows[0].id;
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
        orderType === 'dine_in' ? resolvedSessionId || null : null,
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

    // 8. Keep the table's single bill in step with the new order:
    //    unpaid bill -> new dish is added to the unpaid amount;
    //    paid bill   -> total grows, paid stays, only the new dish is unpaid.
    let updatedBill: any = null;
    if (orderType === 'dine_in' && resolvedSessionId) {
      updatedBill = await syncSessionBill(client, restaurantId, resolvedSessionId);
    }

    return {
      order: newOrder,
      items: preparedItems,
      ticket: ticketRes.rows[0],
      raw_access_token: rawAccessToken,
      table_session_id: orderType === 'dine_in' ? resolvedSessionId : null,
      updated_bill: updatedBill
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

  // Validate dine-in requires table; the order service resolves / opens the live table session
  if (order_type === 'dine_in' && !table_id) {
    res.status(400).json({ error: 'TABLE_REQUIRED', message: 'Dine-in orders require a table to be selected.' });
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
      table_session_id: result.table_session_id,
      access_token: result.raw_access_token,
      tracking_url: `/u/customer/order/${result.order.id}?token=${result.raw_access_token}`
    });
  } catch (err: any) {
    console.error('Customer checkout error:', err);
    res.status(400).json({ error: 'ORDER_FAILED', message: err.message || 'Failed to place order.' });
  }
});

// Waiter Manual Order Placement Endpoint
// Uses the exact same domain service as the customer QR checkout: same order row, same
// kitchen ticket, same table session (so it shows on the customer's dashboard) and the
// amount is added to the table's existing unpaid bill.
ordersRouter.post('/waiter/order', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = waiterOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const { order_type, table_id, table_session_id, phone, customer_name, notes, items } = parsed.data;

  if (order_type === 'dine_in' && !table_id) {
    res.status(400).json({ error: 'TABLE_REQUIRED', message: 'Dine-in orders require a table to be selected.' });
    return;
  }

  // Phone is optional for waiters, but if one is typed it must be a real number
  const phoneDigits = (phone || '').replace(/\D/g, '');
  if (phoneDigits.length > 0 && phoneDigits.length < 10) {
    res.status(400).json({ error: 'INVALID_PHONE', message: 'Enter a valid 10-digit mobile number or leave it blank.' });
    return;
  }

  try {
    const result = await createOrderService({
      restaurantId: restaurant.id,
      orderType: order_type,
      tableId: table_id,
      tableSessionId: table_session_id,
      phoneRaw: phoneDigits.length >= 10 ? `+91${phoneDigits.slice(-10)}` : null,
      customerName: customer_name,
      notes,
      items,
      staffUserId: req.staff?.userId
    });

    const { access_token_hash: _omit, ...safeOrder } = result.order;

    res.status(201).json({
      order: safeOrder,
      ticket: result.ticket,
      items: result.items,
      table_session_id: result.table_session_id,
      bill_updated: !!result.updated_bill
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

    // Check bill and payment status for this specific order
    const billRes = await query(
      `SELECT id, bill_number, status, grand_total_paise, receipt_token_hash, settled_at 
       FROM bills 
       WHERE restaurant_id = $1 AND (
         order_id = $2 
         OR (table_session_id = $3 AND $3 IS NOT NULL AND order_id IS NULL)
       )
       ORDER BY created_at DESC LIMIT 1`,
      [restaurant.id, order.id, order.table_session_id || null]
    );

    const bill = billRes.rows[0] || null;

    // Session money: ONE ledger shared with the running bill and the waiter panel
    let roundNumber = 1;
    let sessionTotalPaise = 0;
    let sessionPaidPaise = 0;
    let sessionUnpaidPaise = 0;
    let sessionSubtotalPaise = order.subtotal_paise;
    let sessionOrders: any[] = [];
    let sessionBill: any = bill;

    if (order.table_session_id) {
      const st = req.restaurantSettings as any;
      const ledger = await getSessionLedger({ query }, restaurant.id, order.table_session_id, {
        taxPercent: Number(st?.tax_rate_percent ?? 5),
        servicePercent: Number(st?.service_charge_percent ?? 0)
      });
      sessionBill = ledger.bill || bill;
      sessionSubtotalPaise = ledger.amounts.subtotal_paise;
      sessionTotalPaise = ledger.total_paise;
      sessionPaidPaise = ledger.paid_paise;
      sessionUnpaidPaise = ledger.unpaid_paise;

      const itemsBy: Record<string, any[]> = {};
      if (ledger.orders.length > 0) {
        const det = await query(
          `SELECT oi.id, oi.order_id, oi.name_snapshot, oi.quantity, oi.unit_price_paise, oi.total_price_paise,
                  oi.variant_name_snapshot,
                  COALESCE((SELECT json_agg(json_build_object('name', oim.name_snapshot, 'price_paise', oim.unit_price_paise))
                            FROM order_item_modifiers oim WHERE oim.order_item_id = oi.id), '[]'::json) AS modifiers
           FROM order_items oi WHERE oi.order_id = ANY($1) ORDER BY oi.id`,
          [ledger.orders.map((o: any) => o.id)]
        );
        for (const r of det.rows) {
          (itemsBy[r.order_id] = itemsBy[r.order_id] || []).push({
            ...r,
            name: r.name_snapshot,
            variant_name: r.variant_name_snapshot
          });
        }
      }

      sessionOrders = ledger.orders.map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        subtotal_paise: o.subtotal_paise,
        created_at: o.created_at,
        round_number: o.round_number,
        items: itemsBy[o.id] || [],
        is_paid: o.is_paid,
        bill: ledger.bill
          ? {
              id: ledger.bill.id,
              bill_number: ledger.bill.bill_number,
              status: ledger.bill.status,
              grand_total_paise: ledger.bill.grand_total_paise,
              receipt_token_hash: ledger.bill.receipt_token_hash,
              settled_at: ledger.bill.settled_at
            }
          : null
      }));

      const me = ledger.orders.find((o: any) => o.id === order.id);
      if (me) roundNumber = me.round_number;
      // this order is paid only if its own part has been settled
      order.__is_paid = me ? me.is_paid : false;
    }

    res.json({
      order: {
        ...Object.fromEntries(Object.entries(order).filter(([k]) => k !== '__is_paid')),
        items: itemsRes.rows,
        bill: sessionBill,
        is_paid: order.table_session_id ? Boolean(order.__is_paid) : (bill?.status === 'paid' || order.status === 'completed'),
        receipt_token: sessionBill?.receipt_token_hash || null,
        round_number: roundNumber,
        session_subtotal_paise: sessionSubtotalPaise,
        session_total_paise: sessionTotalPaise,
        session_paid_paise: sessionPaidPaise,
        session_unpaid_paise: sessionUnpaidPaise,
        session_orders: sessionOrders
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
        (
          CASE WHEN o.table_session_id IS NOT NULL THEN (
            SELECT COUNT(*) + 1 
            FROM orders prev 
            WHERE prev.table_session_id = o.table_session_id 
              AND prev.restaurant_id = o.restaurant_id 
              AND prev.status NOT IN ('cancelled', 'rejected') 
              AND prev.created_at < o.created_at
          ) ELSE 1 END
        ) as round_number,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'name', oi.name_snapshot,
            'variant', oi.variant_name_snapshot,
            'quantity', oi.quantity
          )) FROM order_items oi WHERE oi.order_id = o.id), '[]'::json
        ) as items,
        (SELECT b.status FROM bills b WHERE b.status != 'voided' AND (b.order_id = o.id OR (b.table_session_id = o.table_session_id AND o.table_session_id IS NOT NULL AND b.order_id IS NULL)) ORDER BY b.created_at DESC LIMIT 1) as bill_status,
        EXISTS (
          SELECT 1 FROM bills b
          WHERE b.status != 'voided' AND b.settled_at IS NOT NULL AND o.created_at <= b.settled_at
            AND (b.order_id = o.id OR (b.table_session_id = o.table_session_id AND o.table_session_id IS NOT NULL AND b.order_id IS NULL))
        ) as is_paid
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

    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [status, id]
      );

      // If order is ready, update kitchen ticket as well
      if (status === 'ready') {
        await client.query(`UPDATE kitchen_tickets SET status = 'ready', ready_at = now() WHERE order_id = $1`, [id]);
      }

      const sessionId = updated.rows[0].table_session_id;
      if (sessionId) {
        // Cancelled orders leave the bill; a served order of an already-paid bill completes the table
        if (status === 'cancelled' || status === 'rejected') {
          await syncSessionBill(client, restaurant.id, sessionId);
        }
        if (status === 'served' || status === 'completed' || status === 'cancelled' || status === 'rejected') {
          await settleSessionIfPaid(client, restaurant.id, sessionId);
        }
      }
      return updated.rows[0];
    });

    res.json({ order: result });
  } catch (err: any) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update order status.' });
  }
});

// Delete / Void Order Completely (Removes from DB, Kitchen, and Manager side)
ordersRouter.delete('/:id', resolveTenant, requireStaff(['manager', 'waiter']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurant = req.restaurant!;

  try {
    const deletedInfo = await withTransaction(async (client) => {
      // 1. Delete unpaid bills linked to this order
      await client.query(
        `DELETE FROM bills WHERE restaurant_id = $1 AND order_id = $2 AND status != 'paid'`,
        [restaurant.id, id]
      );

      // 2. Delete the order (cascades to order_items, order_item_modifiers, kitchen_tickets)
      const oRes = await client.query(
        `DELETE FROM orders WHERE id = $1 AND restaurant_id = $2 RETURNING table_id, table_session_id`,
        [id, restaurant.id]
      );

      if (oRes.rows.length === 0) {
        throw new Error('Order not found or already deleted.');
      }

      const deletedOrder = oRes.rows[0];
      if (deletedOrder.table_session_id) {
        await syncSessionBill(client, restaurant.id, deletedOrder.table_session_id);
      }

      // 3. If dine-in, check if table has any remaining active orders
      if (deletedOrder.table_id) {
        const remaining = await client.query(
          `SELECT COUNT(*) FROM orders 
           WHERE table_id = $1 AND restaurant_id = $2 AND status NOT IN ('completed', 'cancelled', 'rejected')`,
          [deletedOrder.table_id, restaurant.id]
        );

        if (parseInt(remaining.rows[0].count, 10) === 0) {
          await client.query(
            `UPDATE dining_tables SET status = 'available' WHERE id = $1 AND restaurant_id = $2`,
            [deletedOrder.table_id, restaurant.id]
          );
          if (deletedOrder.table_session_id) {
            await client.query(
              `UPDATE table_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
              [deletedOrder.table_session_id]
            );
          }
        }
      }

      return deletedOrder;
    });

    res.json({ success: true, message: 'Order completely deleted from the database.', order: deletedInfo });
  } catch (err: any) {
    console.error('Delete order error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Failed to delete order.' });
  }
});
