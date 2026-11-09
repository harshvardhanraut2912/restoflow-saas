import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { resolveTenant } from '../../middleware/tenant.js';
import { requireStaff } from '../../middleware/auth.js';
import { query, withTransaction } from '../../db/index.js';

export const menuRouter = Router();

// ==========================================
// PUBLIC MENU (For Customer QR & Waiter POS)
// ==========================================
menuRouter.get('/public', resolveTenant, async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;

  try {
    // 1. Get Categories
    const categoriesRes = await query(
      `SELECT * FROM menu_categories 
       WHERE restaurant_id = $1 AND is_active = true 
       ORDER BY sort_order ASC, name ASC`,
      [restaurant.id]
    );

    // 2. Get Items
    const itemsRes = await query(
      `SELECT * FROM menu_items 
       WHERE restaurant_id = $1 
       ORDER BY sort_order ASC, name ASC`,
      [restaurant.id]
    );

    // 3. Get Variants
    const variantsRes = await query(
      `SELECT * FROM menu_variants 
       WHERE restaurant_id = $1 AND is_available = true 
       ORDER BY price_paise ASC`,
      [restaurant.id]
    );

    // 4. Get Modifier Groups & Modifiers
    const modGroupsRes = await query(
      `SELECT mg.*, mimg.menu_item_id 
       FROM modifier_groups mg
       JOIN menu_item_modifier_groups mimg ON mimg.modifier_group_id = mg.id
       WHERE mg.restaurant_id = $1`,
      [restaurant.id]
    );

    const modifiersRes = await query(
      `SELECT * FROM modifiers 
       WHERE restaurant_id = $1 AND is_available = true 
       ORDER BY price_paise ASC`,
      [restaurant.id]
    );

    // Assemble hierarchical menu structure
    const itemsByCategoryId: Record<string, any[]> = {};
    const variantsByItemId: Record<string, any[]> = {};
    const modGroupsByItemId: Record<string, any[]> = {};
    const modifiersByGroupId: Record<string, any[]> = {};

    for (const m of modifiersRes.rows) {
      if (!modifiersByGroupId[m.modifier_group_id]) modifiersByGroupId[m.modifier_group_id] = [];
      modifiersByGroupId[m.modifier_group_id].push(m);
    }

    for (const mg of modGroupsRes.rows) {
      if (!modGroupsByItemId[mg.menu_item_id]) modGroupsByItemId[mg.menu_item_id] = [];
      modGroupsByItemId[mg.menu_item_id].push({
        ...mg,
        modifiers: modifiersByGroupId[mg.id] || []
      });
    }

    for (const v of variantsRes.rows) {
      if (!variantsByItemId[v.menu_item_id]) variantsByItemId[v.menu_item_id] = [];
      variantsByItemId[v.menu_item_id].push(v);
    }

    for (const item of itemsRes.rows) {
      if (!itemsByCategoryId[item.category_id]) itemsByCategoryId[item.category_id] = [];
      itemsByCategoryId[item.category_id].push({
        ...item,
        variants: variantsByItemId[item.id] || [],
        modifier_groups: modGroupsByItemId[item.id] || []
      });
    }

    const fullMenu = categoriesRes.rows.map((cat) => ({
      ...cat,
      items: itemsByCategoryId[cat.id] || []
    }));

    res.json({ categories: fullMenu });
  } catch (err: any) {
    console.error('Fetch public menu error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load menu.' });
  }
});

// ==========================================
// MANAGER MENU ENDPOINTS (Protected)
// ==========================================

// 1. Categories
menuRouter.post('/categories', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { name, description, sort_order } = req.body;
  const restaurant = req.restaurant!;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Category name is required.' });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO menu_categories (restaurant_id, name, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [restaurant.id, name.trim(), description || null, sort_order || 0]
    );

    res.status(201).json({ category: result.rows[0] });
  } catch (err: any) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create category.' });
  }
});

menuRouter.delete('/categories/:id', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurant = req.restaurant!;

  try {
    await query('DELETE FROM menu_categories WHERE id = $1 AND restaurant_id = $2', [id, restaurant.id]);
    res.json({ message: 'Category deleted successfully.' });
  } catch (err: any) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete category.' });
  }
});

// 2. Menu Item Creation with Full Details
const createItemSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  base_price_paise: z.number().int().min(0),
  image_url: z.string().optional().nullable(),
  dietary_type: z.enum(['veg', 'non_veg', 'egg', 'vegan']).default('veg'),
  preparation_time_minutes: z.number().int().min(1).default(15),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  variants: z.array(z.object({
    name: z.string().min(1),
    price_paise: z.number().int().min(0)
  })).optional().default([]),
  modifier_groups: z.array(z.object({
    name: z.string().min(1),
    min_selection: z.number().int().default(0),
    max_selection: z.number().int().default(1),
    is_required: z.boolean().default(false),
    modifiers: z.array(z.object({
      name: z.string().min(1),
      price_paise: z.number().int().default(0)
    }))
  })).optional().default([])
});

menuRouter.post('/items', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const restaurant = req.restaurant!;
  const parsed = createItemSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    return;
  }

  const {
    category_id,
    name,
    description,
    base_price_paise,
    image_url,
    dietary_type,
    preparation_time_minutes,
    is_available,
    sort_order,
    variants,
    modifier_groups
  } = parsed.data;

  try {
    const item = await withTransaction(async (client) => {
      // 1. Insert item
      const itemRes = await client.query(
        `INSERT INTO menu_items 
          (restaurant_id, category_id, name, description, base_price_paise, image_url, dietary_type, preparation_time_minutes, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          restaurant.id,
          category_id,
          name,
          description || null,
          base_price_paise,
          image_url || null,
          dietary_type,
          preparation_time_minutes,
          is_available,
          sort_order
        ]
      );
      const newItem = itemRes.rows[0];

      // 2. Insert variants
      const savedVariants: any[] = [];
      for (const v of variants) {
        const vRes = await client.query(
          `INSERT INTO menu_variants (restaurant_id, menu_item_id, name, price_paise)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [restaurant.id, newItem.id, v.name, v.price_paise]
        );
        savedVariants.push(vRes.rows[0]);
      }

      // 3. Insert modifier groups & modifiers
      const savedGroups: any[] = [];
      for (const mg of modifier_groups) {
        const mgRes = await client.query(
          `INSERT INTO modifier_groups (restaurant_id, name, min_selection, max_selection, is_required)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [restaurant.id, mg.name, mg.min_selection, mg.max_selection, mg.is_required]
        );
        const newGroup = mgRes.rows[0];

        // Link group to item
        await client.query(
          `INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id)
           VALUES ($1, $2)`,
          [newItem.id, newGroup.id]
        );

        const savedModifiers: any[] = [];
        for (const m of mg.modifiers) {
          const mRes = await client.query(
            `INSERT INTO modifiers (restaurant_id, modifier_group_id, name, price_paise)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [restaurant.id, newGroup.id, m.name, m.price_paise]
          );
          savedModifiers.push(mRes.rows[0]);
        }

        savedGroups.push({
          ...newGroup,
          modifiers: savedModifiers
        });
      }

      return {
        ...newItem,
        variants: savedVariants,
        modifier_groups: savedGroups
      };
    });

    res.status(201).json({ item });
  } catch (err: any) {
    console.error('Create menu item error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create menu item.' });
  }
});

// 3. Toggle Availability (Sold Out / Available)
menuRouter.patch('/items/:id/availability', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_available } = req.body;
  const restaurant = req.restaurant!;

  try {
    const result = await query(
      `UPDATE menu_items 
       SET is_available = $1, updated_at = now()
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [Boolean(is_available), id, restaurant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Menu item not found.' });
      return;
    }

    res.json({ item: result.rows[0] });
  } catch (err: any) {
    console.error('Toggle availability error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update availability.' });
  }
});

// 4. Delete Menu Item
menuRouter.delete('/items/:id', resolveTenant, requireStaff(['manager']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const restaurant = req.restaurant!;

  try {
    await query('DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2', [id, restaurant.id]);
    res.json({ message: 'Menu item deleted successfully.' });
  } catch (err: any) {
    console.error('Delete item error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete menu item.' });
  }
});
