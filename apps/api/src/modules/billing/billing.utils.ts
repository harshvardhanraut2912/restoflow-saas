import crypto from 'crypto';

/**
 * Placeholder customer used when a waiter places an order without asking for
 * the guest's phone number. Never earns loyalty and is hidden from CRM lists.
 */
export const WALKIN_PHONE_E164 = '+910000000000';
export const WALKIN_CUSTOMER_NAME = 'Walk-in Guest';

export interface BillAmounts {
  subtotal_paise: number;
  discount_paise: number;
  tax_paise: number;
  service_charge_paise: number;
  packaging_charge_paise: number;
  round_off_paise: number;
  grand_total_paise: number;
}

/**
 * Single source of truth for bill arithmetic (integer paise).
 * Mirrors the formula used by /billing/generate so every code path agrees.
 */
export function computeBillAmounts(opts: {
  subtotalPaise: number;
  discountPaise?: number;
  taxPercent: number;
  servicePercent: number;
  packagingPaise?: number;
}): BillAmounts {
  const subtotal = opts.subtotalPaise;
  const discount = opts.discountPaise ?? 0;
  const packaging = opts.packagingPaise ?? 0;

  const tax = Math.round(subtotal * (opts.taxPercent / 100));
  const service = Math.round(subtotal * (opts.servicePercent / 100));

  const unrounded = subtotal - discount + tax + service + packaging;
  const remainder = unrounded % 100;
  let roundOff = 0;
  if (remainder >= 50) roundOff = 100 - remainder;
  else if (remainder > 0) roundOff = -remainder;

  return {
    subtotal_paise: subtotal,
    discount_paise: discount,
    tax_paise: tax,
    service_charge_paise: service,
    packaging_charge_paise: packaging,
    round_off_paise: roundOff,
    grand_total_paise: unrounded + roundOff
  };
}


// ============================================================================
// SESSION LEDGER  —  the single source of truth for table-bill money.
//
//   total_paise  = the table's whole bill (everything ordered on the session)
//   paid_paise   = sum of completed payments on that bill
//   unpaid_paise = total - paid   (what is still owed right now)
//
// One table session has ONE bill. Adding a dish re-computes that bill from the
// live order items, so:
//   * previous part unpaid  -> new dish is simply added to the unpaid amount
//   * previous part paid    -> total grows, paid stays, unpaid = new dish only
// ============================================================================

export interface Queryable {
  query: (text: string, params?: any[]) => Promise<any>;
}

export const FINAL_ORDER_STATUSES = ['completed', 'cancelled', 'rejected'];
// A session closed by payment can be re-opened by the same guest for this long
export const SETTLED_SESSION_REUSE_MINUTES = 45;

export async function getSessionBill(db: Queryable, restaurantId: string, sessionId: string, lock = false) {
  const res = await db.query(
    `SELECT * FROM bills
     WHERE restaurant_id = $1 AND table_session_id = $2 AND order_id IS NULL AND status != 'voided'
     ORDER BY created_at DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [restaurantId, sessionId]
  );
  return res.rows[0] || null;
}

export async function getPaidTotal(db: Queryable, billId: string): Promise<number> {
  const res = await db.query(
    `SELECT COALESCE(SUM(amount_paise), 0) AS total FROM payments WHERE bill_id = $1 AND status = 'completed'`,
    [billId]
  );
  return parseInt(res.rows[0].total, 10);
}

async function getRates(db: Queryable, restaurantId: string) {
  const r = await db.query(
    `SELECT tax_rate_percent, service_charge_percent FROM restaurant_settings WHERE restaurant_id = $1`,
    [restaurantId]
  );
  const st = r.rows[0] || {};
  return {
    taxPercent: Number(st.tax_rate_percent ?? 5),
    servicePercent: Number(st.service_charge_percent ?? 0)
  };
}

async function getSessionSubtotal(db: Queryable, restaurantId: string, sessionId: string): Promise<number> {
  const res = await db.query(
    `SELECT COALESCE(SUM(oi.total_price_paise), 0) AS subtotal
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.table_session_id = $1 AND o.restaurant_id = $2 AND o.status NOT IN ('cancelled', 'rejected')`,
    [sessionId, restaurantId]
  );
  return parseInt(res.rows[0].subtotal, 10);
}

/** Create the session's bill from everything currently ordered on it. */
export async function createSessionBill(
  db: Queryable,
  restaurantId: string,
  sessionId: string,
  discountPaise = 0
) {
  const subtotal = await getSessionSubtotal(db, restaurantId, sessionId);
  if (subtotal === 0) throw new Error('Cannot generate bill for 0 items.');

  const { taxPercent, servicePercent } = await getRates(db, restaurantId);
  const a = computeBillAmounts({ subtotalPaise: subtotal, discountPaise, taxPercent, servicePercent });

  const countRes = await db.query(`SELECT COUNT(*) FROM bills WHERE restaurant_id = $1`, [restaurantId]);
  const billNumber = `INV-${new Date().getFullYear()}-${1000 + parseInt(countRes.rows[0].count, 10) + 1}`;
  const rawToken = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const ins = await db.query(
    `INSERT INTO bills
      (restaurant_id, bill_number, table_session_id, order_id, subtotal_paise, discount_paise, tax_paise,
       service_charge_paise, packaging_charge_paise, round_off_paise, grand_total_paise, status, receipt_token_hash)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 0, $8, $9, 'unpaid', $10)
     RETURNING *`,
    [restaurantId, billNumber, sessionId, a.subtotal_paise, a.discount_paise, a.tax_paise,
     a.service_charge_paise, a.round_off_paise, a.grand_total_paise, hash]
  );
  return { ...ins.rows[0], raw_receipt_token: rawToken };
}

/**
 * Re-compute the session bill from the live (non-cancelled) order items and
 * re-derive its status from the payments already made. Call after ANY change
 * to the orders of a session (new order, cancel, delete).
 *
 * `settled_at` is intentionally kept when a paid bill grows: it marks the
 * moment everything ordered up to then was paid, so every order created after
 * it is known to be unpaid.
 */
export async function syncSessionBill(
  db: Queryable,
  restaurantId: string,
  sessionId: string,
  opts: { discountPaise?: number } = {}
) {
  const bill = await getSessionBill(db, restaurantId, sessionId, true);
  if (!bill) return null;

  const subtotal = await getSessionSubtotal(db, restaurantId, sessionId);
  const { taxPercent, servicePercent } = await getRates(db, restaurantId);
  const discount = opts.discountPaise ?? bill.discount_paise ?? 0;

  const a = computeBillAmounts({
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxPercent,
    servicePercent,
    packagingPaise: bill.packaging_charge_paise || 0
  });

  const paid = await getPaidTotal(db, bill.id);
  const status = paid >= a.grand_total_paise && paid > 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid';

  const upd = await db.query(
    `UPDATE bills SET subtotal_paise = $1, discount_paise = $2, tax_paise = $3, service_charge_paise = $4,
       round_off_paise = $5, grand_total_paise = $6, status = $7 WHERE id = $8 RETURNING *`,
    [a.subtotal_paise, a.discount_paise, a.tax_paise, a.service_charge_paise, a.round_off_paise,
     a.grand_total_paise, status, bill.id]
  );
  return upd.rows[0];
}

/** An order is paid when a settlement happened at/after it was placed (or a legacy per-order bill is paid). */
export function isOrderPaid(order: { id: string; created_at: any }, sessionBill: any, legacyPaidOrderIds: Set<string>) {
  if (legacyPaidOrderIds.has(order.id)) return true;
  if (!sessionBill || !sessionBill.settled_at) return false;
  return new Date(order.created_at).getTime() <= new Date(sessionBill.settled_at).getTime();
}

/** Full money picture of a table session. Used by the customer bill, order page and waiter panel. */
export async function getSessionLedger(
  db: Queryable,
  restaurantId: string,
  sessionId: string,
  rates: { taxPercent: number; servicePercent: number }
) {
  const ordersRes = await db.query(
    `SELECT * FROM orders
     WHERE table_session_id = $1 AND restaurant_id = $2 AND status NOT IN ('cancelled', 'rejected')
     ORDER BY created_at ASC`,
    [sessionId, restaurantId]
  );
  const orders: any[] = ordersRes.rows;
  const orderIds = orders.map((o) => o.id);

  const itemsRes = orderIds.length
    ? await db.query(`SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id ASC`, [orderIds])
    : { rows: [] };
  const items: any[] = itemsRes.rows;
  const itemsSubtotal = items.reduce((n, it) => n + it.total_price_paise, 0);

  const bill = await getSessionBill(db, restaurantId, sessionId);
  const legacyRes = orderIds.length
    ? await db.query(
        `SELECT order_id FROM bills WHERE order_id = ANY($1) AND status = 'paid'`,
        [orderIds]
      )
    : { rows: [] };
  const legacyPaid = new Set<string>(legacyRes.rows.map((r: any) => r.order_id));

  let amounts: BillAmounts;
  let paid = 0;
  if (bill) {
    amounts = {
      subtotal_paise: bill.subtotal_paise,
      discount_paise: bill.discount_paise || 0,
      tax_paise: bill.tax_paise || 0,
      service_charge_paise: bill.service_charge_paise || 0,
      packaging_charge_paise: bill.packaging_charge_paise || 0,
      round_off_paise: bill.round_off_paise || 0,
      grand_total_paise: bill.grand_total_paise
    };
    paid = await getPaidTotal(db, bill.id);
  } else {
    amounts = computeBillAmounts({
      subtotalPaise: itemsSubtotal,
      taxPercent: rates.taxPercent,
      servicePercent: rates.servicePercent
    });
  }

  const unpaid = Math.max(0, amounts.grand_total_paise - paid);

  const ordersOut = orders.map((o, idx) => {
    const { access_token_hash: _omit, ...safe } = o;
    return { ...safe, round_number: idx + 1, is_paid: isOrderPaid(o, bill, legacyPaid) };
  });

  return {
    bill,
    orders: ordersOut,
    items,
    amounts,
    total_paise: amounts.grand_total_paise,
    paid_paise: paid,
    unpaid_paise: unpaid,
    is_fully_paid: amounts.grand_total_paise > 0 && unpaid === 0
  };
}

/**
 * After the session bill is fully paid: complete the orders that are already served
 * and free the table only when nothing is still being cooked/served. Orders still in
 * the kitchen keep their live progress (the guest keeps tracking them).
 */
export async function settleSessionIfPaid(db: Queryable, restaurantId: string, sessionId: string) {
  const bill = await getSessionBill(db, restaurantId, sessionId);
  if (!bill || bill.status !== 'paid' || !bill.settled_at) return { session_closed: false };

  await db.query(
    `UPDATE orders SET status = 'completed', updated_at = now()
     WHERE table_session_id = $1 AND restaurant_id = $2 AND status = 'served' AND created_at <= $3`,
    [sessionId, restaurantId, bill.settled_at]
  );

  const remaining = await db.query(
    `SELECT COUNT(*) FROM orders
     WHERE table_session_id = $1 AND restaurant_id = $2 AND status NOT IN ('completed', 'cancelled', 'rejected')`,
    [sessionId, restaurantId]
  );
  if (parseInt(remaining.rows[0].count, 10) > 0) return { session_closed: false };

  const s = await db.query(
    `UPDATE table_sessions SET status = 'closed', closed_at = now()
     WHERE id = $1 AND status != 'closed' RETURNING table_id`,
    [sessionId]
  );
  if (s.rows.length > 0) {
    await db.query(`UPDATE dining_tables SET status = 'available' WHERE id = $1`, [s.rows[0].table_id]);
  }
  return { session_closed: true };
}

/**
 * Record a payment against a bill (staff or customer). Never pays more than what is unpaid.
 * amountPaise = null  ->  pay the whole unpaid balance.
 */
export async function applyPayment(
  db: Queryable,
  restaurantId: string,
  billId: string,
  opts: { amountPaise?: number | null; method: string; staffId?: string | null; reference?: string | null }
) {
  const billRes = await db.query(`SELECT * FROM bills WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`, [billId, restaurantId]);
  if (billRes.rows.length === 0) throw new Error('Bill not found.');
  let bill = billRes.rows[0];
  if (bill.status === 'voided') throw new Error('This bill was voided.');

  // Make sure the total reflects every order on the table right now
  if (bill.table_session_id && !bill.order_id) {
    bill = (await syncSessionBill(db, restaurantId, bill.table_session_id)) || bill;
  }

  const paidBefore = await getPaidTotal(db, bill.id);
  const unpaid = Math.max(0, bill.grand_total_paise - paidBefore);

  if (unpaid === 0) {
    return { payment: null, bill, total_paise: bill.grand_total_paise, paid_paise: paidBefore, unpaid_paise: 0,
      is_fully_paid: true, already_paid: true, session_closed: false };
  }

  const amount = opts.amountPaise ?? unpaid;
  if (amount <= 0) throw new Error('Invalid payment amount.');
  if (amount > unpaid) {
    throw new Error(`Amount exceeds the unpaid balance of ₹${(unpaid / 100).toFixed(2)}.`);
  }

  const payRes = await db.query(
    `INSERT INTO payments (restaurant_id, bill_id, amount_paise, method, status, recorded_by_staff_id, transaction_reference)
     VALUES ($1, $2, $3, $4, 'completed', $5, $6) RETURNING *`,
    [restaurantId, bill.id, amount, opts.method, opts.staffId || null, opts.reference || null]
  );

  const paidAfter = paidBefore + amount;
  const fullyPaid = paidAfter >= bill.grand_total_paise;

  const upd = await db.query(
    fullyPaid
      ? `UPDATE bills SET status = 'paid', settled_at = now() WHERE id = $1 RETURNING *`
      : `UPDATE bills SET status = 'partially_paid' WHERE id = $1 RETURNING *`,
    [bill.id]
  );
  bill = upd.rows[0];

  let sessionClosed = false;
  if (fullyPaid) {
    // Loyalty: 1 point per ₹1 of net spend, only for spend not already rewarded on this bill
    const eligible = Math.max(0, bill.subtotal_paise - (bill.discount_paise || 0));
    const targetPoints = Math.floor(eligible / 100);
    const earnedRes = await db.query(
      `SELECT COALESCE(SUM(points_delta), 0) AS pts FROM loyalty_ledger
       WHERE source_bill_id = $1 AND entry_type = 'earn'`,
      [bill.id]
    );
    const newPoints = targetPoints - parseInt(earnedRes.rows[0].pts, 10);
    if (newPoints > 0) {
      const custRes = await db.query(
        `SELECT o.customer_id FROM orders o JOIN customers c ON c.id = o.customer_id
         WHERE (o.table_session_id = $1 OR o.id = $2) AND c.phone_e164 <> $3
         ORDER BY o.created_at ASC LIMIT 1`,
        [bill.table_session_id, bill.order_id, WALKIN_PHONE_E164]
      );
      if (custRes.rows.length > 0) {
        const customerId = custRes.rows[0].customer_id;
        const balRes = await db.query(
          `SELECT balance_after FROM loyalty_ledger WHERE restaurant_id = $1 AND customer_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [restaurantId, customerId]
        );
        const prev = balRes.rows.length > 0 ? balRes.rows[0].balance_after : 0;
        await db.query(
          `INSERT INTO loyalty_ledger (restaurant_id, customer_id, points_delta, entry_type, source_bill_id, eligible_spend_paise, balance_after)
           VALUES ($1, $2, $3, 'earn', $4, $5, $6)`,
          [restaurantId, customerId, newPoints, bill.id, eligible, prev + newPoints]
        );
      }
    }

    if (bill.table_session_id && !bill.order_id) {
      sessionClosed = (await settleSessionIfPaid(db, restaurantId, bill.table_session_id)).session_closed;
    } else if (bill.order_id) {
      // Legacy single-order bill (takeaway / unbound order)
      const o = await db.query(
        `UPDATE orders SET status = 'completed', updated_at = now()
         WHERE id = $1 AND status NOT IN ('cancelled', 'rejected') RETURNING table_id, table_session_id`,
        [bill.order_id]
      );
      const ord = o.rows[0];
      if (ord?.table_session_id) {
        const rem = await db.query(
          `SELECT COUNT(*) FROM orders WHERE table_session_id = $1 AND status NOT IN ('completed','cancelled','rejected')`,
          [ord.table_session_id]
        );
        if (parseInt(rem.rows[0].count, 10) === 0) {
          await db.query(`UPDATE table_sessions SET status = 'closed', closed_at = now() WHERE id = $1 AND status != 'closed'`, [ord.table_session_id]);
          if (ord.table_id) await db.query(`UPDATE dining_tables SET status = 'available' WHERE id = $1`, [ord.table_id]);
          sessionClosed = true;
        }
      }
    }
  }

  return {
    payment: payRes.rows[0],
    bill,
    total_paise: bill.grand_total_paise,
    paid_paise: paidAfter,
    unpaid_paise: Math.max(0, bill.grand_total_paise - paidAfter),
    is_fully_paid: fullyPaid,
    already_paid: false,
    session_closed: sessionClosed
  };
}
