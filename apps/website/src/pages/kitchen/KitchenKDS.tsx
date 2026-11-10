import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Trash2,
  Flame,
  BellRing
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
  const [filter, setFilter] = useState<'all' | 'new' | 'preparing'>('all');
  // Optimistic actions awaiting server confirmation: ticketId -> target status ('void' = removed)
  const pending = useRef<Record<string, string>>({});
  const [, setTick] = useState(0);

  // Refresh elapsed timers every 20s
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 20000);
    return () => clearInterval(i);
  }, []);

  const counts = useMemo(
    () => ({
      new: tickets.filter((t) => t.ticket_status === 'new').length,
      preparing: tickets.filter((t) => t.ticket_status !== 'new').length
    }),
    [tickets]
  );
  const visible = tickets.filter((t) =>
    filter === 'all' ? true : filter === 'new' ? t.ticket_status === 'new' : t.ticket_status !== 'new'
  );

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
      // Apply optimistic state on top of server data so polling never flips a button back
      const serverTickets: any[] = data.tickets || [];
      const serverIds = new Set(serverTickets.map((t) => t.ticket_id));
      Object.keys(pending.current).forEach((id) => {
        const target = pending.current[id];
        const st = serverTickets.find((t) => t.ticket_id === id);
        const gone = (target === 'ready' || target === 'void') && !serverIds.has(id);
        const matched = st && st.ticket_status === target;
        if (gone || matched) delete pending.current[id];
      });
      const newTickets = serverTickets
        .filter((t) => pending.current[t.ticket_id] !== 'ready' && pending.current[t.ticket_id] !== 'void')
        .map((t) => (pending.current[t.ticket_id] ? { ...t, ticket_status: pending.current[t.ticket_id] } : t));
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
    if (pending.current[ticketId] === status) return;

    // 1. Instant UI: flip the button / remove the ticket right now
    pending.current[ticketId] = status;
    setTickets((prev) =>
      status === 'ready'
        ? prev.filter((t) => t.ticket_id !== ticketId)
        : prev.map((t) => (t.ticket_id === ticketId ? { ...t, ticket_status: status } : t))
    );

    // 2. Sync with the server in the background
    try {
      await kitchenApi.updateStatus(ticketId, status);
    } catch (err: any) {
      delete pending.current[ticketId];
      alert(err.message || 'Failed to update ticket.');
      loadTickets();
    }
  };

  const handleDeleteTicket = async (ticketId: string, orderNumber: string) => {
    if (!window.confirm(`Are you sure you want to cancel and void Order ${orderNumber}?\n\nIt will be removed from the kitchen board and logged as Cancelled on the Manager Dashboard.`)) {
      return;
    }

    pending.current[ticketId] = 'void';
    setTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));

    try {
      await kitchenApi.deleteTicket(ticketId, 'Cancelled from Kitchen Display');
    } catch (err: any) {
      delete pending.current[ticketId];
      alert(err.message || 'Failed to cancel order ticket.');
      loadTickets();
    }
  };

  const getMins = (created_at: string) => Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
  const getElapsedTime = (created_at: string) => {
    const diffMins = getMins(created_at);
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
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            {([
              ['all', `All (${tickets.length})`],
              ['new', `New (${counts.new})`],
              ['preparing', `Cooking (${counts.preparing})`]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  filter === key
                    ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-9 pt-4">
            {visible.map((t, ti) => {
              const mins = getMins(t.created_at);
              const isUrgent = mins >= 15;
              const isWarn = mins >= 10 && !isUrgent;
              const isNew = t.ticket_status === 'new';
              const tableLabel =
                t.order_type === 'dine_in'
                  ? `Table ${t.table_number ? String(t.table_number).replace(/^T-0?/, '') : ''}`
                  : 'Takeaway';
              const accent = isNew ? '#f59e0b' : '#6366f1';
              const tilt = ((ti * 7) % 5 - 2) * 0.25;
              const itemCount = (t.items || []).reduce((n: number, it: any) => n + (it.quantity || 0), 0);

              return (
                <div
                  key={t.ticket_id}
                  className="kds-bill relative"
                  style={{ transform: `rotate(${tilt}deg)` }}
                >
                  {/* metal clip */}
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                    <div className="w-16 h-6 rounded-md bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500 border border-slate-500/60 shadow-md flex items-center justify-center">
                      <div className="w-9 h-2 rounded-full bg-slate-700/70 shadow-inner" />
                    </div>
                    <div className="w-9 h-1.5 -mt-0.5 rounded-b bg-slate-600/80" />
                  </div>

                  <div style={{ filter: 'drop-shadow(0 10px 16px rgba(15,23,42,0.28))' }}>
                    <div
                      className={`relative text-slate-900 flex flex-col ${isUrgent ? 'ring-2 ring-rose-500' : ''}`}
                      style={{ background: '#fffdf6', borderTop: `8px solid ${accent}` }}
                    >
                      {/* Header */}
                      <div className="px-4 pt-5 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">Kitchen order</div>
                            <div className="text-2xl font-black font-mono leading-none mt-1">{t.ticket_number}</div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                              isNew ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {isNew ? <BellRing className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
                            {isNew ? 'New' : 'Cooking'}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-3 py-1.5 rounded-xl text-sm font-black ${
                                t.order_type === 'dine_in' ? 'bg-slate-900 text-white' : 'bg-amber-500 text-white'
                              }`}
                            >
                              {tableLabel}
                            </span>
                            {t.round_number > 1 && (
                              <span className="text-[11px] font-bold text-slate-500">Round {t.round_number}</span>
                            )}
                          </div>
                          <span
                            className={`flex items-center gap-1 text-sm font-black font-mono px-2 py-1 rounded-lg ${
                              isUrgent
                                ? 'bg-rose-100 text-rose-700'
                                : isWarn
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {mins < 1 ? 'Now' : `${mins}m`}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400 font-mono">
                          #{t.order_number} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </div>
                      </div>

                      {/* perforation */}
                      <div className="relative">
                        <div className="border-t-2 border-dashed border-slate-300" />
                        <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-950" />
                        <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-950" />
                      </div>

                      {/* Items */}
                      <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
                        {t.items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                                {item.image_url ? (
                                  <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                ) : (
                                  <Utensils className="w-6 h-6 text-slate-300" />
                                )}
                              </div>
                              <span className="absolute -top-2 -left-2 min-w-[28px] h-7 px-1.5 rounded-lg bg-slate-900 text-white text-sm font-black flex items-center justify-center border-2 border-[#fffdf6]">
                                {item.quantity}×
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-1.5">
                                <span
                                  className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                                    item.dietary_type === 'non_veg' ? 'bg-rose-500' : item.dietary_type === 'egg' ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                />
                                <span className="text-base font-black leading-tight">{item.name_snapshot}</span>
                              </div>
                              {item.variant_name_snapshot && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  Portion: <span className="font-bold text-slate-800">{item.variant_name_snapshot}</span>
                                </div>
                              )}
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="text-[11px] font-bold text-amber-700 mt-0.5">
                                  + {item.modifiers.map((m: any) => m.name).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {t.order_notes && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold">
                            Note: {t.order_notes}
                          </div>
                        )}
                      </div>

                      {/* perforation */}
                      <div className="border-t-2 border-dashed border-slate-300" />

                      {/* Actions */}
                      <div className="p-3.5 pb-4 flex items-center gap-2">
                        {t.ticket_status === 'new' ? (
                          <button
                            onClick={() => handleUpdateStatus(t.ticket_id, 'preparing')}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-black py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            Start Cooking
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(t.ticket_id, 'ready')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark Ready
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteTicket(t.ticket_id, t.order_number)}
                          className="px-3.5 py-3.5 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 active:scale-[0.98] font-bold text-xs flex items-center gap-1.5 transition-all shrink-0"
                          title="Cancel & Void Order from Kitchen (Logged on Manager Dashboard)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Void</span>
                        </button>
                      </div>
                    </div>

                    {/* torn bottom edge */}
                    <div
                      className="h-3 w-full"
                      style={{
                        background:
                          'linear-gradient(-135deg, transparent 6px, #fffdf6 0) 0 0 / 14px 14px repeat-x, linear-gradient(135deg, transparent 6px, #fffdf6 0) 0 0 / 14px 14px repeat-x'
                      }}
                    />
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
