import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  PauseCircle, 
  PlayCircle, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Lock, 
  Mail, 
  Server, 
  Building2, 
  DollarSign, 
  ShoppingBag,
  Users,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { devadminApi } from '../../services/api.js';

export const DevAdminPortal: React.FC = () => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('devadmin_token'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Platform data state
  const [overview, setOverview] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Create restaurant modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    primary_domain: '',
    logo_url: '',
    primary_color: '#e11d48',
    secondary_color: '#1e293b',
    manager_name: 'Restaurant Manager',
    manager_email: '',
    manager_password: ''
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verify server-side token on mount
  useEffect(() => {
    if (isAuthenticated) {
      devadminApi.getMe()
        .then(() => {
          loadPlatformData();
        })
        .catch(() => {
          localStorage.removeItem('devadmin_token');
          setIsAuthenticated(false);
        });
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await devadminApi.login(loginEmail, loginPassword);
      localStorage.setItem('devadmin_token', res.token);
      setIsAuthenticated(true);
      setActionSuccess('Authenticated as Platform DevAdmin');
    } catch (err: any) {
      setLoginError(err.message || 'Invalid DevAdmin email or password.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('devadmin_token');
    setIsAuthenticated(false);
    setOverview(null);
    setRestaurants([]);
  };

  const loadPlatformData = async () => {
    setIsLoading(true);
    try {
      const [ovData, restoData] = await Promise.all([
        devadminApi.getOverview(),
        devadminApi.getRestaurants()
      ]);
      setOverview(ovData);
      setRestaurants(restoData.restaurants || []);
    } catch (err: any) {
      console.error('Failed to load platform data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string, name: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const actionLabel = newStatus === 'suspended' ? 'pause service for' : 'resume service for';
    if (!window.confirm(`Are you sure you want to ${actionLabel} "${name}"?`)) return;

    try {
      await devadminApi.updateStatus(id, newStatus);
      setActionSuccess(`Restaurant "${name}" is now ${newStatus.toUpperCase()}`);
      loadPlatformData();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`⚠️ Permanently mark restaurant "${name}" as deleted?`)) return;

    try {
      await devadminApi.deleteRestaurant(id);
      setActionSuccess(`Restaurant "${name}" marked as deleted.`);
      loadPlatformData();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await devadminApi.createRestaurant(form);
      setIsModalOpen(false);
      setForm({
        name: '',
        slug: '',
        primary_domain: '',
        logo_url: '',
        primary_color: '#e11d48',
        secondary_color: '#1e293b',
        manager_name: 'Restaurant Manager',
        manager_email: '',
        manager_password: ''
      });
      setActionSuccess(`Restaurant "${form.name}" provisioned successfully!`);
      loadPlatformData();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create restaurant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // VIEW 1: DEVADMIN LOGIN GATE
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-500"></div>

          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Platform DevAdmin</h1>
              <p className="text-xs text-slate-400">Restricted Operations Management</p>
            </div>
          </div>

          {loginError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                DevAdmin Email
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="admin@smartresto.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                DevAdmin Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-6 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying Server Credentials...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Access DevAdmin Control Center
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
            Protected server-side verification • Isolated tenant management
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: DEVADMIN CONTROL CENTER
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-black text-lg">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                Smart Restaurant SaaS
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  DevAdmin Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">Global Tenant Orchestration</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-rose-900/20"
            >
              <Plus className="w-4 h-4" />
              Provision New Restaurant
            </button>
            <button
              onClick={handleLogout}
              className="border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {actionSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Global KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Restaurants</span>
              <Building2 className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-white">
              {overview?.stats?.total_restaurants || restaurants.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Active: <span className="text-emerald-400 font-semibold">{overview?.stats?.active_restaurants || restaurants.filter(r => r.status === 'active').length}</span> • Paused: <span className="text-amber-400 font-semibold">{overview?.stats?.suspended_restaurants || restaurants.filter(r => r.status === 'suspended').length}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Orders</span>
              <ShoppingBag className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-white">
              {overview?.stats?.total_platform_orders || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Across all registered dining tables</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Verified Volume</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              ₹{((overview?.stats?.platform_volume_paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Settled & paid bills</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Isolation Engine</span>
              <ShieldCheck className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-base font-semibold text-white">Multi-Tenant Scoped</div>
            <div className="text-[11px] text-slate-400 mt-1">Single shared API • Scoped database</div>
          </div>
        </div>

        {/* Restaurants Management Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Configured Restaurant Tenants</h2>
              <p className="text-xs text-slate-400">Control individual restaurant operations, pause servers, or inspect tables</p>
            </div>
            <button
              onClick={loadPlatformData}
              disabled={isLoading}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800/60">
                <tr>
                  <th className="py-3.5 px-6">Restaurant</th>
                  <th className="py-3.5 px-6">Slug & Domain</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Staff & Tables</th>
                  <th className="py-3.5 px-6">Orders & Sales</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {restaurants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No restaurants configured yet. Click "Provision New Restaurant" above.
                    </td>
                  </tr>
                ) : (
                  restaurants.map((resto) => (
                    <tr key={resto.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {resto.logo_url ? (
                            <img src={resto.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-800" />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                              style={{ backgroundColor: resto.primary_color || '#e11d48' }}
                            >
                              {resto.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white text-sm">{resto.name}</div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: resto.primary_color }}></span>
                              ID: {resto.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-slate-300 font-mono text-xs">{resto.slug}</div>
                        <div className="text-[11px] text-slate-500">{resto.primary_domain}</div>
                      </td>

                      <td className="py-4 px-6">
                        {resto.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Active Online
                          </span>
                        ) : resto.status === 'suspended' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Service Paused
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Deleted
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-slate-300">{resto.staff_count || 0} Staff Members</div>
                        <div className="text-[11px] text-slate-500">{resto.tables_count || 0} Dining Tables</div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-slate-300 font-medium">{resto.orders_count || 0} Orders</div>
                        <div className="text-[11px] text-emerald-400">
                          ₹{((resto.total_revenue_paise || 0) / 100).toFixed(2)}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Pause / Resume Button */}
                          {resto.status !== 'deleted' && (
                            <button
                              onClick={() => handleToggleStatus(resto.id, resto.status, resto.name)}
                              title={resto.status === 'active' ? 'Pause restaurant service' : 'Resume restaurant service'}
                              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                resto.status === 'active'
                                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                              }`}
                            >
                              {resto.status === 'active' ? (
                                <>
                                  <PauseCircle className="w-4 h-4" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="w-4 h-4" />
                                  Resume
                                </>
                              )}
                            </button>
                          )}

                          {/* Quick Launch Customer View */}
                          <a
                            href={`/u/customer/menu?resto=${resto.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Customer QR Menu"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          {/* Quick Launch Staff View */}
                          <a
                            href={`/s/login?resto=${resto.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Staff Portal"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            <Users className="w-4 h-4" />
                          </a>

                          {/* Delete Restaurant */}
                          {resto.status !== 'deleted' && (
                            <button
                              onClick={() => handleDelete(resto.id, resto.name)}
                              title="Delete restaurant"
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log Stream */}
        {overview?.recentLogs && overview.recentLogs.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-400" />
              Platform Audit & Action Logs
            </h3>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-2 text-xs">
              {overview.recentLogs.map((log: any) => (
                <div key={log.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                    <span className="font-semibold text-slate-200">
                      {log.action}
                    </span>
                    {log.restaurant_name && (
                      <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                        {log.restaurant_name}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500 text-[11px]">Actor: {log.actor_id}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* MODAL: PROVISION NEW RESTAURANT TENANT     */}
      {/* ========================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Provision New Restaurant</h3>
                <p className="text-xs text-slate-400">Creates isolated tenant, settings & initial manager account</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateRestaurant} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Restaurant Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Copper Chimney Bistro"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    setForm({
                      ...form,
                      name,
                      slug: form.slug ? form.slug : slug,
                      primary_domain: form.primary_domain ? form.primary_domain : `${slug}.localhost`
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Tenant Slug *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. copperchimney"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Primary Domain / Host *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="copperchimney.localhost"
                    value={form.primary_domain}
                    onChange={(e) => setForm({ ...form, primary_domain: e.target.value.toLowerCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Restaurant Logo URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Brand Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-xl border border-slate-800 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.primary_color}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Manager Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.manager_name}
                    onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Initial Manager Credentials */}
              <div className="pt-3 border-t border-slate-800/80">
                <div className="text-xs font-bold text-white mb-2">Initial Manager Account Setup</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Manager Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="manager@copperchimney.com"
                      value={form.manager_email}
                      onChange={(e) => setForm({ ...form, manager_email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Manager Password *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Initial secure password"
                      value={form.manager_password}
                      onChange={(e) => setForm({ ...form, manager_password: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating Tenant...
                    </>
                  ) : (
                    'Provision & Launch'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
