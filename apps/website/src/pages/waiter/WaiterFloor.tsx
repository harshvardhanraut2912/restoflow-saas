import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Utensils, 
  Receipt, 
  Bell, 
  Plus, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  DollarSign, 
  LogOut,
  CreditCard,
  QrCode,
  Printer,
  X,
  Trash2
} from 'lucide-react';
import { waiterApi, publicApi, ApiError } from '../../services/api.js';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ThemeToggle } from '../../components/ThemeToggle.js';
import { ReceiptModal, ReceiptData } from '../../components/ReceiptModal.js';
import { FloorMap } from '../../components/FloorMap.js';
import { WaiterOrderModal } from '../../components/WaiterOrderModal.js';

const formatTableNumber = (val?: string | null) => val ? String(val).replace(/^T-0?/, '') : '';

// Same lifecycle the customer sees: placed -> accepted -> preparing -> ready -> served
const ORDER_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  placed: { label: 'Sent to kitchen', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  accepted: { label: 'Accepted', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  preparing: { label: 'Preparing', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  ready: { label: 'Ready to serve', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  served: { label: 'Served', cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' }
};

export const WaiterFloor: React.FC = () => {
  const { user, logout } = useStaffAuth();
  const { restaurant, settings } = useTenant();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'tables' | 'serve' | 'orders' | 'requests'>('tables');
  const [tables, setTables] = useState<any[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);
  // Optimistic 'served' marks awaiting server confirmation (orderId -> true)
  const pendingServed = useRef<Record<string, boolean>>({});
  // Optimistic 'set empty' tables awaiting server confirmation
  const pendingEmpty = useRef<Record<string, boolean>>({});
  // Service requests marked Done locally, hidden instantly until the server confirms
  const pendingResolved = useRef<Record<string, boolean>>({});

  // Orders in 'ready' status awaiting waiter delivery
  const readyOrders = activeOrders.filter((o) => o.status === 'ready');

  // Selected Table Drawer State
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [sessionBill, setSessionBill] = useState<any | null>(null);

  // Manual Order POS Modal
  const [isOrderingOpen, setIsOrderingOpen] = useState(false);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [isMenuLoading, setIsMenuLoading] = useState(false);

  // Settle Bill Modal
  const [isSettlingBill, setIsSettlingBill] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'card'>('cash');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const loadData = async () => {
    try {
      const [tData, oData, rData] = await Promise.all([
        waiterApi.getTables(),
        waiterApi.getOrders(),
        waiterApi.getServiceRequests()
      ]);
      const serverTables: any[] = tData.tables || [];
      Object.keys(pendingEmpty.current).forEach((id) => {
        const st = serverTables.find((t) => t.id === id);
        if (!st || st.status === 'available') delete pendingEmpty.current[id];
      });
      setTables(
        serverTables.map((t) =>
          pendingEmpty.current[t.id]
            ? { ...t, status: 'available', active_session_id: null, session_status: null }
            : t
        )
      );
      // Keep optimistic 'served' state until the server confirms it
      const serverOrders: any[] = oData.orders || [];
      Object.keys(pendingServed.current).forEach((id) => {
        const so = serverOrders.find((o) => o.id === id);
        if (!so || so.status !== 'ready') delete pendingServed.current[id];
      });
      setActiveOrders(
        serverOrders
          .filter((o) => !(o.table_id && pendingEmpty.current[o.table_id]))
          .map((o) => (pendingServed.current[o.id] ? { ...o, status: 'served' } : o))
      );
      const serverRequests: any[] = rData.requests || [];
      Object.keys(pendingResolved.current).forEach((id) => {
        if (!serverRequests.some((r) => r.id === id)) delete pendingResolved.current[id];
      });
      setServiceRequests(serverRequests.filter((r) => !pendingResolved.current[r.id]));
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        navigate('/s/login');
        return;
      }
      console.error('Failed to load floor data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  // ---- Live view of the selected table (updates with every poll) ----
  const FINAL_STATUSES = ['completed', 'cancelled', 'rejected'];
  const liveTable = selectedTable ? tables.find((t) => t.id === selectedTable.id) || selectedTable : null;
  const tableOrders = selectedTable
    ? activeOrders.filter((o) => o.table_id === selectedTable.id && !FINAL_STATUSES.includes(o.status))
    : [];
  const ordersSig = tableOrders.map((o) => `${o.id}:${o.status}`).join('|');
  const sessionIdLive: string | null =
    liveTable?.active_session_id || tableOrders.find((o) => o.table_session_id)?.table_session_id || null;
  const fallbackSubtotal = tableOrders.reduce((sum, o) => sum + (o.subtotal_paise || 0), 0);
  const fallbackTotal = Math.round(fallbackSubtotal * (1 + (settings?.tax_rate_percent ?? 5) / 100));
  // One ledger (from the server): Total bill, Paid so far, Unpaid (= what to collect now)
  const payTotal: number = sessionBill?.total_paise ?? sessionBill?.grand_total_paise ?? fallbackTotal;
  const paidSoFar: number = sessionBill?.paid_paise ?? 0;
  const payUnpaid: number = sessionBill ? (sessionBill.unpaid_paise ?? Math.max(0, payTotal - paidSoFar)) : fallbackTotal;

  useEffect(() => {
    if (!selectedTable) return;
    let alive = true;
    if (!sessionIdLive) {
      setSessionBill(null);
      return;
    }
    waiterApi
      .getSessionBill(sessionIdLive)
      .then((b: any) => alive && setSessionBill(b?.summary || null))
      .catch(() => alive && setSessionBill(null));
    return () => {
      alive = false;
    };
  }, [selectedTable?.id, sessionIdLive, ordersSig]);

  const handleSelectTable = async (table: any) => {
    setSelectedTable(table);
    setSessionBill(null);
    if (table.active_session_id) {
      try {
        const bill = await waiterApi.getSessionBill(table.active_session_id);
        setSessionBill(bill.summary);
      } catch {
        setSessionBill(null);
      }
    }
  };

  const handleMarkServed = async (orderId: string) => {
    if (pendingServed.current[orderId]) return;

    // Instant UI: mark served right now, sync in background
    pendingServed.current[orderId] = true;
    setActiveOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'served' } : o)));

    try {
      await waiterApi.markServed(orderId);
    } catch (err: any) {
      delete pendingServed.current[orderId];
      alert(err.message || 'Failed to mark order as served.');
      loadData();
    }
  };

  // Instant: the request disappears right away, the server is updated in the background
  const handleResolveRequest = (id: string) => {
    if (pendingResolved.current[id]) return;
    pendingResolved.current[id] = true;
    const removed = serviceRequests.find((r) => r.id === id);
    setServiceRequests((prev) => prev.filter((r) => r.id !== id));

    waiterApi.resolveServiceRequest(id).catch((err: any) => {
      delete pendingResolved.current[id];
      if (removed) setServiceRequests((prev) => (prev.some((r) => r.id === id) ? prev : [removed, ...prev]));
      alert(err?.message || 'Failed to resolve request.');
    });
  };

  const handleSetTableAvailable = async (tableId: string, tableNumber: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Set Table ${tableNumber} to Empty / Available?\n\nThis will clear the table, close the active session, and completely delete any active orders for Table ${tableNumber} from the kitchen and waiter boards.`)) {
      return;
    }

    // Instant UI: clear the table right now, sync in background
    pendingEmpty.current[tableId] = true;
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status: 'available', active_session_id: null, session_status: null } : t))
    );
    setActiveOrders((prev) => prev.filter((o) => o.table_id !== tableId));
    if (selectedTable?.id === tableId) {
      setSelectedTable(null);
      setSessionBill(null);
    }

    try {
      await waiterApi.updateTableStatus(tableId, 'available');
    } catch (err: any) {
      delete pendingEmpty.current[tableId];
      alert(err.message || 'Failed to update table status.');
      loadData();
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to completely delete Order ${orderNumber}?\n\nThis will remove the order from the database, kitchen, and manager panels.`)) {
      return;
    }

    try {
      await waiterApi.deleteOrder(orderId);
      loadData();
      if (selectedTable?.active_session_id) {
        try {
          const bill = await waiterApi.getSessionBill(selectedTable.active_session_id);
          setSessionBill(bill.summary);
        } catch {
          setSessionBill(null);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete order.');
    }
  };

  const loadMenu = async () => {
    setIsMenuLoading(true);
    try {
      const data = await publicApi.getMenu();
      setMenuCategories(data.categories || []);
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setIsMenuLoading(false);
    }
  };

  // Prefetch the menu once so the POS opens with the list already in memory
  useEffect(() => {
    loadMenu();
  }, []);

  const handleOpenPOS = () => {
    // Open instantly; if the menu somehow isn't loaded yet, fetch in background
    setIsOrderingOpen(true);
    if (menuCategories.length === 0 && !isMenuLoading) loadMenu();
  };

  // Order was accepted by the server: kitchen ticket, customer dashboard and table bill are all updated
  // server-side. Refresh the floor now so the waiter sees it immediately (the drawer's bill reloads
  // itself because the table's order list changes).
  const handleOrderPlaced = (result: any) => {
    setIsOrderingOpen(false);
    if (result?.table_session_id && selectedTable && !selectedTable.active_session_id) {
      setSelectedTable({ ...selectedTable, active_session_id: result.table_session_id, status: 'occupied' });
    }
    loadData();
  };

  const handleOpenOrderReceipt = (o: any) => {
    setActiveReceipt({
      orderNumber: o.order_number,
      roundNumber: o.round_number,
      tableNumber: o.table_number,
      orderType: o.order_type,
      createdAt: o.created_at,
      subtotal_paise: o.subtotal_paise || 0,
      tax_paise: Math.round((o.subtotal_paise || 0) * 0.05),
      grand_total_paise: Math.round((o.subtotal_paise || 0) * 1.05),
      paymentMethod: o.bill_status === 'paid' ? 'Paid' : 'Settled',
      items: o.items || []
    });
  };

  const handleSettleBill = async () => {
    if (!selectedTable || (!sessionIdLive && tableOrders.length === 0)) return;
    setIsProcessingPayment(true);
    try {
      let invoiceNumber: string | undefined;

      let sessionClosed = false;
      let unpaidCollected = payUnpaid;

      if (sessionIdLive) {
        // 1. Open the table's single bill (re-synced with every order on the table)
        const billRes = await waiterApi.generateBill({ table_session_id: sessionIdLive });
        invoiceNumber = billRes.bill?.bill_number;
        unpaidCollected = billRes.unpaid_paise ?? payUnpaid;
        // 2. Collect ONLY the unpaid part (earlier payments are never charged twice)
        if (unpaidCollected > 0) {
          const payRes = await waiterApi.recordPayment({
            bill_id: billRes.bill.id,
            amount_paise: unpaidCollected,
            method: paymentMethod
          });
          sessionClosed = Boolean(payRes.session_closed);
        } else {
          sessionClosed = false;
        }
      } else {
        // No session bound to these orders: settle each order individually
        for (const o of tableOrders) {
          const billRes = await waiterApi.generateBill({ order_id: o.id });
          if ((billRes.unpaid_paise ?? 1) > 0) {
            const payRes = await waiterApi.recordPayment({
              bill_id: billRes.bill.id,
              amount_paise: billRes.unpaid_paise ?? billRes.bill.grand_total_paise,
              method: paymentMethod
            });
            sessionClosed = sessionClosed || Boolean(payRes.session_closed);
          }
          invoiceNumber = invoiceNumber || billRes.bill?.bill_number;
        }
      }

      const currentBill = sessionBill;
      const currentTable = selectedTable;
      const currentOrders = tableOrders;
      // Table only turns empty when everything is served; dishes still cooking keep it occupied
      if (sessionClosed) pendingEmpty.current[currentTable.id] = true;
      setIsSettlingBill(false);
      if (sessionClosed) setSelectedTable(null);
      loadData();

      // Auto-open print receipt dialog
      setActiveReceipt({
        orderNumber: `Table ${currentTable.table_number}`,
        tableNumber: currentTable.table_number,
        orderType: 'dine_in',
        createdAt: new Date().toISOString(),
        items:
          currentBill?.items ||
          currentOrders.flatMap((o) =>
            (o.items || []).map((it: any) => ({ name_snapshot: it.name, quantity: it.quantity, total_price_paise: 0 }))
          ),
        subtotal_paise: currentBill?.subtotal_paise ?? currentOrders.reduce((n, o) => n + (o.subtotal_paise || 0), 0),
        tax_paise: currentBill?.tax_paise,
        grand_total_paise: currentBill?.total_paise ?? currentBill?.grand_total_paise ?? payTotal,
        paymentMethod: paymentMethod,
        invoiceNumber
      });
    } catch (err: any) {
      alert(err.message || 'Payment settlement failed.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading floor data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans select-none pb-12">
      {/* Top Header */}
      <header className="h-16 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {restaurant?.name || 'Restaurant'} Floor Control
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Floor Captain: {user?.fullName || 'Staff'}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'tables' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dining Tables ({tables.length})
          </button>
          <button
            onClick={() => setActiveTab('serve')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all relative flex items-center gap-1.5 ${
              activeTab === 'serve' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Serve Order ({readyOrders.length})
            {readyOrders.length > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'orders' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Active Orders ({activeOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-semibold transition-all relative ${
              activeTab === 'requests' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Service Requests ({serviceRequests.length})
            {serviceRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1 animate-ping"></span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={logout}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Floor Area */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1">
        {/* TAB 1: TABLES FLOOR */}
        {activeTab === 'tables' && (
          <FloorMap
            tables={tables}
            orders={activeOrders}
            requests={serviceRequests}
            selectedId={selectedTable?.id}
            onManage={handleSelectTable}
            onResolve={handleResolveRequest}
            onServe={handleMarkServed}
            onSetEmpty={(t: any) => handleSetTableAvailable(t.id, t.table_number)}
          />
        )}

        {/* TAB 2: SERVE ORDER (READY TICKETS FROM KITCHEN) */}
        {activeTab === 'serve' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Ready to Serve ({readyOrders.length})
                  {readyOrders.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      Hot &amp; Prepared
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fresh dishes prepared by kitchen awaiting table delivery</p>
              </div>
            </div>

            {readyOrders.length === 0 ? (
              <div className="py-20 text-center rounded-3xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                <Utensils className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300">All Dishes Served</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">When the kitchen marks orders 'Ready', they will appear in green here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {readyOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-3xl p-6 bg-white dark:bg-slate-900 border-2 border-emerald-500/80 dark:border-emerald-500/70 shadow-lg shadow-emerald-500/10 flex flex-col justify-between space-y-4 relative overflow-hidden transition-all"
                  >
                    {/* Glowing Emerald Accent Top Ribbon */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500"></div>

                    <div>
                      {/* Table & Order Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            {o.table_number ? `Table ${formatTableNumber(o.table_number)}${o.round_number ? ` • Order ${o.round_number}` : ''}` : 'Takeaway'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">Order #{o.order_number}</div>
                        </div>

                        {/* Solid Green Status Badge with Live Beacon */}
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-black tracking-wider uppercase flex items-center gap-2 shadow-sm">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          Ready to Serve
                        </div>
                      </div>

                      {/* Dishes List */}
                      <div className="mt-4 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Items to Deliver:
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {o.items && o.items.length > 0 ? (
                            o.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {item.quantity}x {item.name}
                                </span>
                                {item.variant && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">({item.variant})</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-400 italic">Dishes prepared &amp; hot</div>
                          )}
                        </div>
                      </div>

                      {o.notes && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px]">
                          Note: {o.notes}
                        </div>
                      )}
                    </div>

                    {/* Mark as Served & Delete Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleMarkServed(o.id)}
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-black py-6 rounded-2xl text-xl transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-3"
                      >
                        <CheckCircle className="w-7 h-7" />
                        Mark as Served
                      </button>
                      <button
                        onClick={(e) => handleDeleteOrder(o.id, o.order_number, e)}
                        className="px-4 py-6 rounded-2xl border border-rose-300 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-98 font-bold text-xs flex items-center gap-1 transition-colors shrink-0"
                        title="Delete & Void Order Completely"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ACTIVE ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Floor Orders Timeline</h2>
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {activeOrders.map((o) => (
                <div key={o.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{o.order_number}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {o.order_type === 'dine_in' ? `Table ${formatTableNumber(o.table_number)}${o.round_number ? ` • Order ${o.round_number}` : ''}` : 'Takeaway'}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">Customer: {o.customer_name || o.customer_phone_snapshot}</div>
                  </div>

                  <div className="text-right space-y-1.5 flex flex-col items-end">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">₹{(o.subtotal_paise / 100).toFixed(0)}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                        {o.status}
                      </span>
                      <button
                        onClick={() => handleOpenOrderReceipt(o)}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[10px] flex items-center gap-1 transition-colors"
                        title="Print / View Receipt"
                      >
                        <Printer className="w-3 h-3 text-rose-500" />
                        Receipt
                      </button>
                      <button
                        onClick={(e) => handleDeleteOrder(o.id, o.order_number, e)}
                        className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-semibold text-[10px] flex items-center gap-1 transition-colors"
                        title="Delete & Void Order Completely"
                      >
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SERVICE REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Guest Service Requests</h2>
            {serviceRequests.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                No active service requests from guests.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {serviceRequests.map((req) => (
                  <div key={req.id} className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-amber-500/40 flex items-center justify-between">
                    <div>
                      <div className="text-base font-black text-slate-900 dark:text-white">Table {formatTableNumber(req.table_number)}</div>
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase mt-0.5">
                        {req.request_type} requested
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {new Date(req.created_at).toLocaleTimeString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleResolveRequest(req.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-black px-6 py-3 rounded-xl transition-all shadow-md shadow-emerald-900/20"
                    >
                      Done ✓
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Selected Table Drawer */}
      {selectedTable && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col justify-between z-50">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Table {formatTableNumber(selectedTable.table_number)}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Capacity: {selectedTable.capacity} Guests</p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Orders & live progress (kitchen -> serve), same statuses the guest sees */}
            {tableOrders.length > 0 && (
              <div className="mb-5 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Orders &amp; Progress ({tableOrders.length})
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {[...tableOrders]
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((o) => {
                      const st = ORDER_STATUS_STYLE[o.status] || { label: o.status, cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' };
                      return (
                        <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white">
                              Order {o.round_number || ''} · #{String(o.order_number).replace('#', '').slice(-5)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {(o.items || []).map((it: any) => `${it.quantity}x ${it.name}`).join(', ')}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Session Summary */}
            {sessionBill ? (
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Active Session Dishes ({sessionBill.items?.length || 0})
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs">
                  {sessionBill.items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                      <span className="text-slate-700 dark:text-slate-300">{item.quantity}x {item.name_snapshot}</span>
                      <span className="font-bold text-slate-900 dark:text-white">₹{(item.total_price_paise / 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{(sessionBill.subtotal_paise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST Tax</span>
                    <span>₹{(sessionBill.tax_paise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span>Total Bill</span>
                    <span>₹{(payTotal / 100).toFixed(2)}</span>
                  </div>
                  {paidSoFar > 0 && (
                    <div className="flex justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                      <span>Already Paid</span>
                      <span>− ₹{(paidSoFar / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white">
                    <span>Unpaid Amount</span>
                    <span className={payUnpaid > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {payUnpaid > 0 ? `₹${(payUnpaid / 100).toFixed(2)}` : 'PAID ₹0.00'}
                    </span>
                  </div>
                </div>
              </div>
            ) : tableOrders.length > 0 ? (
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Active Orders ({tableOrders.length})
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1 text-xs">
                  {tableOrders.map((o) => (
                    <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Order {o.round_number || ''} · #{String(o.order_number).slice(-5)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${(ORDER_STATUS_STYLE[o.status] || ORDER_STATUS_STYLE.placed).cls}`}>
                            {(ORDER_STATUS_STYLE[o.status] || { label: o.status }).label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${o.is_paid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                            {o.is_paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </span>
                      </div>
                      {(o.items || []).map((it: any, i: number) => (
                        <div key={i} className="text-slate-700 dark:text-slate-300">{it.quantity}x {it.name}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-base text-slate-900 dark:text-white">
                  <span>Total Bill (approx)</span>
                  <span className="text-rose-500 dark:text-rose-400">₹{(fallbackTotal / 100).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">Table {formatTableNumber(selectedTable.table_number)} is Empty</div>
                <p className="text-slate-400 dark:text-slate-500 text-[11px]">This table is unoccupied and ready for new guests.</p>
              </div>
            )}
          </div>

          {/* Drawer Actions */}
          <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={handleOpenPOS}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Items (Manual Order)
            </button>

            {(sessionBill || tableOrders.length > 0) && payUnpaid > 0 && (
              <button
                onClick={() => setIsSettlingBill(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
              >
                <DollarSign className="w-4 h-4" />
                Collect Unpaid ₹{(payUnpaid / 100).toFixed(2)} &amp; Mark 'Paid'
              </button>
            )}

            {(selectedTable.status === 'occupied' || sessionIdLive || tableOrders.length > 0) && (
              <button
                onClick={() => handleSetTableAvailable(selectedTable.id, selectedTable.table_number)}
                className="w-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle className="w-4 h-4 text-rose-500" />
                Set Table as Empty (Clear &amp; Delete Orders)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Settle Bill Modal */}
      {isSettlingBill && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Table {formatTableNumber(selectedTable?.table_number)} Bill Payment
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 space-y-0.5">
              <div>Total Bill: ₹{(payTotal / 100).toFixed(2)}</div>
              {paidSoFar > 0 && <div>Already Paid: ₹{(paidSoFar / 100).toFixed(2)}</div>}
              <div className="font-bold text-rose-500 dark:text-rose-400 text-sm">Unpaid (collect now): ₹{(payUnpaid / 100).toFixed(2)}</div>
            </div>

            <div className="space-y-3 mb-6">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Select Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi_qr')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'upi_qr' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  UPI QR
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 ${
                    paymentMethod === 'card' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Card
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSettlingBill(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSettleBill}
                disabled={isProcessingPayment}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"
              >
                {isProcessingPayment ? 'Processing...' : "Confirm Payment & Mark 'Paid'"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order POS Modal (same order pipeline as the customer QR checkout) */}
      <WaiterOrderModal
        isOpen={isOrderingOpen && !!selectedTable}
        onClose={() => setIsOrderingOpen(false)}
        tableId={selectedTable?.id || ''}
        tableLabel={formatTableNumber(selectedTable?.table_number)}
        sessionId={sessionIdLive}
        categories={menuCategories}
        isMenuLoading={isMenuLoading}
        onReloadMenu={loadMenu}
        runningTotalPaise={sessionBill?.grand_total_paise ?? (tableOrders.length > 0 ? fallbackTotal : null)}
        onPlaced={handleOrderPlaced}
      />

      {/* MODAL: BROWSER RECEIPT MAKER / PRINT */}
      <ReceiptModal
        isOpen={!!activeReceipt}
        onClose={() => setActiveReceipt(null)}
        receipt={activeReceipt}
      />
    </div>
  );
};
