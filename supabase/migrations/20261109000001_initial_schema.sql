-- Migration: 20261109000001_initial_schema.sql
-- Description: Core Schema for Smart Restaurant Operations & QR Ordering SaaS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Restaurants (Tenants)
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    primary_domain TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT DEFAULT '#e11d48',
    secondary_color TEXT DEFAULT '#1e293b',
    currency VARCHAR(3) DEFAULT 'INR',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Restaurant Settings
CREATE TABLE IF NOT EXISTS restaurant_settings (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    tax_rate_percent NUMERIC(5,2) DEFAULT 5.00,
    service_charge_percent NUMERIC(5,2) DEFAULT 0.00,
    packaging_charge_paise INTEGER DEFAULT 0,
    dine_in_enabled BOOLEAN DEFAULT true,
    takeaway_enabled BOOLEAN DEFAULT true,
    auto_accept_orders BOOLEAN DEFAULT false,
    loyalty_enabled BOOLEAN DEFAULT true,
    loyalty_earn_ratio NUMERIC(5,2) DEFAULT 1.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Staff Users (Scoped to Restaurant)
CREATE TABLE IF NOT EXISTS staff_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'waiter', 'kitchen')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(restaurant_id, email)
);

-- 4. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Menu Items (with description, image_url, preparation_time_minutes, dietary_type)
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    base_price_paise INTEGER NOT NULL CHECK (base_price_paise >= 0),
    image_url TEXT,
    dietary_type TEXT NOT NULL DEFAULT 'veg' CHECK (dietary_type IN ('veg', 'non_veg', 'egg', 'vegan')),
    preparation_time_minutes INTEGER DEFAULT 15,
    is_available BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Menu Item Variants
CREATE TABLE IF NOT EXISTS menu_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Modifier Groups
CREATE TABLE IF NOT EXISTS modifier_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Modifiers
CREATE TABLE IF NOT EXISTS modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_paise INTEGER DEFAULT 0 CHECK (price_paise >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Menu Item Modifier Groups Mapping
CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- 10. Dining Tables
CREATE TABLE IF NOT EXISTS dining_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    capacity INTEGER DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'out_of_service')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(restaurant_id, table_number)
);

-- 11. Table QR Tokens
CREATE TABLE IF NOT EXISTS table_qr_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    is_revoked BOOLEAN DEFAULT false,
    generated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Table Sessions
CREATE TABLE IF NOT EXISTS table_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'bill_requested', 'bill_generated', 'settled', 'closed')),
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_table_session ON table_sessions(restaurant_id, table_id) WHERE status != 'closed';

-- 13. Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    reservation_time TIMESTAMPTZ NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_e164 TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(restaurant_id, phone_e164)
);

-- 15. Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('dine_in', 'takeaway')),
    table_session_id UUID REFERENCES table_sessions(id) ON DELETE SET NULL,
    table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_phone_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'rejected')),
    access_token_hash TEXT NOT NULL UNIQUE,
    subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
    notes TEXT,
    created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 16. Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES menu_variants(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    variant_name_snapshot TEXT,
    unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price_paise INTEGER NOT NULL CHECK (total_price_paise >= 0)
);

-- 17. Order Item Modifiers
CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id UUID REFERENCES modifiers(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0)
);

-- 18. Kitchen Tickets
CREATE TABLE IF NOT EXISTS kitchen_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'preparing', 'ready')),
    acknowledged_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 19. Service Requests
CREATE TABLE IF NOT EXISTS service_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    request_type TEXT NOT NULL CHECK (request_type IN ('water', 'cutlery', 'waiter', 'bill', 'cleaning', 'other')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
    resolved_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 20. Bills
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL,
    table_session_id UUID REFERENCES table_sessions(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
    discount_paise INTEGER DEFAULT 0 CHECK (discount_paise >= 0),
    tax_paise INTEGER DEFAULT 0 CHECK (tax_paise >= 0),
    service_charge_paise INTEGER DEFAULT 0 CHECK (service_charge_paise >= 0),
    packaging_charge_paise INTEGER DEFAULT 0 CHECK (packaging_charge_paise >= 0),
    round_off_paise INTEGER DEFAULT 0,
    grand_total_paise INTEGER NOT NULL CHECK (grand_total_paise >= 0),
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'voided')),
    receipt_token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    settled_at TIMESTAMPTZ
);

-- 21. Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    method TEXT NOT NULL CHECK (method IN ('cash', 'upi_qr', 'upi_manual', 'card', 'online_gateway')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    recorded_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    transaction_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 22. Loyalty Ledger
CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    points_delta INTEGER NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('earn', 'refund_reversal', 'adjustment')),
    source_bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
    eligible_spend_paise INTEGER DEFAULT 0,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 23. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('devadmin', 'staff', 'system', 'customer')),
    actor_id TEXT,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for high-performance multi-tenant querying
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_primary_domain ON restaurants(primary_domain);
CREATE INDEX IF NOT EXISTS idx_staff_users_resto_role ON staff_users(restaurant_id, role);
CREATE INDEX IF NOT EXISTS idx_menu_categories_resto ON menu_categories(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_resto_cat ON menu_items(restaurant_id, category_id, is_available);
CREATE INDEX IF NOT EXISTS idx_dining_tables_resto ON dining_tables(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_hash ON table_qr_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_table_sessions_resto ON table_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_resto_status ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_resto_status ON kitchen_tickets(restaurant_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_service_requests_resto ON service_requests(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_bills_resto_status ON bills(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_resto ON payments(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_ledger(restaurant_id, customer_id, created_at DESC);
