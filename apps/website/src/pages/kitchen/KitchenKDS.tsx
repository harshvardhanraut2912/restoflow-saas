import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChefHat, 
  Clock, 
  CheckCircle, 
  Play, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  LogOut,
  Utensils,
  Trash2
} from 'lucide-react';
import { kitchenApi, ApiError } from '../../services/api.js';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ThemeToggle } from '../../components/ThemeToggle.js';

export const KitchenKDS: React.FC = () => {
  const { user, logout } = useStaffAuth();
  const { restaurant } = useTenant();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastTicketCount, setLastTicketCount] = useState(0);

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // AudioContext blocked before interaction
    }
  };

  const loadTickets = async () => {
    try {
      const data = await kitchenApi.getTickets();
      const newTickets = data.tickets || [];
      if (newTickets.length > lastTicketCount && lastTicketCount > 0) {
        playChime();
      }
      setLastTicketCount(newTickets.length);
      setTickets(newTickets);
    } catch (err: any) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate('/s/login');
        return;
      }
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
    const interval = setInterval(loadTickets, 3500);
    return () => clearInterval(interval);
  }, [lastTicketCount]);

  const handleUpdateStatus = async (ticketId: string, status: 'acknowledged' | 'preparing' | 'ready') => {
    try {
      await kitchenApi.updateStatus(ticketId, status);
      loadTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to update ticket.');
    }
  };

  const handleDeleteTicket = async (ticketId: string, orderNumber: string) => {
    if (!window.confirm(`Are you sure you want to cancel and void Order ${orderNumber}?\n\nIt will be removed from the kitchen board and logged as Cancelled on the Manager Dashboard.`)) {
      return;
    }

    try {
      await kitchenApi.deleteTicket(ticketId, 'Cancelled from Kitchen Display');
      loadTickets();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order ticket.');
    }
  };

  const getElapsedTime = (created_at: string) => {
    const diffMins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    return `${diffMins}m ago`;
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans select-none transition-colors">
      {/* KDS Top Bar */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {restaurant?.name || 'Kitchen'} Display System
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                Live (3.5s)
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Head Chef: {user?.fullName || 'Staff'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              soundEnabled
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Chime On' : 'Muted'}</span>
          </button>

          <button
            onClick={logout}
            className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tickets Scrollable Grid */}
      <main className="flex-1 p-6 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <RefreshCw className="w-10 h-10 mb-3 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading kitchen tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <Utensils className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-700" />
            <h2 className="text-xl font-bold text-slate-600 dark:text-slate-300">No Pending Kitchen Tickets</h2>
            <p className="text-xs text-slate-500 mt-1">Incoming QR &amp; Waiter orders will chime here in real time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {tickets.map((t) => {
              const isUrgent = (Date.now() - new Date(t.created_at).getTime()) > 15 * 60000;

              return (
                <div
                  key={t.ticket_id}
                  className={`bg-white dark:bg-slate-900 border-2 rounded-3xl overflow-hidden flex flex-col justify-between shadow-lg transition-all ${
                    t.ticket_status === 'preparing'
                      ? 'border-indigo-500/80'
                      : isUrgent
                      ? 'border-rose-500'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`p-4 border-b ${
                    t.ticket_status === 'preparing'
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                        {t.ticket_number}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        t.order_type === 'dine_in'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                        {t.order_type === 'dine_in' ? `Table ${t.table_number ? String(t.table_number).replace(/^T-0?/, '') : ''}${t.round_number ? ` • Order ${t.round_number}` : ''}` : 'Takeaway'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Order {t.order_number} {t.round_number ? `(Round ${t.round_number})` : ''}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5" />
                        {getElapsedTime(t.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-72">
                    {t.items?.map((item: any, idx: number) => (
                      <div key={idx} className="border-b border-slate-100 dark:border-slate-800/80 pb-2.5 last:border-none">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-base font-black text-slate-900 dark:text-white leading-tight">
                            {item.quantity}x {item.name_snapshot}
                          </span>
                        </div>

                        {item.variant_name_snapshot && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Portion: <span className="text-slate-800 dark:text-slate-200 font-semibold">{item.variant_name_snapshot}</span>
                          </div>
                        )}

                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
                            Mods: {item.modifiers.map((m: any) => m.name).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}

                    {t.order_notes && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                        Note: {t.order_notes}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    {t.ticket_status === 'new' ? (
                      <button
                        onClick={() => handleUpdateStatus(t.ticket_id, 'preparing')}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-900/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        Start Cooking
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(t.ticket_id, 'ready')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-900/20"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Mark Ready
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteTicket(t.ticket_id, t.order_number)}
                      className="px-3.5 py-3 rounded-xl border border-rose-300 dark:border-rose-900/80 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-98 font-bold text-xs flex items-center gap-1.5 transition-all shrink-0"
                      title="Cancel & Void Order from Kitchen (Logged on Manager Dashboard)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Void</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
