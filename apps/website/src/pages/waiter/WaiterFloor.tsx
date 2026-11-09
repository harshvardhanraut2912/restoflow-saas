import React, { useEffect, useState } from 'react';
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
  X
} from 'lucide-react';
import { waiterApi, publicApi, ApiError } from '../../services/api.js';
import { useStaffAuth } from '../../context/StaffAuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ThemeToggle } from '../../components/ThemeToggle.js';

export const WaiterFloor: React.FC = () => {
  const { user, logout } = useStaffAuth();
  const { restaurant } = useTenant();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'tables' | 'serve' | 'orders' | 'requests'>('tables');
  const [tables, setTables] = useState<any[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Orders in 'ready' status awaiting waiter delivery
  const readyOrders = activeOrders.filter((o) => o.status === 'ready');

  // Selected Table Drawer State
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [sessionBill, setSessionBill] = useState<any | null>(null);

  // Manual Order POS Modal
  const [isOrderingOpen, setIsOrderingOpen] = useState(false);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<{ menuItem: any; quantity: number }[]>([]);
  const [customerPhone, setCustomerPhone] = useState('9876543210');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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
      setTables(tData.tables || []);
      setActiveOrders(oData.orders || []);
      setServiceRequests(rData.requests || []);
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
    try {
      await waiterApi.markServed(orderId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to mark order as served.');
    }
  };

  const handleResolveRequest = async (id: string) => {
    try {
      await waiterApi.resolveServiceRequest(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve request.');
    }
  };

  const handleOpenPOS = async () => {
    if (menuCategories.length === 0) {
      const data = await publicApi.getMenu();
      setMenuCategories(data.categories || []);
    }
    setOrderItems([]);
    setIsOrderingOpen(true);
  };

  const handleAddPosItem = (item: any) => {
    const idx = orderItems.findIndex((o) => o.menuItem.id === item.id);
    if (idx > -1) {
      const copy = [...orderItems];
      copy[idx].quantity += 1;
      setOrderItems(copy);
    } else {
      setOrderItems([...orderItems, { menuItem: item, quantity: 1 }]);
    }
  };

  const handleSubmitPosOrder = async () => {
    if (orderItems.length === 0) return;
    setIsSubmittingOrder(true);
    try {
      await waiterApi.createOrder({
        order_type: 'dine_in',
        table_id: selectedTable?.id,
        table_session_id: selectedTable?.active_session_id,
        phone: customerPhone,
        items: orderItems.map((o) => ({
          menu_item_id: o.menuItem.id,
          quantity: o.quantity
        }))
      });
      setIsOrderingOpen(false);
      loadData();
      if (selectedTable?.active_session_id) {
        const bill = await waiterApi.getSessionBill(selectedTable.active_session_id);
        setSessionBill(bill.summary);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to place order.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleSettleBill = async () => {
    if (!selectedTable?.active_session_id || !sessionBill) return;
    setIsProcessingPayment(true);
    try {
      // 1. Generate final bill
      const billRes = await waiterApi.generateBill({
        table_session_id: selectedTable.active_session_id
      });
      // 2. Record payment
      await waiterApi.recordPayment({
        bill_id: billRes.bill.id,
        amount_paise: billRes.bill.grand_total_paise,
        method: paymentMethod
      });
      setIsSettlingBill(false);
      setSelectedTable(null);
      loadData();
      alert(`Payment marked 'Paid' successfully via ${paymentMethod.toUpperCase()}! Order is completed and table is settled.`);
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Live Floor Table Map</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tap a table to view running session, add items, or settle bill</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-emerald-500"></span> Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-amber-500"></span> Occupied
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-indigo-500"></span> Bill Requested
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {tables.map((table) => {
                const isOccupied = table.status === 'occupied' && !!table.active_session_id;
                const isBillRequested = isOccupied && table.session_status === 'bill_requested';

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`p-5 rounded-3xl border-2 text-left flex flex-col justify-between transition-all active:scale-95 ${
                      selectedTable?.id === table.id
                        ? 'ring-4 ring-rose-500/30'
                        : ''
                    } ${
                      isBillRequested
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/80'
                        : isOccupied
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500/60'
                        : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-3">
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        Table {table.table_number}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isBillRequested ? 'bg-indigo-400 animate-pulse' : isOccupied ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                    </div>

                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div>Capacity: {table.capacity} Guests</div>
                      <div className={`font-semibold ${isOccupied ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                        {isBillRequested ? 'Bill Requested' : isOccupied ? 'Dining in Progress' : 'Empty / Available'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: SERVE ORDER (READY TICKETS FROM KITCHEN) */}
        {activeTab === 'serve' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Ready to Serve ({readyOrders.length})
                  {readyOrders.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse">
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
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">When the kitchen marks orders 'Ready', they will blink in green here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {readyOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-3xl p-6 bg-white dark:bg-slate-950 border-2 border-emerald-500 shadow-xl shadow-emerald-500/20 flex flex-col justify-between space-y-4 animate-pulse relative overflow-hidden ring-2 ring-emerald-400/50"
                  >
                    {/* Glowing Accent Top Bar */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400"></div>

                    <div>
                      {/* Table & Order Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            {o.table_number ? `Table ${o.table_number}` : 'Takeaway'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">Order #{o.order_number}</div>
                        </div>

                        {/* Blinking Green Badge */}
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-700 dark:text-emerald-300 text-xs font-black tracking-wider uppercase flex items-center gap-1.5 shadow-md shadow-emerald-500/30 animate-pulse">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
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

                    {/* Mark as Served Button */}
                    <button
                      onClick={() => handleMarkServed(o.id)}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-black py-3.5 rounded-2xl text-sm transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Mark as Served
                    </button>
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
                        {o.order_type === 'dine_in' ? `Table ${o.table_number}` : 'Takeaway'}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">Customer: {o.customer_name || o.customer_phone_snapshot}</div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">₹{(o.subtotal_paise / 100).toFixed(0)}</div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                      {o.status}
                    </span>
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
                      <div className="text-base font-black text-slate-900 dark:text-white">Table {req.table_number}</div>
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase mt-0.5">
                        {req.request_type} requested
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {new Date(req.created_at).toLocaleTimeString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleResolveRequest(req.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
                    >
                      Resolve
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
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Table {selectedTable.table_number}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Capacity: {selectedTable.capacity} Guests</p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
                    <span className="text-rose-500 dark:text-rose-400">₹{(sessionBill.grand_total_paise / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">Table {selectedTable.table_number} is Empty</div>
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

            {sessionBill && (
              <button
                onClick={() => setIsSettlingBill(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
              >
                <DollarSign className="w-4 h-4" />
                Payment (Collect &amp; Mark 'Paid')
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
              Table {selectedTable?.table_number} Bill Payment
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Total Amount: ₹{((sessionBill?.grand_total_paise || 0) / 100).toFixed(2)}</p>

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

      {/* Manual Order POS Modal */}
      {isOrderingOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Manual POS Order</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Add dishes to Table {selectedTable?.table_number}</p>
              </div>
              <button onClick={() => setIsOrderingOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto mb-4">
              {/* Menu Column */}
              <div className="space-y-3 overflow-y-auto pr-2">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Available Menu</div>
                {menuCategories.map((cat) => (
                  <div key={cat.id} className="space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{cat.name}</div>
                    {cat.items.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => handleAddPosItem(item)}
                        className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-left flex items-center justify-between text-xs transition-colors"
                      >
                        <span className="font-semibold text-slate-900 dark:text-white">{item.name}</span>
                        <span className="font-bold text-rose-500 dark:text-rose-400">₹{(item.base_price_paise / 100).toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* Selected Items Column */}
              <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Order Basket</div>
                  {orderItems.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 dark:text-slate-600 text-xs">Tap dishes to add</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {orderItems.map((o, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                          <span>{o.quantity}x {o.menuItem.name}</span>
                          <span className="font-bold text-slate-900 dark:text-white">₹{((o.menuItem.base_price_paise * o.quantity) / 100).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Customer Mobile</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    onClick={handleSubmitPosOrder}
                    disabled={isSubmittingOrder || orderItems.length === 0}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl text-xs disabled:opacity-50"
                  >
                    {isSubmittingOrder ? 'Placing Order...' : 'Send to Kitchen'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
