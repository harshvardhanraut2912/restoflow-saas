const API_BASE = '/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getActiveSubdomainSlug(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Direct subdomain extraction e.g. "royalspice.localhost" -> "royalspice"
  const hostname = window.location.hostname.toLowerCase();
  const parts = hostname.split('.');
  if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
    return parts[0];
  }

  // 2. Query parameter fallback e.g. ?resto=urbancrust
  const urlParams = new URLSearchParams(window.location.search);
  const paramResto = urlParams.get('resto');
  if (paramResto) {
    return paramResto.toLowerCase();
  }

  // 3. Fallback to localStorage
  return localStorage.getItem('active_tenant_slug');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  tenantOverride?: { id?: string; slug?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  // Staff token
  const staffToken = localStorage.getItem('staff_token');
  if (staffToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${staffToken}`;
  }

  // DevAdmin token
  const devadminToken = localStorage.getItem('devadmin_token');
  if (endpoint.startsWith('/devadmin') && devadminToken) {
    headers['Authorization'] = `Bearer ${devadminToken}`;
  }

  // Tenant scoping headers
  const resolvedSlug = tenantOverride?.slug || getActiveSubdomainSlug();
  const resolvedId = tenantOverride?.id;

  if (resolvedSlug) {
    headers['x-restaurant-slug'] = resolvedSlug;
  }
  if (resolvedId) {
    headers['x-restaurant-id'] = resolvedId;
  }
  headers['x-forwarded-host'] = window.location.host;

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message || data.error || 'Request failed', data.error || 'API_ERROR', res.status);
  }

  return data as T;
}

// DevAdmin APIs (Independent platform owner calls)
export const devadminApi = {
  login: (email: string, password: string) =>
    apiRequest('/devadmin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: () =>
    apiRequest('/devadmin/auth/me'),
  getOverview: () =>
    apiRequest('/devadmin/overview'),
  getRestaurants: () =>
    apiRequest('/devadmin/restaurants'),
  createRestaurant: (data: any) =>
    apiRequest('/devadmin/restaurants', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: 'active' | 'suspended' | 'deleted') =>
    apiRequest(`/devadmin/restaurants/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteRestaurant: (id: string) =>
    apiRequest(`/devadmin/restaurants/${id}`, { method: 'DELETE' }),
};

// Public APIs
export const publicApi = {
  getRestaurant: (slug?: string) =>
    apiRequest('/public/restaurant', {}, slug ? { slug } : undefined),
  resolveQr: (token: string) =>
    apiRequest(`/public/qr/resolve?t=${encodeURIComponent(token)}`),
  getMenu: () =>
    apiRequest('/menu/public'),
  getReceipt: (token: string) =>
    apiRequest(`/billing/public/receipt/${token}`),
};

// Customer APIs
export const customerApi = {
  checkout: (orderData: any) =>
    apiRequest('/orders/customer/checkout', { method: 'POST', body: JSON.stringify(orderData) }),
  getOrder: (id: string, token: string) =>
    apiRequest(`/orders/customer/${id}?token=${encodeURIComponent(token)}`),
  getSessionBill: (sessionId: string) =>
    apiRequest(`/billing/session/${sessionId}`),
  requestService: (data: { table_id?: string; table_session_id?: string; order_id?: string; request_type: string; notes?: string }) =>
    apiRequest('/service-requests/customer', { method: 'POST', body: JSON.stringify(data) }),
  payOnline: (data: { order_id?: string; table_session_id?: string; method?: string }) =>
    apiRequest('/billing/customer/pay', { method: 'POST', body: JSON.stringify(data) }),
};

// Staff Auth APIs
export const staffAuthApi = {
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: () =>
    apiRequest('/auth/me'),
};

// Waiter APIs
export const waiterApi = {
  getTables: () =>
    apiRequest('/tables'),
  createOrder: (orderData: any) =>
    apiRequest('/orders/waiter/order', { method: 'POST', body: JSON.stringify(orderData) }),
  getOrders: (status?: string) =>
    apiRequest(`/orders/staff/list${status ? `?status=${status}` : ''}`),
  updateOrderStatus: (id: string, status: string) =>
    apiRequest(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  markServed: (id: string) =>
    apiRequest(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'served' }) }),
  getServiceRequests: () =>
    apiRequest('/service-requests/waiter'),
  resolveServiceRequest: (id: string) =>
    apiRequest(`/service-requests/waiter/${id}/resolve`, { method: 'PATCH' }),
  getSessionBill: (sessionId: string) =>
    apiRequest(`/billing/session/${sessionId}`),
  generateBill: (data: { table_session_id?: string; order_id?: string; discount_paise?: number }) =>
    apiRequest('/billing/generate', { method: 'POST', body: JSON.stringify(data) }),
  recordPayment: (data: { bill_id: string; amount_paise: number; method: string; transaction_reference?: string }) =>
    apiRequest('/billing/payments', { method: 'POST', body: JSON.stringify(data) }),
  updateTableStatus: (tableId: string, status: string) =>
    apiRequest(`/tables/${tableId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// Kitchen APIs
export const kitchenApi = {
  getTickets: () =>
    apiRequest('/kitchen/tickets'),
  updateStatus: (ticketId: string, status: 'acknowledged' | 'preparing' | 'ready') =>
    apiRequest(`/kitchen/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// Manager APIs
export const managerApi = {
  // Menu
  createCategory: (name: string, description?: string, sort_order?: number) =>
    apiRequest('/menu/categories', { method: 'POST', body: JSON.stringify({ name, description, sort_order }) }),
  deleteCategory: (id: string) =>
    apiRequest(`/menu/categories/${id}`, { method: 'DELETE' }),
  createItem: (itemData: any) =>
    apiRequest('/menu/items', { method: 'POST', body: JSON.stringify(itemData) }),
  toggleItemAvailability: (id: string, is_available: boolean) =>
    apiRequest(`/menu/items/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available }) }),
  deleteItem: (id: string) =>
    apiRequest(`/menu/items/${id}`, { method: 'DELETE' }),

  // Tables & QR
  getTables: () =>
    apiRequest('/tables'),
  createTable: (table_number: string, capacity: number) =>
    apiRequest('/tables', { method: 'POST', body: JSON.stringify({ table_number, capacity }) }),
  generateQr: (tableId: string) =>
    apiRequest(`/tables/${tableId}/qr`, { method: 'POST' }),

  // Orders & Sales
  getOrders: () =>
    apiRequest('/orders/staff/list'),
  getSales: () =>
    apiRequest('/loyalty/sales'),
  getCustomers: () =>
    apiRequest('/loyalty/customers'),
  getLoyaltyLedger: () =>
    apiRequest('/loyalty/ledger'),

  // Staff
  getStaff: () =>
    apiRequest('/manager/staff'),
  createStaff: (data: { email: string; password: string; full_name: string; role: string }) =>
    apiRequest('/manager/staff', { method: 'POST', body: JSON.stringify(data) }),
  toggleStaffStatus: (id: string, is_active: boolean) =>
    apiRequest(`/manager/staff/${id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active }) }),
};
