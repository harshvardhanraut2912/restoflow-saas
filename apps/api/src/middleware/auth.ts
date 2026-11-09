import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { StaffAuthPayload, DevAdminPayload } from '../types/index.js';

export function requireDevAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'DevAdmin authentication token required.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.SESSION_SECRET) as any;
    if (payload.role !== 'devadmin') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'DevAdmin privileges required.' });
      return;
    }
    req.devadmin = payload as DevAdminPayload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'INVALID_TOKEN', message: 'Expired or invalid DevAdmin session.' });
  }
}

export function requireStaff(allowedRoles?: ('manager' | 'waiter' | 'kitchen')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Staff authentication token required.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, env.SESSION_SECRET) as any;
      if (!payload.restaurantId || !payload.role) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: 'Malformed staff token.' });
        return;
      }

      // Ensure staff belongs to the active restaurant tenant
      if (req.restaurant && payload.restaurantId !== req.restaurant.id) {
        res.status(403).json({
          error: 'TENANT_MISMATCH',
          message: 'Your staff credentials do not grant access to this restaurant.'
        });
        return;
      }

      // Check role permissions
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
        res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`
        });
        return;
      }

      req.staff = payload as StaffAuthPayload;
      next();
    } catch (err) {
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Expired or invalid staff session.' });
    }
  };
}
