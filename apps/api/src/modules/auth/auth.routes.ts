import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { query } from '../../db/index.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { StaffUser } from '../../types/index.js';

export const authRouter = Router();

// Staff Login (Scoped to Current Restaurant Tenant)
authRouter.post('/login', resolveTenant, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const restaurant = req.restaurant!;

  if (!email || !password) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and password are required.' });
    return;
  }

  try {
    const result = await query<StaffUser & { password_hash: string }>(
      'SELECT * FROM staff_users WHERE restaurant_id = $1 AND email = $2',
      [restaurant.id, email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    const staff = result.rows[0];

    if (!staff.is_active) {
      res.status(403).json({ error: 'ACCOUNT_DISABLED', message: 'Your staff account has been deactivated.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, staff.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    // Generate JWT token scoped to restaurant
    const token = jwt.sign(
      {
        userId: staff.id,
        restaurantId: restaurant.id,
        role: staff.role,
        email: staff.email,
        fullName: staff.full_name
      },
      env.SESSION_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: staff.id,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        email: staff.email,
        fullName: staff.full_name,
        role: staff.role
      }
    });
  } catch (err: any) {
    console.error('Staff login error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Authentication failed.' });
  }
});

// Staff Profile
authRouter.get('/me', resolveTenant, requireStaff(), async (req: Request, res: Response) => {
  try {
    const result = await query<StaffUser>(
      'SELECT id, restaurant_id, email, full_name, role, is_active FROM staff_users WHERE id = $1',
      [req.staff!.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not found or inactive.' });
      return;
    }

    res.json({
      user: {
        id: result.rows[0].id,
        restaurantId: result.rows[0].restaurant_id,
        restaurantName: req.restaurant?.name || '',
        email: result.rows[0].email,
        fullName: result.rows[0].full_name,
        role: result.rows[0].role
      }
    });
  } catch (err: any) {
    console.error('Staff me error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch user session.' });
  }
});
