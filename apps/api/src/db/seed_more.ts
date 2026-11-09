import crypto from 'crypto';
import { query, withTransaction, pool } from './index.js';

export async function addMoreDummyData() {
  console.log('🍕 Adding rich dishes, tables, and past orders...');

  await withTransaction(async (client) => {
    // -------------------------------------------------------------
    // 1. Royal Spice Bistro Additions
    // -------------------------------------------------------------
    const r1Res = await client.query('SELECT id FROM restaurants WHERE slug = $1', ['royalspice']);
    if (r1Res.rows.length === 0) {
      console.log('Royal Spice Bistro not found');
      return;
    }
    const r1Id = r1Res.rows[0].id;

    // Get categories for Royal Spice
    const cats1Res = await client.query('SELECT id, name FROM menu_categories WHERE restaurant_id = $1', [r1Id]);
    const cat1Map = Object.fromEntries(cats1Res.rows.map((r) => [r.name, r.id]));

    // Check if new dishes already exist
    const checkDish = await client.query('SELECT id FROM menu_items WHERE restaurant_id = $1 AND name = $2', [r1Id, 'Amritsari Fish Tikka']);
    if (checkDish.rows.length === 0) {
      console.log('Adding more Royal Spice Bistro dishes...');

      const dishes = [
        // Starters
        {
          cat: cat1Map['Starters & Tandoor'],
          name: 'Amritsari Fish Tikka',
          desc: 'River sole fillets infused with crushed carom seeds (ajwain), ginger, garlic, and gram flour, fried until crisp and flaky.',
          price: 38000,
          diet: 'non_veg',
          prep: 15,
          img: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600'
        },
        {
          cat: cat1Map['Starters & Tandoor'],
          name: 'Dahi Ke Kebab',
          desc: 'Golden-fried hung curd cutlets flavored with fresh mint, cracked pepper, and aromatic roasted cumin.',
          price: 24000,
          diet: 'veg',
          prep: 12,
          img: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600'
        },
        {
          cat: cat1Map['Starters & Tandoor'],
          name: 'Murgh Malai Tikka',
          desc: 'Tender chicken morsels steeped in rich cashew nut paste, melted cheese, cardamom, and thick cream.',
          price: 34000,
          diet: 'non_veg',
          prep: 18,
          img: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600'
        },
        // Main Course
        {
          cat: cat1Map['Curries & Main Course'],
          name: 'Rogan Josh Kashmiri',
          desc: 'Tender prime mutton cuts slow-cooked in traditional Kashmiri chili gravy infused with fennel and dry ginger.',
          price: 44000,
          diet: 'non_veg',
          prep: 25,
          img: 'https://images.unsplash.com/photo-1545247181-516773cae754?w=600'
        },
        {
          cat: cat1Map['Curries & Main Course'],
          name: 'Paneer Lababdar',
          desc: 'Hand-crumbled and cubed malai paneer simmered in an indulgent tomato-onion gravy finished with grated mawa.',
          price: 29000,
          diet: 'veg',
          prep: 16,
          img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600'
        },
        {
          cat: cat1Map['Curries & Main Course'],
          name: 'Kadai Chicken Peshawari',
          desc: 'Boneless chicken tossed in an iron wok with crushed coriander seeds, bell peppers, tomatoes, and ginger juliennes.',
          price: 34000,
          diet: 'non_veg',
          prep: 18,
          img: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600'
        },
        // Breads & Rice
        {
          cat: cat1Map['Artisanal Breads & Rice'],
          name: 'Dum Murgh Biryani',
          desc: 'Fragrant aged long-grain basmati rice sealed with clay and dum-cooked with spiced chicken, saffron milk, and caramelized onions.',
          price: 35000,
          diet: 'non_veg',
          prep: 20,
          img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600'
        },
        {
          cat: cat1Map['Artisanal Breads & Rice'],
          name: 'Chur Chur Naan with Chole & Raita',
          desc: 'Crispy flaky tandoori bread crushed with melted butter, served alongside spicy pindi chole and boondi raita.',
          price: 18000,
          diet: 'veg',
          prep: 10,
          img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600'
        },
        // Desserts
        {
          cat: cat1Map['Desserts & Beverages'],
          name: 'Kesar Pista Matka Kulfi',
          desc: 'Dense, creamy reduced milk ice cream steeped in Kashmiri saffron, roasted pistachios, and green cardamom.',
          price: 14000,
          diet: 'veg',
          prep: 3,
          img: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=600'
        },
        {
          cat: cat1Map['Desserts & Beverages'],
          name: 'Mango Masala Shikanji',
          desc: 'Chilled raw mango and mint spritzer spiced with Himalayan rock salt and roasted cumin.',
          price: 11000,
          diet: 'veg',
          prep: 4,
          img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600'
        }
      ];

      for (const d of dishes) {
        if (!d.cat) continue;
        await client.query(
          `INSERT INTO menu_items 
            (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [r1Id, d.cat, d.name, d.desc, d.price, d.img, d.diet, d.prep]
        );
      }

      // Add Tables T-06 to T-10
      for (let i = 6; i <= 10; i++) {
        const tNum = `T-0${i}`;
        const tCheck = await client.query('SELECT id FROM dining_tables WHERE restaurant_id = $1 AND table_number = $2', [r1Id, tNum]);
        if (tCheck.rows.length === 0) {
          const tRes = await client.query(
            `INSERT INTO dining_tables (restaurant_id, table_number, capacity, status)
             VALUES ($1, $2, $3, 'available')
             RETURNING id`,
            [r1Id, tNum, i % 2 === 0 ? 4 : 6]
          );
          const rawToken = crypto.randomBytes(24).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          await client.query(
            `INSERT INTO table_qr_tokens (restaurant_id, table_id, token_hash)
             VALUES ($1, $2, $3)`,
            [r1Id, tRes.rows[0].id, tokenHash]
          );
        }
      }
    }

    // -------------------------------------------------------------
    // 2. Urban Crust Pizzeria Rich Setup
    // -------------------------------------------------------------
    const r2Res = await client.query('SELECT id FROM restaurants WHERE slug = $1', ['urbancrust']);
    if (r2Res.rows.length > 0) {
      const r2Id = r2Res.rows[0].id;

      // Check if categories exist
      const catCheck = await client.query('SELECT id FROM menu_categories WHERE restaurant_id = $1', [r2Id]);
      if (catCheck.rows.length === 0) {
        console.log('Adding Urban Crust Pizzeria categories and artisanal pizzas...');

        const cRes = await client.query(
          `INSERT INTO menu_categories (restaurant_id, name, description, sort_order)
           VALUES 
            ($1, 'Wood-Fired Sourdough Pizzas', '48-hour fermented sourdough crust baked in a 450°C wood oven', 1),
            ($1, 'Handmade Pastas', 'Fresh egg pasta extruded daily with authentic Italian sauces', 2),
            ($1, 'Gelatos & Italian Sodas', 'Handcrafted sweet endings and refreshing coolers', 3)
           RETURNING id, name`,
          [r2Id]
        );
        const catMap2 = Object.fromEntries(cRes.rows.map((r) => [r.name, r.id]));

        const pizzaItems = [
          {
            cat: catMap2['Wood-Fired Sourdough Pizzas'],
            name: 'Margherita Di Bufala',
            desc: 'San Marzano tomato coulis, fresh Campania buffalo mozzarella, sweet basil leaves, and extra virgin olive oil.',
            price: 42000,
            diet: 'veg',
            prep: 12,
            img: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600'
          },
          {
            cat: catMap2['Wood-Fired Sourdough Pizzas'],
            name: 'Truffle Mushroom Meltdown',
            desc: 'Sautéed wild porcini and button mushrooms, white truffle oil, fior di latte mozzarella, and roasted garlic cream.',
            price: 52000,
            diet: 'veg',
            prep: 14,
            img: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600'
          },
          {
            cat: catMap2['Wood-Fired Sourdough Pizzas'],
            name: 'Spicy Pepperoni & Hot Honey',
            desc: 'Crispy artisanal beef pepperoni slices, hot Calabrian chili paste, aged parmesan, and organic hot honey drizzle.',
            price: 58000,
            diet: 'non_veg',
            prep: 12,
            img: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600'
          },
          {
            cat: catMap2['Wood-Fired Sourdough Pizzas'],
            name: 'Burrata & Pesto Speciale',
            desc: 'Whole fresh burrata ball centered on a pesto base with blistered datterini cherry tomatoes and toasted pine nuts.',
            price: 54000,
            diet: 'veg',
            prep: 14,
            img: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600'
          },
          {
            cat: catMap2['Handmade Pastas'],
            name: 'Fettuccine Alfredo con Pollo',
            desc: 'Ribbon pasta tossed in rich 24-month aged Parmigiano Reggiano butter sauce with grilled chicken breast.',
            price: 46000,
            diet: 'non_veg',
            prep: 15,
            img: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600'
          },
          {
            cat: catMap2['Handmade Pastas'],
            name: 'Spaghetti Aglio Olio e Peperoncino',
            desc: 'Classic bronze-cut spaghetti tossed with golden garlic slivers, cold-pressed olive oil, and dried red pepper.',
            price: 38000,
            diet: 'veg',
            prep: 10,
            img: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600'
          },
          {
            cat: catMap2['Gelatos & Italian Sodas'],
            name: 'Classic Venetian Tiramisu',
            desc: 'Espresso soaked Savoiardi ladyfinger biscuits layered with fresh whipped mascarpone and dark cocoa dusting.',
            price: 28000,
            diet: 'veg',
            prep: 4,
            img: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600'
          },
          {
            cat: catMap2['Gelatos & Italian Sodas'],
            name: 'Sparkling Berry Basil Lemonade',
            desc: 'Muddled wild raspberries, fresh Italian sweet basil, and fizzy Sicilian lemon soda over crushed ice.',
            price: 16000,
            diet: 'veg',
            prep: 3,
            img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600'
          }
        ];

        for (const p of pizzaItems) {
          if (!p.cat) continue;
          await client.query(
            `INSERT INTO menu_items 
              (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
            [r2Id, p.cat, p.name, p.desc, p.price, p.img, p.diet, p.prep]
          );
        }

        // Tables for Urban Crust (Table 1 through 6)
        for (let i = 1; i <= 6; i++) {
          const tNum = `T-${i < 10 ? '0' : ''}${i}`;
          const tRes = await client.query(
            `INSERT INTO dining_tables (restaurant_id, table_number, capacity, status)
             VALUES ($1, $2, $3, 'available')
             RETURNING id`,
            [r2Id, tNum, i % 2 === 0 ? 4 : 2]
          );
          const rawToken = i === 1 ? 'demo_token_table_1_urbancrust' : crypto.randomBytes(24).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          await client.query(
            `INSERT INTO table_qr_tokens (restaurant_id, table_id, token_hash)
             VALUES ($1, $2, $3)`,
            [r2Id, tRes.rows[0].id, tokenHash]
          );
        }

        // Waiter & Kitchen staff for Urban Crust
        const staffPass = await (await import('bcryptjs')).default.hash('Waiter@123', 10);
        await client.query(
          `INSERT INTO staff_users (restaurant_id, email, password_hash, full_name, role, is_active)
           VALUES 
            ($1, 'waiter@urbancrust.com', $2, 'Luca Moretti (Floor Captain)', 'waiter', true),
            ($1, 'kitchen@urbancrust.com', $2, 'Pizzaiolo Giovanni', 'kitchen', true)`,
          [r2Id, staffPass]
        );
      }
    }

    console.log('✅ Rich dummy dishes and tables added successfully!');
  });
}

// Auto-run
addMoreDummyData()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Failed to add dummy data:', err);
    pool.end();
    process.exit(1);
  });
