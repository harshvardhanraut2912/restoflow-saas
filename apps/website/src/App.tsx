import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { TenantProvider, useTenant } from './context/TenantContext.js';
import { CartProvider } from './context/CartContext.js';
import { StaffAuthProvider } from './context/StaffAuthContext.js';
import { useStaffAuth } from './context/StaffAuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { SuspendedNotice } from './components/SuspendedNotice.js';

// DevAdmin
import { DevAdminPortal } from './pages/devadmin/DevAdminPortal.js';

// Customer Pages
import { TableEntry } from './pages/customer/TableEntry.js';
import { CustomerMenu } from './pages/customer/Menu.js';
import { CustomerCart } from './pages/customer/Cart.js';
import { CustomerCheckout } from './pages/customer/Checkout.js';
import { CustomerOrderTracking } from './pages/customer/OrderTracking.js';
import { CustomerRunningBill } from './pages/customer/RunningBill.js';
import { CustomerReceipt } from './pages/customer/Receipt.js';

// Staff Pages
import { StaffLogin } from './pages/staff/Login.js';
import { KitchenKDS } from './pages/kitchen/KitchenKDS.js';
import { WaiterFloor } from './pages/waiter/WaiterFloor.js';
import { ManagerDashboard } from './pages/manager/ManagerDashboard.js';

// Portal Hub / Landing Page
const PlatformLanding: React.FC = () => {
  const { restaurant } = useTenant();
  const hostname = window.location.hostname.toLowerCase();
  const isSubdomain = hostname.includes('.') && !hostname.startsWith('www.');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-rose-600/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-black text-2xl mx-auto shadow-2xl">
          🍽️
        </div>

        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            {isSubdomain ? `${restaurant?.name || 'Restaurant'} Portal` : 'Smart Restaurant SaaS Operations'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {isSubdomain
              ? `Subdomain: ${hostname} • Dedicated Restaurant Node`
              : 'Multi-Tenant Subdomain Architecture • Independent Database Scoping & Floor Control'}
          </p>
        </div>

        {/* If on a subdomain, show this restaurant's dedicated direct links */}
        {isSubdomain ? (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-semibold inline-block">
              ✓ Connected to Subdomain: <span className="font-mono text-white">{hostname}</span> ({restaurant?.name})
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              {/* Customer Table 1 */}
              <Link
                to="/u/customer/table?t=1"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 transition-all hover:shadow-xl group"
              >
                <div className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Customer QR</div>
                <div className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">
                  Table 1 Ordering
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  /u/customer/table?t=1
                </p>
              </Link>

              {/* Manager */}
              <Link
                to="/s/manager/dashboard"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all hover:shadow-xl group"
              >
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Manager</div>
                <div className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">
                  Manager Console
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Menu, sales, staff & QR
                </p>
              </Link>

              {/* Waiter */}
              <Link
                to="/s/waiter/dashboard"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl group"
              >
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">Floor Staff</div>
                <div className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors">
                  Waiter Floor Map
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Active tables, bills & POS
                </p>
              </Link>

              {/* Kitchen */}
              <Link
                to="/s/kitchen/dashboard"
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-all hover:shadow-xl group"
              >
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Kitchen</div>
                <div className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                  Kitchen KDS
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Live tickets & timers
                </p>
              </Link>
            </div>
          </div>
        ) : (
          /* When on bare localhost, show clear subdomain launcher cards for each tenant */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              {/* Restaurant 1: Royal Spice Bistro */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-rose-500/30 transition-all shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Royal Spice Bistro</h2>
                    <span className="font-mono text-xs text-rose-400">royalspice.localhost:5173</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    Indian Fine Dining
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <a
                    href="http://royalspice.localhost:5173/u/customer/table?t=1"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">📱 Customer QR Table 1 (?t=1)</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://royalspice.localhost:5173/s/manager/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">👔 Manager Console</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://royalspice.localhost:5173/s/waiter/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">🛎️ Waiter Floor POS</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://royalspice.localhost:5173/s/kitchen/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">🍳 Kitchen KDS</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                </div>
              </div>

              {/* Restaurant 2: Urban Crust Pizzeria */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-orange-500/30 transition-all shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Urban Crust Pizzeria</h2>
                    <span className="font-mono text-xs text-orange-400">urbancrust.localhost:5173</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    Artisanal Sourdough
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <a
                    href="http://urbancrust.localhost:5173/u/customer/table?t=1"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-orange-950/40 border border-slate-800 hover:border-orange-500/40 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">📱 Customer QR Table 1 (?t=1)</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://urbancrust.localhost:5173/s/manager/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">👔 Manager Console</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://urbancrust.localhost:5173/s/waiter/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">🛎️ Waiter Floor POS</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                  <a
                    href="http://urbancrust.localhost:5173/s/kitchen/dashboard"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
                  >
                    <span className="font-medium">🍳 Kitchen KDS</span>
                    <span className="text-slate-500 text-[10px]">Launch ↗</span>
                  </a>
                </div>
              </div>
            </div>

            {/* DevAdmin Banner */}
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-left">
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  🛡️ DevAdmin Superadmin Panel
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                    /d/devadmin
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Provision new restaurants, pause tenant servers, set passwords, and manage quotas.
                </div>
              </div>
              <Link
                to="/d/devadmin"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0"
              >
                Open DevAdmin
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Route Guard Wrapper for Restaurant Suspension
const TenantRouteWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSuspended } = useTenant();

  if (isSuspended && !window.location.pathname.startsWith('/d/devadmin')) {
    return <SuspendedNotice />;
  }

  return <>{children}</>;
};

// Auth Guard for Staff Routes
const ProtectedStaffRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: Array<'manager' | 'waiter' | 'kitchen'>;
}> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useStaffAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/s/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    if (user.role === 'manager') return <Navigate to="/s/manager/dashboard" replace />;
    if (user.role === 'kitchen') return <Navigate to="/s/kitchen/dashboard" replace />;
    return <Navigate to="/s/waiter/dashboard" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <TenantProvider>
      <StaffAuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ThemeProvider>
              <TenantRouteWrapper>
                <Routes>
                  {/* Platform Landing & Portal Switcher */}
                  <Route path="/" element={<PlatformLanding />} />

                  {/* DevAdmin Portal (Dedicated Superadmin Route requested by user) */}
                  <Route path="/d/devadmin" element={<DevAdminPortal />} />

                  {/* Customer QR Dining Routes */}
                  <Route path="/u/customer/table" element={<TableEntry />} />
                  <Route path="/u/customer/menu" element={<CustomerMenu />} />
                  <Route path="/u/customer/cart" element={<CustomerCart />} />
                  <Route path="/u/customer/checkout" element={<CustomerCheckout />} />
                  <Route path="/u/customer/order/:orderId" element={<CustomerOrderTracking />} />
                  <Route path="/u/customer/bill" element={<CustomerRunningBill />} />
                  <Route path="/u/customer/receipt/:receiptToken" element={<CustomerReceipt />} />

                  {/* Staff Login */}
                  <Route path="/s/login" element={<StaffLogin />} />

                  {/* Staff Views */}
                  <Route path="/s/kitchen/dashboard" element={
                    <ProtectedStaffRoute allowedRoles={['kitchen', 'manager']}>
                      <KitchenKDS />
                    </ProtectedStaffRoute>
                  } />
                  <Route path="/s/waiter/dashboard" element={
                    <ProtectedStaffRoute allowedRoles={['waiter', 'manager']}>
                      <WaiterFloor />
                    </ProtectedStaffRoute>
                  } />
                  <Route path="/s/waiter/tables" element={
                    <ProtectedStaffRoute allowedRoles={['waiter', 'manager']}>
                      <WaiterFloor />
                    </ProtectedStaffRoute>
                  } />
                  <Route path="/s/manager/*" element={
                    <ProtectedStaffRoute allowedRoles={['manager']}>
                      <ManagerDashboard />
                    </ProtectedStaffRoute>
                  } />

                  {/* Catch All */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </TenantRouteWrapper>
            </ThemeProvider>
          </BrowserRouter>
        </CartProvider>
      </StaffAuthProvider>
    </TenantProvider>
  );
};
export default App;
