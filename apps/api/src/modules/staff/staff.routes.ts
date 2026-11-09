import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query } from '../../db/index.js';

export const staffRouter = Router();

// Manager Lists Restaurant Staff
staffRouter.get('/', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `SELECT id, email, full_name, role, is_active, created_at 
       FROM staff_users 
       WHERE restaurant_id = $1 
       ORDER BY created_at DESC`,
      [restaurant.id]
    );

    res.json({ staff: result.rows });
  } catch (err: any) {
    console.error('Fetch staff error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch staff members.' });
  }
});

// Manager Creates Staff Member (Waiter, Kitchen, Manager)
const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(2),
  role: z.enum(['manager', 'waiter', 'kitchen'])
});

staffRouter.post('/', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = createStaffSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const { email, password, full_name, role } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO staff_users (restaurant_id, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [restaurant.id, email.toLowerCase().trim(), passwordHash, full_name, role]
    );

    res.status(201).json({ member: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'A staff member with this email already exists.' });
      return;
    }
    console.error('Create staff error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create staff member.' });
  }
});

// Manager Toggles Staff Member Active Status
staffRouter.patch('/:id/status', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `UPDATE staff_users 
       SET is_active = $1, updated_at = now() 
       WHERE id = $2 AND restaurant_id = $3
       RETURNING id, email, full_name, role, is_active`,
      [Boolean(is_active), id, restaurant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Staff member not found.' });
      return;
    }

    res.json({ member: result.rows[0] });
  } catch (err: any) {
    console.error('Update staff status error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update staff status.' });
  }
});
