# Smart Restaurant Operations & QR Ordering SaaS Platform

A multi-tenant restaurant operations platform and QR ordering system built with **Node.js, Express, TypeScript, Vite, React 18, Tailwind CSS, and Supabase PostgreSQL / Realtime**.

---

## 🌟 Key Architecture & Capabilities

1. **Strict Multi-Tenancy & Dynamic Identity**
   - Each restaurant operates as an isolated tenant with its own branding (name, logo, favicon, brand colors, currency, timezone, settings).
   - Dynamically loaded from PostgreSQL `restaurants` table based on domain/subdomain or tenant context.
   - Zero hardcoded branding.

2. **Platform DevAdmin Portal (`/d/devadmin`)**
   - Protected superadmin portal configured via server-side environment variables: `DEVADMIN_EMAIL` and `DEVADMIN_PASSWORD`.
   - Complete server-side verification before loading the DevAdmin codebase.
   - **Tenant Provisioning:** DevAdmin creates new restaurants, sets their slug/domain, and sets the initial manager credentials.
   - **Pause / Suspend Service:** DevAdmin can pause service for any specific restaurant, instantly rendering a professional suspended notice (`503 / 403`) on that restaurant's domain while other restaurants remain 100% active.
   - **Delete Restaurant:** Soft-deletes or archives restaurant tenants.

3. **Customer QR Dine-In & Takeaway Ordering (`/u/customer/...`)**
   - Scans opaque, revocable QR tokens (`/u/customer/table?t=<opaque-token>`).
   - Categorized menu with search, pure-veg and non-veg filters, food photography, descriptions, preparation times, variants, and modifiers.
   - Mandatory E.164 mobile number (+91 default) with inline validation.
   - Unguessable cryptographically random access tokens for live order tracking (`Placed` ➔ `Accepted` ➔ `Preparing` ➔ `Ready` ➔ `Served`).
   - Live session running bill with "Call Waiter" and "Request Bill" actions.
   - Verified digital tax receipt (`/u/customer/receipt/:receiptToken`).

4. **Kitchen Display System (KDS) (`/s/kitchen/dashboard`)**
   - Tablet-optimized high-contrast layout.
   - Live order ticket queue with elapsed preparation timer, items, portion variants, modifiers, and notes.
   - Audio chime alert for incoming tickets.
   - Ticket status workflow: `new` ➔ `preparing` ➔ `ready`.

5. **Waiter Floor Control (`/s/waiter/...`)**
   - Visual floor map with active table statuses: Available (green), Occupied (amber), Bill Requested (blue).
   - Manual POS order placement (uses the **exact same domain service** as customer QR checkout).
   - Service request dispatcher for guest calls (water, cutlery, assistance).
   - Table bill generation and payment settlement (Cash, UPI QR, Card).

6. **Manager Console (`/s/manager/...`)**
   - **Menu & Recipe Builder:** Create categories and dishes with descriptions, image URLs, dietary tags, preparation times in minutes, portion variants, and modifier groups.
   - **Instant Availability Toggle:** One-click Sold Out / Available toggle.
   - **Dining Tables & QR Generator:** Table capacity management and high-resolution printable QR codes.
   - **Accounting & Verified Sales Reports:** Sales derived strictly from verified paid bills.
   - **Staff Management:** Create Waiter/Kitchen accounts and toggle active status.
   - **Customer Loyalty Ledger:** 1 loyalty point earned per ₹1 eligible net item spend (redemption disabled).

---

## 🚀 Quick Start Guide

### 1. Environment Configuration
Your `.env` is pre-configured with your Supabase credentials:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Supabase Credentials
SUPABASE_URL=https://vmpecglmfvhtqacqomeb.supabase.co
SUPABASE_ANON_KEY=sb_publishable_NvgctQGXhWZI-dSUPCRNzw_C4_Il5Zu
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
DATABASE_URL=postgresql://postgres:...@db.vmpecglmfvhtqacqomeb.supabase.co:5432/postgres

# Platform Superadmin (DevAdmin)
DEVADMIN_EMAIL=admin@smartresto.com
DEVADMIN_PASSWORD=DevAdmin@Pass2026

SESSION_SECRET=...
QR_TOKEN_SECRET=...
DEFAULT_COUNTRY_CODE=+91
```

### 2. Run the Development Servers
In the project root, start both the backend API (port 5000) and frontend Vite server (port 5173):
```bash
npm run dev
```

Or start them individually:
```bash
npm run dev:api       # Starts Express API at http://localhost:5000
npm run dev:website   # Starts Vite React App at http://localhost:5173
```

### 3. Run Automated Integration Tests
Execute the full 9-step end-to-end integration test suite:
```bash
npm test
```

---

## 🔑 Demo Access & Default Accounts

### 1. Platform DevAdmin
- URL: `http://localhost:5173/d/devadmin`
- Email: `admin@smartresto.com`
- Password: `DevAdmin@Pass2026`

### 2. Demo Restaurant 1: Royal Spice Bistro
- Customer QR Link: `http://localhost:5173/u/customer/table?t=demo_token_table_1_royalspice`
- Staff Login: `http://localhost:5173/s/login?resto=royalspice`
  - Manager: `manager@royalspice.com` / `Manager@123`
  - Floor Waiter: `waiter@royalspice.com` / `Waiter@123`
  - Kitchen Chef: `kitchen@royalspice.com` / `Kitchen@123`

### 3. Demo Restaurant 2: Urban Crust Pizzeria (Multi-Tenant Isolation)
- Staff Login: `http://localhost:5173/s/login?resto=urbancrust`
  - Manager: `manager@urbancrust.com` / `Manager@123`
