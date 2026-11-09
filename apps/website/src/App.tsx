import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { TenantProvider, useTenant } from './context/TenantContext.js';
import { CartProvider } from './context/CartContext.js';
import { StaffAuthProvider } from './context/StaffAuthContext.js';
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
  const { restaurant, switchTenant } = useTenant();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 select-none">
      <div className="max-w-2xl w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-rose-600/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-black text-2xl mx-auto shadow-2xl">
          🍽️
        </div>

        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Smart Restaurant SaaS Operations</h1>
          <p className="text-sm text-slate-400 mt-2">
            Multi-Tenant QR Ordering, Kitchen Display System & Floor Control
          </p>
        </div>

        {/* Current Tenant Switcher */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs max-w-md mx-auto">
          <span className="text-slate-400">Active Tenant:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => switchTenant('royalspice')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                restaurant?.slug === 'royalspice' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Royal Spice Bistro
            </button>
            <button
              onClick={() => switchTenant('urbancrust')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                restaurant?.slug === 'urbancrust' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Urban Crust Pizzeria
            </button>
          </div>
        </div>

        {/* Navigation Portals Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {/* 1. Customer QR Entry Demo */}
          <Link
            to="/u/customer/table?t=demo_token_table_1_royalspice"
            className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-rose-500/50 transition-all hover:shadow-xl group"
          >
            <div className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Customer Flow</div>
            <div className="text-base font-bold text-white group-hover:text-rose-400 transition-colors">
              Table 1 QR Scan Entry
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Test scanning QR token (?t=demo_token_table_1_royalspice), browsing menu, and mobile checkout.
            </p>
          </Link>

          {/* 2. Staff Login */}
          <Link
            to="/s/login"
            className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 transition-all hover:shadow-xl group"
          >
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Staff Access</div>
            <div className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
              Staff Unified Login
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Role-based login for Manager, Waiter Floor Captain, and Head Chef (KDS).
            </p>
          </Link>

          {/* 3. Kitchen KDS Direct */}
          <Link
            to="/s/kitchen/dashboard"
            className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 transition-all hover:shadow-xl group"
          >
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Kitchen Display</div>
            <div className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
              Kitchen Display System (KDS)
            </div>
            <p className="text-xs text-slate-400 mt-1">
              High-contrast tablet view with elapsed timers, sound alerts, and ticket workflows.
            </p>
          </Link>

          {/* 4. DevAdmin Management */}
          <Link
            to="/d/devadmin"
            className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 transition-all hover:shadow-xl group"
          >
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Superadmin</div>
            <div className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
              Platform DevAdmin Panel
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Restricted portal (/d/devadmin) to provision new restaurants, pause servers, or manage tenants.
            </p>
          </Link>
        </div>
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
                  <Route path="/s/kitchen/dashboard" element={<KitchenKDS />} />
                  <Route path="/s/waiter/dashboard" element={<WaiterFloor />} />
                  <Route path="/s/waiter/tables" element={<WaiterFloor />} />
                  <Route path="/s/manager/*" element={<ManagerDashboard />} />

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
