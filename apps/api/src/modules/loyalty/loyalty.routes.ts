import { Router, Request, Response } from 'express';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query } from '../../db/index.js';

export const loyaltyRouter = Router();

// Manager Customer List with Loyalty Balances
loyaltyRouter.get('/customers', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT 
        c.id,
        c.name,
        c.phone_e164,
        c.created_at,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(b.grand_total_paise), 0) as total_spent_paise,
        COALESCE(
          (SELECT balance_after FROM loyalty_ledger WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1), 
          0
        ) as loyalty_balance
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       LEFT JOIN bills b ON (b.table_session_id = o.table_session_id OR b.order_id = o.id) AND b.status = 'paid'
       WHERE c.restaurant_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [restaurant.id]
    );

    res.json({ customers: result.rows });
  } catch (err: any) {
    console.error('Fetch customers error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch customers.' });
  }
});

// Manager Loyalty Points Ledger (Redemption disabled in initial release as specified)
loyaltyRouter.get('/ledger', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT 
        ll.*,
        c.name as customer_name,
        c.phone_e164,
        b.bill_number
       FROM loyalty_ledger ll
       JOIN customers c ON c.id = ll.customer_id
       LEFT JOIN bills b ON b.id = ll.source_bill_id
       WHERE ll.restaurant_id = $1
       ORDER BY ll.created_at DESC LIMIT 100`,
      [restaurant.id]
    );

    res.json({ ledger: result.rows });
  } catch (err: any) {
    console.error('Fetch loyalty ledger error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch loyalty ledger.' });
  }
});

// Manager Sales Analytics (Derived strictly from verified paid bills)
loyaltyRouter.get('/sales', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    // 1. Overall Verified Totals
    const totalsRes = await query(
      `SELECT 
        COUNT(id) as total_bills_paid,
        COALESCE(SUM(subtotal_paise), 0) as total_net_sales_paise,
        COALESCE(SUM(tax_paise), 0) as total_tax_collected_paise,
        COALESCE(SUM(grand_total_paise), 0) as total_gross_sales_paise
       FROM bills 
       WHERE restaurant_id = $1 AND status = 'paid'`,
      [restaurant.id]
    );

    // 2. Sales by Payment Method
    const methodRes = await query(
      `SELECT 
        p.method,
        COUNT(p.id) as payment_count,
        COALESCE(SUM(p.amount_paise), 0) as total_amount_paise
       FROM payments p
       JOIN bills b ON b.id = p.bill_id
       WHERE p.restaurant_id = $1 AND p.status = 'completed' AND b.status = 'paid'
       GROUP BY p.method`,
      [restaurant.id]
    );

    // 3. Top Selling Menu Items
    const topItemsRes = await query(
      `SELECT 
        oi.name_snapshot as item_name,
        SUM(oi.quantity) as total_quantity_sold,
        SUM(oi.total_price_paise) as total_revenue_paise
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.restaurant_id = $1 AND o.status NOT IN ('cancelled', 'rejected')
       GROUP BY oi.name_snapshot
       ORDER BY total_quantity_sold DESC LIMIT 10`,
      [restaurant.id]
    );

    // 4. Daily Sales Trend (Last 7 Days)
    const trendRes = await query(
      `SELECT 
        TO_CHAR(settled_at, 'YYYY-MM-DD') as day,
        COUNT(id) as bill_count,
        COALESCE(SUM(grand_total_paise), 0) as revenue_paise
       FROM bills 
       WHERE restaurant_id = $1 AND status = 'paid' AND settled_at >= NOW() - INTERVAL '7 days'
       GROUP BY TO_CHAR(settled_at, 'YYYY-MM-DD')
       ORDER BY day ASC`,
      [restaurant.id]
    );

    res.json({
      summary: totalsRes.rows[0],
      payment_methods: methodRes.rows,
      top_items: topItemsRes.rows,
      daily_trend: trendRes.rows
    });
  } catch (err: any) {
    console.error('Fetch sales reports error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to generate sales report.' });
  }
});
