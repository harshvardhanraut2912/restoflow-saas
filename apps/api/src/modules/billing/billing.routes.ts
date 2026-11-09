import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';

export const billingRouter = Router();

// ==========================================
// 1. Generate or Get Running Bill for Active Table Session
// ==========================================
billingRouter.get('/session/:sessionId', resolveTenant, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const restaurant = req.restaurant!;
  const settings = req.restaurantSettings!;

  try {
    // 1. Fetch eligible orders for this table session
    const ordersRes = await query(
      `SELECT * FROM orders 
       WHERE table_session_id = $1 AND restaurant_id = $2 AND status NOT IN ('cancelled', 'rejected')
       ORDER BY created_at ASC`,
      [sessionId, restaurant.id]
    );

    if (ordersRes.rows.length === 0) {
      res.status(404).json({ error: 'NO_ORDERS', message: 'No active orders found for this session.' });
      return;
    }

    // 2. Fetch all line items
    const orderIds = ordersRes.rows.map((o) => o.id);
    const itemsRes = await query(
      `SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id ASC`,
      [orderIds]
    );

    // 3. Compute accurate integer paise arithmetic
    let subtotalPaise = 0;
    for (const item of itemsRes.rows) {
      subtotalPaise += item.total_price_paise;
    }

    const taxPercent = Number(settings.tax_rate_percent || 5);
    const servicePercent = Number(settings.service_charge_percent || 0);

    const taxPaise = Math.round(subtotalPaise * (taxPercent / 100));
    const serviceChargePaise = Math.round(subtotalPaise * (servicePercent / 100));
    const discountPaise = 0;
    const packagingChargePaise = 0;

    const unroundedGrandTotal = subtotalPaise - discountPaise + taxPaise + serviceChargePaise + packagingChargePaise;
    // Round off to nearest whole rupee (100 paise)
    const remainder = unroundedGrandTotal % 100;
    let roundOffPaise = 0;
    if (remainder >= 50) {
      roundOffPaise = 100 - remainder;
    } else if (remainder > 0) {
      roundOffPaise = -remainder;
    }

    const grandTotalPaise = unroundedGrandTotal + roundOffPaise;

    // Check if bill record already generated for this session
    const existingBill = await query(
      `SELECT * FROM bills WHERE table_session_id = $1 AND restaurant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [sessionId, restaurant.id]
    );

    res.json({
      bill: existingBill.rows[0] || null,
      summary: {
        session_id: sessionId,
        orders: ordersRes.rows,
        items: itemsRes.rows,
        subtotal_paise: subtotalPaise,
        tax_rate_percent: taxPercent,
        tax_paise: taxPaise,
        service_charge_percent: servicePercent,
        service_charge_paise: serviceChargePaise,
        discount_paise: discountPaise,
        packaging_charge_paise: packagingChargePaise,
        round_off_paise: roundOffPaise,
        grand_total_paise: grandTotalPaise
      }
    });
  } catch (err: any) {
    console.error('Fetch session bill error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to calculate bill.' });
  }
});

// ==========================================
// 2. Waiter or Manager Generates Final Bill
// ==========================================
billingRouter.post('/generate', resolveTenant, requireStaff(['waiter', 'manager']), async (req: Request, res: Response) => {
  const { table_session_id, order_id, discount_paise = 0 } = req.body;
  const restaurant = req.restaurant!;
  const settings = req.restaurantSettings!;

  if (!table_session_id && !order_id) {
    res.status(400).json({ error: 'MISSING_TARGET', message: 'Either table_session_id or order_id is required.' });
    return;
  }

  try {
    const createdBill = await withTransaction(async (client) => {
      let subtotalPaise = 0;
      let packagingChargePaise = 0;

      if (table_session_id) {
        const itemsRes = await client.query(
          `SELECT oi.total_price_paise 
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.table_session_id = $1 AND o.status NOT IN ('cancelled', 'rejected')`,
          [table_session_id]
        );
        for (const item of itemsRes.rows) {
          subtotalPaise += item.total_price_paise;
        }
      } else {
        const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [order_id]);
        if (orderRes.rows.length === 0) throw new Error('Order not found.');
        subtotalPaise = orderRes.rows[0].subtotal_paise;
        if (orderRes.rows[0].order_type === 'takeaway') {
          packagingChargePaise = settings.packaging_charge_paise || 0;
        }
      }

      if (subtotalPaise === 0) {
        throw new Error('Cannot generate bill for 0 items.');
      }

      const taxPercent = Number(settings.tax_rate_percent || 5);
      const servicePercent = Number(settings.service_charge_percent || 0);

      const taxPaise = Math.round(subtotalPaise * (taxPercent / 100));
      const serviceChargePaise = Math.round(subtotalPaise * (servicePercent / 100));
      const unroundedGrandTotal = subtotalPaise - discount_paise + taxPaise + serviceChargePaise + packagingChargePaise;
      
      const remainder = unroundedGrandTotal % 100;
      let roundOffPaise = 0;
      if (remainder >= 50) roundOffPaise = 100 - remainder;
      else if (remainder > 0) roundOffPaise = -remainder;

      const grandTotalPaise = unroundedGrandTotal + roundOffPaise;

      // Sequential Bill Number
      const countRes = await client.query(
        `SELECT COUNT(*) FROM bills WHERE restaurant_id = $1`,
        [restaurant.id]
      );
      const billNumber = `INV-${new Date().getFullYear()}-${1000 + parseInt(countRes.rows[0].count, 10) + 1}`;

      const rawReceiptToken = crypto.randomBytes(24).toString('hex');
      const receiptHash = crypto.createHash('sha256').update(rawReceiptToken).digest('hex');

      const billRes = await client.query(
        `INSERT INTO bills 
          (restaurant_id, bill_number, table_session_id, order_id, subtotal_paise, discount_paise, tax_paise, service_charge_paise, packaging_charge_paise, round_off_paise, grand_total_paise, status, receipt_token_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unpaid', $12)
         RETURNING *`,
        [
          restaurant.id,
          billNumber,
          table_session_id || null,
          order_id || null,
          subtotalPaise,
          discount_paise,
          taxPaise,
          serviceChargePaise,
          packagingChargePaise,
          roundOffPaise,
          grandTotalPaise,
          receiptHash
        ]
      );

      // Update table session status
      if (table_session_id) {
        await client.query(`UPDATE table_sessions SET status = 'bill_generated' WHERE id = $1`, [table_session_id]);
      }

      return {
        ...billRes.rows[0],
        raw_receipt_token: rawReceiptToken
      };
    });

    res.status(201).json({ bill: createdBill });
  } catch (err: any) {
    console.error('Generate bill error:', err);
    res.status(400).json({ error: 'BILL_FAILED', message: err.message || 'Failed to generate bill.' });
  }
});

// ==========================================
// 3. Record Payment & Accrue Loyalty Points
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
    const paymentResult = await withTransaction(async (client) => {
      // 1. Check Bill
      const billRes = await client.query('SELECT * FROM bills WHERE id = $1 AND restaurant_id = $2', [bill_id, restaurant.id]);
      if (billRes.rows.length === 0) throw new Error('Bill not found.');
      const bill = billRes.rows[0];

      // 2. Insert Payment Record
      const payRes = await client.query(
        `INSERT INTO payments (restaurant_id, bill_id, amount_paise, method, status, recorded_by_staff_id, transaction_reference)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6)
         RETURNING *`,
        [restaurant.id, bill.id, amount_paise, method, req.staff?.userId || null, transaction_reference || null]
      );

      // 3. Check Total Paid
      const totalPaidRes = await client.query(
        `SELECT COALESCE(SUM(amount_paise), 0) as total_paid FROM payments WHERE bill_id = $1 AND status = 'completed'`,
        [bill.id]
      );
      const totalPaid = parseInt(totalPaidRes.rows[0].total_paid, 10);

      // 4. If fully paid, mark bill settled
      if (totalPaid >= bill.grand_total_paise) {
        await client.query(`UPDATE bills SET status = 'paid', settled_at = now() WHERE id = $1`, [bill.id]);

        // If linked to table session, close session and free table
        if (bill.table_session_id) {
          const sessionRes = await client.query(`UPDATE table_sessions SET status = 'settled', closed_at = now() WHERE id = $1 RETURNING table_id`, [bill.table_session_id]);
          if (sessionRes.rows.length > 0) {
            await client.query(`UPDATE dining_tables SET status = 'available' WHERE id = $1`, [sessionRes.rows[0].table_id]);
          }
        }

        // Accrue Loyalty Points: 1 point per ₹1 eligible spend (net item subtotal after discount)
        const eligibleSpendPaise = Math.max(0, bill.subtotal_paise - bill.discount_paise);
        const pointsEarned = Math.floor(eligibleSpendPaise / 100);

        if (pointsEarned > 0) {
          // Find customer from order
          const customerRes = await client.query(
            `SELECT customer_id FROM orders 
             WHERE (table_session_id = $1 OR id = $2) AND customer_id IS NOT NULL 
             LIMIT 1`,
            [bill.table_session_id, bill.order_id]
          );

          if (customerRes.rows.length > 0) {
            const customerId = customerRes.rows[0].customer_id;

            // Get previous balance
            const balRes = await client.query(
              `SELECT balance_after FROM loyalty_ledger WHERE restaurant_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 1`,
              [restaurant.id, customerId]
            );
            const prevBalance = balRes.rows.length > 0 ? balRes.rows[0].balance_after : 0;
            const newBalance = prevBalance + pointsEarned;

            await client.query(
              `INSERT INTO loyalty_ledger (restaurant_id, customer_id, points_delta, entry_type, source_bill_id, eligible_spend_paise, balance_after)
               VALUES ($1, $2, $3, 'earn', $4, $5, $6)`,
              [restaurant.id, customerId, pointsEarned, bill.id, eligibleSpendPaise, newBalance]
            );
          }
        }
      }

      return {
        payment: payRes.rows[0],
        total_paid: totalPaid,
        remaining_balance: Math.max(0, bill.grand_total_paise - totalPaid),
        is_fully_paid: totalPaid >= bill.grand_total_paise
      };
    });

    res.status(201).json(paymentResult);
  } catch (err: any) {
    console.error('Payment recording error:', err);
    res.status(400).json({ error: 'PAYMENT_FAILED', message: err.message || 'Failed to record payment.' });
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
      `SELECT b.*, dt.table_number 
       FROM bills b
       LEFT JOIN table_sessions ts ON ts.id = b.table_session_id
       LEFT JOIN dining_tables dt ON dt.id = ts.table_id
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

    res.json({
      restaurant: {
        name: restaurant.name,
        logo_url: restaurant.logo_url,
        primary_color: restaurant.primary_color,
        currency: restaurant.currency
      },
      bill,
      items: itemsRes.rows,
      payments: paymentsRes.rows
    });
  } catch (err: any) {
    console.error('Fetch receipt error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch receipt.' });
  }
});
