process.env.IS_TEST = 'true';
import assert from 'assert';
import http from 'http';
import app from '../index.js';
import { env } from '../config/env.js';

let server: http.Server;
const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function fetchJson(endpoint: string, options: any = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('🧪 Starting End-to-End System Integration Tests...\n');

  server = app.listen(PORT);
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // ----------------------------------------------------------------
    // 1. DevAdmin Authentication & Overview
    // ----------------------------------------------------------------
    console.log('1️⃣ Testing DevAdmin Authentication & Overview...');
    const devLogin = await fetchJson('/devadmin/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: env.DEVADMIN_EMAIL,
        password: env.DEVADMIN_PASSWORD
      })
    });
    assert.strictEqual(devLogin.status, 200, 'DevAdmin login should return 200');
    assert.ok(devLogin.data.token, 'DevAdmin token should be issued');
    const devToken = devLogin.data.token;

    const devOverview = await fetchJson('/devadmin/overview', {
      headers: { Authorization: `Bearer ${devToken}` }
    });
    assert.strictEqual(devOverview.status, 200, 'DevAdmin overview should return 200');
    assert.ok(parseInt(devOverview.data.stats.total_restaurants, 10) >= 2, 'Should have at least 2 seeded restaurants');
    console.log('   ✅ DevAdmin Auth and System Overview passed.');

    // ----------------------------------------------------------------
    // 2. Multi-Tenant Restaurant Resolution & Public Branding
    // ----------------------------------------------------------------
    console.log('\n2️⃣ Testing Multi-Tenant Resolution & Dynamic Branding...');
    const restoPublic = await fetchJson('/public/restaurant', {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(restoPublic.status, 200);
    assert.strictEqual(restoPublic.data.restaurant.name, 'Royal Spice Bistro');
    assert.strictEqual(restoPublic.data.restaurant.slug, 'royalspice');
    assert.strictEqual(restoPublic.data.restaurant.currency, 'INR');
    const restaurantId = restoPublic.data.restaurant.id;
    console.log('   ✅ Restaurant identity resolved dynamically from DB:', restoPublic.data.restaurant.name);

    // ----------------------------------------------------------------
    // 3. QR Token Resolution & Table Session Creation
    // ----------------------------------------------------------------
    console.log('\n3️⃣ Testing Opaque QR Token Resolution & Table Session Creation...');
    const qrRes = await fetchJson('/public/qr/resolve?t=demo_token_table_1_royalspice', {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(qrRes.status, 200);
    assert.strictEqual(qrRes.data.table.table_number, 'T-01');
    assert.ok(qrRes.data.session.id, 'Session should be created');
    const tableId = qrRes.data.table.id;
    const sessionId = qrRes.data.session.id;
    console.log(`   ✅ QR token resolved to Table ${qrRes.data.table.table_number} with Active Session ID: ${sessionId}`);

    // ----------------------------------------------------------------
    // 4. Menu Retrieval & Item Attributes
    // ----------------------------------------------------------------
    console.log('\n4️⃣ Testing Menu Retrieval & Recipe Attributes...');
    const menuRes = await fetchJson('/menu/public', {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(menuRes.status, 200);
    assert.ok(menuRes.data.categories.length > 0, 'Menu should contain categories');

    const firstCat = menuRes.data.categories[0];
    const paneerTikka = firstCat.items.find((i: any) => i.name.includes('Paneer Tikka'));
    assert.ok(paneerTikka, 'Paneer Tikka should be present');
    assert.strictEqual(paneerTikka.dietary_type, 'veg');
    assert.strictEqual(paneerTikka.preparation_time_minutes, 18);
    assert.strictEqual(paneerTikka.base_price_paise, 28000);
    console.log(`   ✅ Menu item validated: "${paneerTikka.name}" (Prep: ${paneerTikka.preparation_time_minutes}m, ₹${paneerTikka.base_price_paise / 100})`);

    // ----------------------------------------------------------------
    // 5. Customer Checkout & Transactional Order Engine
    // ----------------------------------------------------------------
    console.log('\n5️⃣ Testing Customer Checkout with Mandatory Mobile Number...');
    const checkoutRes = await fetchJson('/orders/customer/checkout', {
      method: 'POST',
      headers: { 'x-restaurant-slug': 'royalspice' },
      body: JSON.stringify({
        order_type: 'dine_in',
        table_id: tableId,
        table_session_id: sessionId,
        phone: '9876543210',
        customer_name: 'Test Gourmet',
        notes: 'Extra crispy',
        items: [
          {
            menu_item_id: paneerTikka.id,
            quantity: 2
          }
        ]
      })
    });
    assert.strictEqual(checkoutRes.status, 201, 'Order should be created successfully');
    assert.ok(checkoutRes.data.order_id);
    assert.ok(checkoutRes.data.access_token);
    assert.strictEqual(checkoutRes.data.subtotal_paise, 28000 * 2, 'Subtotal should match recalculated server price');
    const orderId = checkoutRes.data.order_id;
    const orderAccessToken = checkoutRes.data.access_token;
    console.log(`   ✅ Order created: ${checkoutRes.data.order_number} (Subtotal: ₹${checkoutRes.data.subtotal_paise / 100})`);

    // ----------------------------------------------------------------
    // 6. Unguessable Customer Tracking Token Security
    // ----------------------------------------------------------------
    console.log('\n6️⃣ Testing Order Tracking Security with Access Token...');
    // Without token -> 401
    const noToken = await fetchJson(`/orders/customer/${orderId}`, {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(noToken.status, 401, 'Should block access without token');

    // With valid token -> 200
    const withToken = await fetchJson(`/orders/customer/${orderId}?token=${orderAccessToken}`, {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(withToken.status, 200, 'Should allow access with valid token');
    assert.strictEqual(withToken.data.order.items.length, 1);
    console.log('   ✅ Customer tracking access token verified securely.');

    // ----------------------------------------------------------------
    // 7. Kitchen Display System (KDS) Status Machine
    // ----------------------------------------------------------------
    console.log('\n7️⃣ Testing Staff Login & Kitchen KDS Live Tickets...');
    // Staff login as kitchen chef
    const kitchenLogin = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'x-restaurant-slug': 'royalspice' },
      body: JSON.stringify({
        email: 'kitchen@royalspice.com',
        password: 'Kitchen@123'
      })
    });
    assert.strictEqual(kitchenLogin.status, 200);
    const kitchenToken = kitchenLogin.data.token;

    // Get tickets
    const ticketsRes = await fetchJson('/kitchen/tickets', {
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${kitchenToken}`
      }
    });
    assert.strictEqual(ticketsRes.status, 200);
    const activeTicket = ticketsRes.data.tickets.find((t: any) => t.order_id === orderId);
    assert.ok(activeTicket, 'Kitchen should see ticket for active order');
    console.log(`   ✅ Kitchen Ticket visible: ${activeTicket.ticket_number} for Order ${activeTicket.order_number}`);

    // Update status to preparing
    const prepRes = await fetchJson(`/kitchen/tickets/${activeTicket.ticket_id}/status`, {
      method: 'PATCH',
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${kitchenToken}`
      },
      body: JSON.stringify({ status: 'preparing' })
    });
    assert.strictEqual(prepRes.status, 200);
    assert.strictEqual(prepRes.data.ticket.status, 'preparing');

    // Update status to ready
    const readyRes = await fetchJson(`/kitchen/tickets/${activeTicket.ticket_id}/status`, {
      method: 'PATCH',
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${kitchenToken}`
      },
      body: JSON.stringify({ status: 'ready' })
    });
    assert.strictEqual(readyRes.status, 200);
    assert.strictEqual(readyRes.data.ticket.status, 'ready');
    console.log('   ✅ Ticket successfully transitioned: new -> preparing -> ready.');

    // ----------------------------------------------------------------
    // 8. Waiter Billing, Integer Paise Math & Payment Settlement
    // ----------------------------------------------------------------
    console.log('\n8️⃣ Testing Waiter Floor, Billing Math & Loyalty Points Accrual...');
    const waiterLogin = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'x-restaurant-slug': 'royalspice' },
      body: JSON.stringify({
        email: 'waiter@royalspice.com',
        password: 'Waiter@123'
      })
    });
    assert.strictEqual(waiterLogin.status, 200);
    const waiterToken = waiterLogin.data.token;

    // Generate Final Bill
    const billGen = await fetchJson('/billing/generate', {
      method: 'POST',
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${waiterToken}`
      },
      body: JSON.stringify({ table_session_id: sessionId })
    });
    assert.strictEqual(billGen.status, 201);
    const bill = billGen.data.bill;
    assert.ok(bill.grand_total_paise > 0);
    console.log(`   ✅ Bill generated: ${bill.bill_number} (Subtotal: ₹${bill.subtotal_paise / 100}, Tax: ₹${bill.tax_paise / 100}, Grand Total: ₹${bill.grand_total_paise / 100})`);

    // Settle Bill with Cash Payment
    const paymentRes = await fetchJson('/billing/payments', {
      method: 'POST',
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${waiterToken}`
      },
      body: JSON.stringify({
        bill_id: bill.id,
        amount_paise: bill.grand_total_paise,
        method: 'cash'
      })
    });
    assert.strictEqual(paymentRes.status, 201);
    assert.strictEqual(paymentRes.data.is_fully_paid, true);
    console.log('   ✅ Bill settled in full via Cash payment. Table freed.');

    // Check Loyalty Points Ledger (1 pt per ₹1 eligible net item spend)
    const managerLogin = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'x-restaurant-slug': 'royalspice' },
      body: JSON.stringify({
        email: 'manager@royalspice.com',
        password: 'Manager@123'
      })
    });
    const managerToken = managerLogin.data.token;

    const loyaltyRes = await fetchJson('/loyalty/ledger', {
      headers: {
        'x-restaurant-slug': 'royalspice',
        Authorization: `Bearer ${managerToken}`
      }
    });
    assert.strictEqual(loyaltyRes.status, 200);
    const pointsEntry = loyaltyRes.data.ledger.find((l: any) => l.source_bill_id === bill.id);
    assert.ok(pointsEntry, 'Loyalty points should be accrued for paid bill');
    const expectedPoints = Math.floor(bill.subtotal_paise / 100);
    assert.strictEqual(pointsEntry.points_delta, expectedPoints, `Should earn 1 point per ₹1 spend (${expectedPoints} points)`);
    console.log(`   ✅ Loyalty points verified: +${pointsEntry.points_delta} points accrued to customer balance.`);

    // ----------------------------------------------------------------
    // 9. DevAdmin Pause Service Isolation Test
    // ----------------------------------------------------------------
    console.log('\n9️⃣ Testing DevAdmin Pause / Suspend Restaurant Service...');
    // DevAdmin pauses Royal Spice Bistro
    const pauseRes = await fetchJson(`/devadmin/restaurants/${restaurantId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.data.restaurant.status, 'suspended');

    // Attempting to access customer menu should now be rejected with 403 RESTAURANT_SUSPENDED!
    const suspendedReq = await fetchJson('/public/restaurant', {
      headers: { 'x-restaurant-slug': 'royalspice' }
    });
    assert.strictEqual(suspendedReq.status, 403, 'Suspended restaurant should reject public requests with 403');
    assert.strictEqual(suspendedReq.data.error, 'RESTAURANT_SUSPENDED');
    console.log('   ✅ Suspended restaurant successfully blocked with 403 RESTAURANT_SUSPENDED.');

    // Meanwhile, other restaurant (Urban Crust) must remain ACTIVE and unaffected!
    const urbanCrustReq = await fetchJson('/public/restaurant', {
      headers: { 'x-restaurant-slug': 'urbancrust' }
    });
    assert.strictEqual(urbanCrustReq.status, 200, 'Other restaurants must remain active and unaffected');
    assert.strictEqual(urbanCrustReq.data.restaurant.status, 'active');
    console.log('   ✅ Multi-tenant isolation verified: Urban Crust Pizzeria remains online.');

    // DevAdmin resumes Royal Spice Bistro
    const resumeRes = await fetchJson(`/devadmin/restaurants/${restaurantId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ status: 'active' })
    });
    assert.strictEqual(resumeRes.status, 200);
    assert.strictEqual(resumeRes.data.restaurant.status, 'active');
    console.log('   ✅ Royal Spice Bistro service resumed active by DevAdmin.');

    console.log('\n🎉 ALL 9 END-TO-END INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
