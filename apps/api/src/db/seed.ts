import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction, pool } from './index.js';

export async function runSeed() {
  console.log('🌱 Starting database seed for multi-tenant platform...');

  await withTransaction(async (client) => {
    // Check if Royal Spice Bistro exists
    const existing = await client.query('SELECT id FROM restaurants WHERE slug = $1', ['royalspice']);
    if (existing.rows.length > 0) {
      console.log('ℹ️  Seed data already present, skipping duplicate seed.');
      return;
    }

    const defaultPassHash = await bcrypt.hash('Manager@123', 10);
    const waiterPassHash = await bcrypt.hash('Waiter@123', 10);
    const kitchenPassHash = await bcrypt.hash('Kitchen@123', 10);

    // ==========================================
    // 1. Restaurant 1: Royal Spice Bistro
    // ==========================================
    const r1 = await client.query(
      `INSERT INTO restaurants 
        (name, slug, primary_domain, logo_url, primary_color, secondary_color, status)
       VALUES 
        ('Royal Spice Bistro', 'royalspice', 'royalspice.localhost', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200', '#e11d48', '#1e293b', 'active')
       RETURNING *`
    );
    const resto1 = r1.rows[0];

    await client.query(
      `INSERT INTO restaurant_settings 
        (restaurant_id, tax_rate_percent, service_charge_percent, packaging_charge_paise, dine_in_enabled, takeaway_enabled, loyalty_enabled, loyalty_earn_ratio)
       VALUES ($1, 5.00, 2.50, 2500, true, true, true, 1.00)`,
      [resto1.id]
    );

    // Staff for Resto 1
    await client.query(
      `INSERT INTO staff_users (restaurant_id, email, password_hash, full_name, role, is_active)
       VALUES 
        ($1, 'manager@royalspice.com', $2, 'Aarav Sharma (Manager)', 'manager', true),
        ($1, 'waiter@royalspice.com', $3, 'Rohan Verma (Floor Captain)', 'waiter', true),
        ($1, 'kitchen@royalspice.com', $4, 'Chef Rajesh Kumar (Head Chef)', 'kitchen', true)`,
      [resto1.id, defaultPassHash, waiterPassHash, kitchenPassHash]
    );

    // Categories
    const c1 = await client.query(
      `INSERT INTO menu_categories (restaurant_id, name, description, sort_order)
       VALUES 
        ($1, 'Starters & Tandoor', 'Sizzling hot appetizers straight from our clay oven', 1),
        ($1, 'Curries & Main Course', 'Rich aromatic curries simmered with house-ground spices', 2),
        ($1, 'Artisanal Breads & Rice', 'Freshly baked tandoori naans and fragrant basmati biryanis', 3),
        ($1, 'Desserts & Beverages', 'Sweet treats and handcrafted coolers', 4)
       RETURNING id, name`,
      [resto1.id]
    );
    const catMap = Object.fromEntries(c1.rows.map((r) => [r.name, r.id]));

    // Items with full details: description, image_url, prep time, dietary type
    const item1 = await client.query(
      `INSERT INTO menu_items 
        (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
       VALUES 
        ($1, $2, 'Paneer Tikka Angaare', 'Fresh malai paneer cubes marinated in Kashmiri red chilli, yogurt, and crushed tandoori spices, char-grilled to perfection with bell peppers and onions.', 28000, 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600', 'veg', 18, true, 1)
       RETURNING id`,
      [resto1.id, catMap['Starters & Tandoor']]
    );

    // Variants for Paneer Tikka
    await client.query(
      `INSERT INTO menu_variants (restaurant_id, menu_item_id, name, price_paise)
       VALUES 
        ($1, $2, 'Regular (6 Pcs)', 28000),
        ($1, $2, 'Large Platter (10 Pcs)', 42000)`,
      [resto1.id, item1.rows[0].id]
    );

    // Modifiers for Paneer Tikka
    const mg1 = await client.query(
      `INSERT INTO modifier_groups (restaurant_id, name, min_selection, max_selection, is_required)
       VALUES ($1, 'Spice Level', 1, 1, true)
       RETURNING id`,
      [resto1.id]
    );
    await client.query(
      `INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES ($1, $2)`,
      [item1.rows[0].id, mg1.rows[0].id]
    );
    await client.query(
      `INSERT INTO modifiers (restaurant_id, modifier_group_id, name, price_paise)
       VALUES 
        ($1, $2, 'Mild', 0),
        ($1, $2, 'Medium Spicy', 0),
        ($1, $2, 'Extra Hot Angaare', 0)`,
      [resto1.id, mg1.rows[0].id]
    );

    // Item 2: Butter Chicken
    const item2 = await client.query(
      `INSERT INTO menu_items 
        (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
       VALUES 
        ($1, $2, 'Old Delhi Butter Chicken', 'Succulent boneless tandoori chicken chunks simmered in a velvety, satin-smooth makhani gravy enriched with fresh cream and butter.', 36000, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600', 'non_veg', 20, true, 2)
       RETURNING id`,
      [resto1.id, catMap['Curries & Main Course']]
    );

    await client.query(
      `INSERT INTO menu_variants (restaurant_id, menu_item_id, name, price_paise)
       VALUES 
        ($1, $2, 'Half Portion', 24000),
        ($1, $2, 'Full Handi', 36000)`,
      [resto1.id, item2.rows[0].id]
    );

    // Item 3: Dal Makhani
    await client.query(
      `INSERT INTO menu_items 
        (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
       VALUES 
        ($1, $2, 'Dal Makhani Dum Pukht', 'Urad lentils slow-cooked overnight for 24 hours on slow charcoal embers with organic white butter and Kashmiri tomatoes.', 26000, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600', 'veg', 15, true, 3)`,
      [resto1.id, catMap['Curries & Main Course']]
    );

    // Item 4: Garlic Butter Naan
    await client.query(
      `INSERT INTO menu_items 
        (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
       VALUES 
        ($1, $2, 'Garlic Butter Naan', 'Hand-stretched leavened refined flour flatbread topped with finely minced garlic, fresh coriander, and melted Amul butter.', 6500, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600', 'veg', 8, true, 4)`,
      [resto1.id, catMap['Artisanal Breads & Rice']]
    );

    // Item 5: Gulab Jamun
    await client.query(
      `INSERT INTO menu_items 
        (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
       VALUES 
        ($1, $2, 'Shahi Gulab Jamun (2 Pcs)', 'Soft, golden-fried reduced milk dumplings steeped in fragrant saffron, cardamom, and rose water syrup.', 12000, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600', 'veg', 5, true, 5)`,
      [resto1.id, catMap['Desserts & Beverages']]
    );

    // Tables & QR tokens for Royal Spice Bistro
    const tables = [
      { num: 'T-01', cap: 2 },
      { num: 'T-02', cap: 4 },
      { num: 'T-03', cap: 4 },
      { num: 'T-04', cap: 6 },
      { num: 'T-05', cap: 8 },
    ];

    for (const t of tables) {
      const tRes = await client.query(
        `INSERT INTO dining_tables (restaurant_id, table_number, capacity, status)
         VALUES ($1, $2, $3, 'available')
         RETURNING id`,
        [resto1.id, t.num, t.cap]
      );

      // Deterministic dev token for Table 1 so we can easily test QR links!
      const rawToken = t.num === 'T-01' ? 'demo_token_table_1_royalspice' : crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await client.query(
        `INSERT INTO table_qr_tokens (restaurant_id, table_id, token_hash)
         VALUES ($1, $2, $3)`,
        [resto1.id, tRes.rows[0].id, tokenHash]
      );
    }

    // ==========================================
    // 2. Restaurant 2: Urban Crust Pizzeria (Proving Multi-Tenancy)
    // ==========================================
    const r2 = await client.query(
      `INSERT INTO restaurants 
        (name, slug, primary_domain, logo_url, primary_color, secondary_color, status)
       VALUES 
        ('Urban Crust Pizzeria', 'urbancrust', 'urbancrust.localhost', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200', '#ea580c', '#0f172a', 'active')
       RETURNING *`
    );
    const resto2 = r2.rows[0];

    await client.query(
      `INSERT INTO restaurant_settings 
        (restaurant_id, tax_rate_percent, service_charge_percent, packaging_charge_paise, dine_in_enabled, takeaway_enabled, loyalty_enabled)
       VALUES ($1, 5.00, 0.00, 3000, true, true, true)`,
      [resto2.id]
    );

    await client.query(
      `INSERT INTO staff_users (restaurant_id, email, password_hash, full_name, role, is_active)
       VALUES ($1, 'manager@urbancrust.com', $2, 'Marco Rossi', 'manager', true)`,
      [resto2.id, defaultPassHash]
    );

    console.log('✅ Seed completed successfully with 2 distinct restaurant tenants!');
  });
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed failed:', err);
      pool.end();
      process.exit(1);
    });
}
