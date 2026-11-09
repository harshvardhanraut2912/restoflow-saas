import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { devadminRouter } from './modules/devadmin/devadmin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { restaurantRouter } from './modules/restaurant/restaurant.routes.js';
import { menuRouter } from './modules/menu/menu.routes.js';
import { tablesRouter } from './modules/tables/tables.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { kitchenRouter } from './modules/kitchen/kitchen.routes.js';
import { serviceRequestsRouter } from './modules/service_requests/service_requests.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { loyaltyRouter } from './modules/loyalty/loyalty.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow frontend & subdomains
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global Request Logger in Development
if (env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // console.log(`[${req.method}] ${req.url} (Host: ${req.headers.host})`);
    next();
  });
}

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV
  });
});

// DevAdmin Module (Isolated Platform Management API)
app.use('/api/v1/devadmin', devadminRouter);

// Staff Auth
app.use('/api/v1/auth', authRouter);

// Public Restaurant & QR Resolution
app.use('/api/v1/public', restaurantRouter);

// Menu (Public & Manager)
app.use('/api/v1/menu', menuRouter);

// Tables & QR Generator
app.use('/api/v1/tables', tablesRouter);

// Unified Orders (Customer QR + Waiter POS)
app.use('/api/v1/orders', ordersRouter);

// Kitchen Display System
app.use('/api/v1/kitchen', kitchenRouter);

// Customer Service Requests
app.use('/api/v1/service-requests', serviceRequestsRouter);

// Billing & Payments
app.use('/api/v1/billing', billingRouter);

// Loyalty Ledger & Sales Analytics
app.use('/api/v1/loyalty', loyaltyRouter);

// Staff Management
app.use('/api/v1/manager/staff', staffRouter);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'API route not found.' });
});

// Centralized Error Handling
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.'
  });
});

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Smart Restaurant SaaS API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

export default app;
