import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';
import {
  computeBillAmounts,
  getSessionBill,
  getSessionLedger,
  createSessionBill,
  syncSessionBill,
  getPaidTotal,
  applyPayment
} from './billing.utils.js';

export const billingRouter = Router();

const ratesFrom = (settings: any) => ({
  taxPercent: Number(settings?.tax_rate_percent ?? 5),
  servicePercent: Number(settings?.service_charge_percent ?? 0)
});

// ==========================================
// 1. Running Bill of a Table Session (customer + waiter use the SAME numbers)
//    total_paise  = whole bill, paid_paise = already paid, unpaid_paise = still owed
// ==========================================
billingRouter.get('/session/:sessionId', resolveTenant, async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const restaurant = req.restaurant!;
  const rates = ratesFrom(req.restaurantSettings);

  try {
    const ledger = await getSessionLedger({ query }, restaurant.id, sessionId, rates);

    if (ledger.orders.length === 0) {
      res.status(404).json({ error: 'NO_ORDERS', message: 'No active orders found for this session.' });
      return;
    }

    res.json({
      bill: ledger.bill,
      summary: {
        session_id: sessionId,
        orders: ledger.orders,
        items: ledger.items,
        subtotal_paise: ledger.amounts.subtotal_paise,
        tax_rate_percent: rates.taxPercent,
        tax_paise: ledger.amounts.tax_paise,
        service_charge_percent: rates.servicePercent,
        service_charge_paise: ledger.amounts.service_charge_paise,
        discount_paise: ledger.amounts.discount_paise,
        packaging_charge_paise: ledger.amounts.packaging_charge_paise,
        round_off_paise: ledger.amounts.round_off_paise,
        grand_total_paise: ledger.amounts.grand_total_paise,
        total_paise: ledger.total_paise,
        paid_paise: ledger.paid_paise,
        unpaid_paise: ledger.unpaid_paise,
        is_fully_paid: ledger.is_fully_paid
      }
    });
  } catch (err: any) {
    console.error('Fetch session bill error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to calculate bill.' });
  }
});

// ==========================================
// 2. Waiter or Manager Generates / Opens the Bill
//    A table session keeps ONE bill. It is re-used (and re-synced with the orders)
//    whether it is unpaid, partly paid or fully paid, so no duplicate bills appear.
// ==========================================
billingRouter.post('/generate', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const { table_session_id, order_id } = req.body;
  const restaurant = req.restaurant!;
  const settings = req.restaurantSettings!;

  if (!table_session_id && !order_id) {
    res.status(400).json({ error: 'MISSING_TARGET', message: 'Either table_session_id or order_id is required.' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      if (table_session_id) {
        const requestedDiscount = typeof req.body.discount_paise === 'number' ? req.body.discount_paise : undefined;
        let bill: any = await getSessionBill(client, restaurant.id, table_session_id, true);
        let rawToken: string | null = null;

        if (bill) {
          bill = await syncSessionBill(client, restaurant.id, table_session_id, { discountPaise: requestedDiscount });
        } else {
          bill = await createSessionBill(client, restaurant.id, table_session_id, requestedDiscount ?? 0);
          rawToken = bill.raw_receipt_token;
        }

        await client.query(
          `UPDATE table_sessions SET status = 'bill_generated' WHERE id = $1 AND status NOT IN ('closed', 'bill_generated')`,
          [table_session_id]
        );

        const paid = await getPaidTotal(client, bill.id);
        const { raw_receipt_token: _o, ...clean } = bill;
        return {
          bill: { ...clean, raw_receipt_token: rawToken },
          paid_paise: paid,
          unpaid_paise: Math.max(0, bill.grand_total_paise - paid)
        };
      }

      // ---- single order bill (takeaway / unbound order) ----
      const existing = await client.query(
        `SELECT * FROM bills WHERE restaurant_id = $1 AND order_id = $2 AND status != 'voided' ORDER BY created_at DESC LIMIT 1`,
        [restaurant.id, order_id]
      );
      if (existing.rows.length > 0) {
        const b = existing.rows[0];
        const paid = await getPaidTotal(client, b.id);
        return { bill: { ...b, raw_receipt_token: null }, paid_paise: paid, unpaid_paise: Math.max(0, b.grand_total_paise - paid) };
      }

      const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2`, [order_id, restaurant.id]);
      if (orderRes.rows.length === 0) throw new Error('Order not found.');
      const subtotalPaise = orderRes.rows[0].subtotal_paise;
      if (subtotalPaise === 0) throw new Error('Cannot generate bill for 0 items.');
      const packaging = orderRes.rows[0].order_type === 'takeaway' ? settings.packaging_charge_paise || 0 : 0;
      const discount = typeof req.body.discount_paise === 'number' ? req.body.discount_paise : 0;
      const a = computeBillAmounts({
        subtotalPaise, discountPaise: discount, packagingPaise: packaging, ...ratesFrom(settings)
      });

      const countRes = await client.query(`SELECT COUNT(*) FROM bills WHERE restaurant_id = $1`, [restaurant.id]);
      const billNumber = `INV-${new Date().getFullYear()}-${1000 + parseInt(countRes.rows[0].count, 10) + 1}`;
      const rawToken = crypto.randomBytes(24).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const ins = await client.query(
        `INSERT INTO bills
          (restaurant_id, bill_number, table_session_id, order_id, subtotal_paise, discount_paise, tax_paise,
           service_charge_paise, packaging_charge_paise, round_off_paise, grand_total_paise, status, receipt_token_hash)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, 'unpaid', $11) RETURNING *`,
        [restaurant.id, billNumber, order_id, a.subtotal_paise, a.discount_paise, a.tax_paise,
         a.service_charge_paise, a.packaging_charge_paise, a.round_off_paise, a.grand_total_paise, hash]
      );
      return { bill: { ...ins.rows[0], raw_receipt_token: rawToken }, paid_paise: 0, unpaid_paise: a.grand_total_paise };
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('Generate bill error:', err);
    res.status(400).json({ error: 'BILL_FAILED', message: err.message || 'Failed to generate bill.' });
  }
});

// ==========================================
// 3. Record Payment (waiter / manager). Pays at most the UNPAID balance.
// ==========================================
const recordPaymentSchema = z.object({
  bill_id: z.string().uuid(),
  amount_paise: z.number().int().min(1),
  method: z.enum(['cash', 'upi_qr', 'upi_manual', 'card', 'online_gateway']),
  transaction_reference: z.string().optional().nullable()
});

billingRouter.post('/payments', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = recordPaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const { bill_id, amount_paise, method, transaction_reference } = parsed.data;

  try {
    const r = await withTransaction((client) =>
      applyPayment(client, restaurant.id, bill_id, {
        amountPaise: amount_paise,
        method,
        staffId: req.staff?.userId || null,
        reference: transaction_reference || null
      })
    );

    res.status(201).json({
      payment: r.payment,
      total_paid: r.paid_paise,
      paid_paise: r.paid_paise,
      total_paise: r.total_paise,
      unpaid_paise: r.unpaid_paise,
      remaining_balance: r.unpaid_paise,
      is_fully_paid: r.is_fully_paid,
      session_closed: r.session_closed
    });
  } catch (err: any) {
    console.error('Payment recording error:', err);
    res.status(400).json({ error: 'PAYMENT_FAILED', message: err.message || 'Failed to record payment.' });
  }
});

// ==========================================
// 3b. Customer Online Payment — pays the table's UNPAID balance only
// ==========================================
billingRouter.post('/customer/pay', resolveTenant, async (req: Request, res: Response) => {
  const { order_id, table_session_id, method = 'online_gateway' } = req.body;
  const restaurant = req.restaurant!;
  const settings = req.restaurantSettings!;

  if (!order_id && !table_session_id) {
    res.status(400).json({ error: 'MISSING_TARGET', message: 'Either order_id or table_session_id is required.' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      // Dine-in orders always settle through the table's single session bill
      let sessionId: string | null = table_session_id || null;
      let orderRow: any = null;
      if (order_id) {
        const o = await client.query(`SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2`, [order_id, restaurant.id]);
        if (o.rows.length === 0) throw new Error('Order not found.');
        orderRow = o.rows[0];
        if (orderRow.table_session_id) sessionId = orderRow.table_session_id;
      }

      let bill: any = null;
      if (sessionId) {
        bill = await getSessionBill(client, restaurant.id, sessionId, true);
        if (bill) bill = await syncSessionBill(client, restaurant.id, sessionId);
        else {
          try {
            bill = await createSessionBill(client, restaurant.id, sessionId);
          } catch {
            return { already_paid: true, is_fully_paid: true, message: 'Nothing to pay on this table.' };
          }
        }
      } else {
        const ex = await client.query(
          `SELECT * FROM bills WHERE restaurant_id = $1 AND order_id = $2 AND status != 'voided' ORDER BY created_at DESC LIMIT 1`,
          [restaurant.id, order_id]
        );
        bill = ex.rows[0];
        if (!bill) {
          const packaging = orderRow.order_type === 'takeaway' ? settings.packaging_charge_paise || 0 : 0;
          const a = computeBillAmounts({ subtotalPaise: orderRow.subtotal_paise, packagingPaise: packaging, ...ratesFrom(settings) });
          const countRes = await client.query(`SELECT COUNT(*) FROM bills WHERE restaurant_id = $1`, [restaurant.id]);
          const billNumber = `INV-${new Date().getFullYear()}-${1000 + parseInt(countRes.rows[0].count, 10) + 1}`;
          const rawToken = crypto.randomBytes(24).toString('hex');
          const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const ins = await client.query(
            `INSERT INTO bills
              (restaurant_id, bill_number, table_session_id, order_id, subtotal_paise, discount_paise, tax_paise,
               service_charge_paise, packaging_charge_paise, round_off_paise, grand_total_paise, status, receipt_token_hash)
             VALUES ($1, $2, NULL, $3, $4, 0, $5, $6, $7, $8, $9, 'unpaid', $10) RETURNING *`,
            [restaurant.id, billNumber, order_id, a.subtotal_paise, a.tax_paise, a.service_charge_paise,
             a.packaging_charge_paise, a.round_off_paise, a.grand_total_paise, hash]
          );
          bill = ins.rows[0];
        }
      }

      const r = await applyPayment(client, restaurant.id, bill.id, {
        amountPaise: null, // exactly the unpaid balance
        method,
        reference: 'ONLINE_' + Date.now()
      });

      return {
        already_paid: r.already_paid,
        bill: r.bill,
        receipt_token: r.bill.receipt_token_hash,
        is_fully_paid: r.is_fully_paid,
        total_paise: r.total_paise,
        paid_paise: r.paid_paise,
        unpaid_paise: r.unpaid_paise,
        session_closed: r.session_closed,
        message: r.already_paid ? 'Nothing is unpaid on this bill.' : undefined
      };
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error('Customer payment error:', err);
    res.status(400).json({ error: 'PAYMENT_FAILED', message: err.message || 'Payment processing failed.' });
  }
});

// ==========================================
// 4. Customer Public Receipt
// ==========================================
billingRouter.get('/public/receipt/:receiptToken', resolveTenant, async (req: Request, res: Response) => {
  const receiptToken = req.params.receiptToken as string;
  const restaurant = req.restaurant!;

  if (!receiptToken) {
    res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Receipt token is required.' });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(receiptToken).digest('hex');

    const billRes = await query(
      `SELECT b.*, COALESCE(dt.table_number, dto.table_number) as table_number 
       FROM bills b
       LEFT JOIN table_sessions ts ON ts.id = b.table_session_id
       LEFT JOIN dining_tables dt ON dt.id = ts.table_id
       LEFT JOIN orders o ON o.id = b.order_id
       LEFT JOIN dining_tables dto ON dto.id = o.table_id
       WHERE b.receipt_token_hash = $1 AND b.restaurant_id = $2`,
      [tokenHash, restaurant.id]
    );

    if (billRes.rows.length === 0) {
      res.status(404).json({ error: 'RECEIPT_NOT_FOUND', message: 'Receipt not found or invalid link.' });
      return;
    }

    const bill = billRes.rows[0];

    // Fetch line items
    let itemsRes;
    if (bill.table_session_id) {
      itemsRes = await query(
        `SELECT oi.* 
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.table_session_id = $1 AND o.status NOT IN ('cancelled', 'rejected')`,
        [bill.table_session_id]
      );
    } else {
      itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [bill.order_id]);
    }

    // Fetch payments
    const paymentsRes = await query(
      `SELECT id, amount_paise, method, status, created_at, transaction_reference 
       FROM payments WHERE bill_id = $1`,
      [bill.id]
    );

    const paidPaise = paymentsRes.rows
      .filter((p: any) => p.status === 'completed')
      .reduce((n: number, p: any) => n + p.amount_paise, 0);

    res.json({
      restaurant: {
        name: restaurant.name,
        logo_url: restaurant.logo_url,
        primary_color: restaurant.primary_color,
        currency: restaurant.currency
      },
      bill,
      items: itemsRes.rows,
      payments: paymentsRes.rows,
      total_paise: bill.grand_total_paise,
      paid_paise: paidPaise,
      unpaid_paise: Math.max(0, bill.grand_total_paise - paidPaise)
    });
  } catch (err: any) {
    console.error('Fetch receipt error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch receipt.' });
  }
});
