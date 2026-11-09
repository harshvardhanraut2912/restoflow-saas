import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';

export const StaffLogin: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant } = useTenant();
  const { login } = useStaffAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await login(email, password);
      if (user.role === 'manager') {
        navigate('/s/manager/dashboard');
      } else if (user.role === 'kitchen') {
        navigate('/s/kitchen/dashboard');
      } else {
        navigate('/s/waiter/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
        ></div>

        <div className="text-center mb-8">
          {restaurant?.logo_url ? (
            <img src={restaurant.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border border-slate-800" />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-white text-xl mx-auto mb-3 shadow-lg"
              style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
            >
              {restaurant?.name?.charAt(0) || 'R'}
            </div>
          )}
          <h1 className="text-xl font-bold text-white tracking-tight">{restaurant?.name || 'Restaurant'}</h1>
          <p className="text-xs text-slate-400 mt-1">Staff Operations Portal (Manager / Waiter / Kitchen)</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Staff Email
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="manager@royalspice.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: restaurant?.primary_color || undefined }}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Sign In to Staff Portal
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
          Demo Staff Credentials:
          <div className="text-slate-400 mt-1">
            Manager: manager@royalspice.com / Manager@123<br />
            Waiter: waiter@royalspice.com / Waiter@123<br />
            Kitchen: kitchen@royalspice.com / Kitchen@123
          </div>
        </div>
      </div>
    </div>
  );
};
