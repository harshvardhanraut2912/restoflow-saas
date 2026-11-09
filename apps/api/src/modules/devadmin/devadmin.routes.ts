import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/index.js';
import { requireDevAdmin } from '../../middleware/auth.js';

export const devadminRouter = Router();

// 1. DevAdmin Login (checks email & password against server-side env)
devadminRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and password are required.' });
    return;
  }

  // Exact server-side check with timing-safe comparison or env comparison
  if (email.trim().toLowerCase() !== env.DEVADMIN_EMAIL.toLowerCase() || password !== env.DEVADMIN_PASSWORD) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid DevAdmin email or password.' });
    return;
  }

  // Issue DevAdmin JWT
  const token = jwt.sign(
    { role: 'devadmin', email: env.DEVADMIN_EMAIL },
    env.SESSION_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      email: env.DEVADMIN_EMAIL,
      role: 'devadmin'
    }
  });
});

// 2. DevAdmin Me (verify active session)
devadminRouter.get('/auth/me', requireDevAdmin, (req: Request, res: Response) => {
  res.json({
    user: {
      email: req.devadmin?.email,
      role: 'devadmin'
    }
  });
});

// 3. List All Restaurants with Operational Metrics
devadminRouter.get('/restaurants', requireDevAdmin, async (req: Request, res: Response) => {
  try {
    const sql = `
      SELECT 
        r.*,
        rs.tax_rate_percent,
        rs.dine_in_enabled,
        rs.takeaway_enabled,
        (SELECT COUNT(*) FROM staff_users WHERE restaurant_id = r.id) as staff_count,
        (SELECT COUNT(*) FROM dining_tables WHERE restaurant_id = r.id) as tables_count,
        (SELECT COUNT(*) FROM orders WHERE restaurant_id = r.id) as orders_count,
        (SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE restaurant_id = r.id AND status = 'paid') as total_revenue_paise
      FROM restaurants r
      LEFT JOIN restaurant_settings rs ON rs.restaurant_id = r.id
      ORDER BY r.created_at DESC;
    `;
    const result = await query(sql);
    res.json({ restaurants: result.rows });
  } catch (err: any) {
    console.error('DevAdmin fetch restaurants error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve restaurants.' });
  }
});

// 4. Create New Restaurant Tenant + Initial Manager Account
const createRestaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  primary_domain: z.string().min(2),
  logo_url: z.string().url().optional().or(z.literal('')),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e11d48'),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1e293b'),
  manager_email: z.string().email(),
  manager_password: z.string().min(6),
  manager_name: z.string().min(2).default('Restaurant Manager')
});

devadminRouter.post('/restaurants', requireDevAdmin, async (req: Request, res: Response) => {
  try {
    const parse = createRestaurantSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parse.error.format() });
      return;
    }

    const {
      name,
      slug,
      primary_domain,
      logo_url,
      primary_color,
      secondary_color,
      manager_email,
      manager_password,
      manager_name
    } = parse.data;

    // Check slug and primary_domain uniqueness
    const exists = await query(
      'SELECT id FROM restaurants WHERE slug = $1 OR primary_domain = $2',
      [slug.toLowerCase(), primary_domain.toLowerCase()]
    );

    if (exists.rows.length > 0) {
      res.status(409).json({
        error: 'DUPLICATE_IDENTIFIER',
        message: 'A restaurant with this slug or domain already exists.'
      });
      return;
    }

    const passwordHash = await bcrypt.hash(manager_password, 10);

    const created = await withTransaction(async (client) => {
      // 1. Insert Restaurant
      const restoRes = await client.query(
        `INSERT INTO restaurants 
          (name, slug, primary_domain, logo_url, primary_color, secondary_color, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [name, slug.toLowerCase(), primary_domain.toLowerCase(), logo_url || null, primary_color, secondary_color]
      );
      const resto = restoRes.rows[0];

      // 2. Insert Default Restaurant Settings
      await client.query(
        `INSERT INTO restaurant_settings 
          (restaurant_id, tax_rate_percent, service_charge_percent, packaging_charge_paise, dine_in_enabled, takeaway_enabled)
         VALUES ($1, 5.00, 0.00, 0, true, true)`,
        [resto.id]
      );

      // 3. Insert Initial Manager Staff User
      const managerRes = await client.query(
        `INSERT INTO staff_users 
          (restaurant_id, email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, 'manager', true)
         RETURNING id, email, full_name, role`,
        [resto.id, manager_email.toLowerCase(), passwordHash, manager_name]
      );

      // 4. Log Audit Action
      await client.query(
        `INSERT INTO audit_logs (restaurant_id, actor_type, actor_id, action, details)
         VALUES ($1, 'devadmin', $2, 'CREATE_RESTAURANT', $3)`,
        [resto.id, req.devadmin?.email, JSON.stringify({ name, slug, manager_email })]
      );

      return {
        restaurant: resto,
        manager: managerRes.rows[0]
      };
    });

    res.status(201).json(created);
  } catch (err: any) {
    console.error('DevAdmin create restaurant error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create restaurant.' });
  }
});

// 5. Update Restaurant Status (Pause / Suspend / Reactivate)
devadminRouter.patch('/restaurants/:id/status', requireDevAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['active', 'suspended', 'deleted'].includes(status)) {
    res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be active, suspended, or deleted.' });
    return;
  }

  try {
    const result = await query(
      'UPDATE restaurants SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Restaurant not found.' });
      return;
    }

    await query(
      `INSERT INTO audit_logs (restaurant_id, actor_type, actor_id, action, details)
       VALUES ($1, 'devadmin', $2, 'UPDATE_STATUS', $3)`,
      [id, req.devadmin?.email, JSON.stringify({ new_status: status })]
    );

    res.json({
      restaurant: result.rows[0],
      message: status === 'suspended' 
        ? 'Restaurant service paused. Its customer and staff access is now suspended.'
        : 'Restaurant status updated.'
    });
  } catch (err: any) {
    console.error('DevAdmin update status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update restaurant status.' });
  }
});

// 6. Delete Restaurant
devadminRouter.delete('/restaurants/:id', requireDevAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(
      'UPDATE restaurants SET status = \'deleted\', updated_at = now() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Restaurant not found.' });
      return;
    }

    res.json({ message: 'Restaurant marked as deleted.', restaurant: result.rows[0] });
  } catch (err: any) {
    console.error('DevAdmin delete error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete restaurant.' });
  }
});

// 7. DevAdmin System Overview / Audit Logs
devadminRouter.get('/overview', requireDevAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM restaurants WHERE status != 'deleted') as total_restaurants,
        (SELECT COUNT(*) FROM restaurants WHERE status = 'active') as active_restaurants,
        (SELECT COUNT(*) FROM restaurants WHERE status = 'suspended') as suspended_restaurants,
        (SELECT COUNT(*) FROM orders) as total_platform_orders,
        (SELECT COALESCE(SUM(grand_total_paise), 0) FROM bills WHERE status = 'paid') as platform_volume_paise
    `);

    const recentLogs = await query(`
      SELECT al.*, r.name as restaurant_name 
      FROM audit_logs al
      LEFT JOIN restaurants r ON r.id = al.restaurant_id
      ORDER BY al.created_at DESC LIMIT 25
    `);

    res.json({
      stats: stats.rows[0],
      recentLogs: recentLogs.rows
    });
  } catch (err: any) {
    console.error('DevAdmin overview error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load system overview.' });
  }
});
