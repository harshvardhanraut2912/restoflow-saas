import React, { useEffect, useState } from 'react';
import { 
  ChefHat, 
  Clock, 
  CheckCircle, 
  Play, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  LogOut,
  Utensils
} from 'lucide-react';
import { kitchenApi } from '../../services/api.js';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ThemeToggle } from '../../components/ThemeToggle.js';

export const KitchenKDS: React.FC = () => {
  const { user, logout } = useStaffAuth();
  const { restaurant } = useTenant();

  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastTicketCount, setLastTicketCount] = useState(0);

  // Play audio chime
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5
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
    } catch (err) {
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

  const getElapsedTime = (created_at: string) => {
    const diffMins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    return `${diffMins}m ago`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* KDS Top Bar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              {restaurant?.name || 'Kitchen'} Display System
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live (3.5s)
              </span>
            </h1>
            <p className="text-xs text-slate-400">Head Chef: {user?.fullName || 'Staff'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              soundEnabled
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Chime On' : 'Muted'}</span>
          </button>

          <button
            onClick={logout}
            className="p-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tickets Scrollable Grid */}
      <main className="flex-1 p-6 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
            <Utensils className="w-16 h-16 mb-4 text-slate-700" />
            <h2 className="text-xl font-bold text-slate-300">No Pending Kitchen Tickets</h2>
            <p className="text-xs text-slate-500 mt-1">Incoming QR & Waiter orders will chime here in real time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {tickets.map((t) => {
              const isUrgent = (Date.now() - new Date(t.created_at).getTime()) > 15 * 60000;

              return (
                <div
                  key={t.ticket_id}
                  className={`bg-slate-900 border-2 rounded-3xl overflow-hidden flex flex-col justify-between shadow-xl transition-all ${
                    t.ticket_status === 'preparing'
                      ? 'border-indigo-500/80'
                      : isUrgent
                      ? 'border-rose-500'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`p-4 border-b ${
                    t.ticket_status === 'preparing'
                      ? 'bg-indigo-950/40 border-indigo-900/60'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black text-white font-mono">
                        {t.ticket_number}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        t.order_type === 'dine_in'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {t.order_type === 'dine_in' ? `Table ${t.table_number || ''}` : 'Takeaway'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                      <span className="font-semibold text-slate-300">Order {t.order_number}</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5" />
                        {getElapsedTime(t.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-72">
                    {t.items?.map((item: any, idx: number) => (
                      <div key={idx} className="border-b border-slate-800/80 pb-2.5 last:border-none">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-base font-black text-white leading-tight">
                            {item.quantity}x {item.name_snapshot}
                          </span>
                        </div>

                        {item.variant_name_snapshot && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            Portion: <span className="text-slate-200 font-semibold">{item.variant_name_snapshot}</span>
                          </div>
                        )}

                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-[11px] text-amber-400 mt-0.5 font-medium">
                            Mods: {item.modifiers.map((m: any) => m.name).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}

                    {t.order_notes && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
                        Note: {t.order_notes}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="p-4 bg-slate-950/80 border-t border-slate-800">
                    {t.ticket_status === 'new' ? (
                      <button
                        onClick={() => handleUpdateStatus(t.ticket_id, 'preparing')}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        Start Preparing
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(t.ticket_id, 'ready')}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Ready for Serving
                      </button>
                    )}
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
