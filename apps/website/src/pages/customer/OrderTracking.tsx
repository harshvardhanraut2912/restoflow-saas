import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  ChefHat, 
  Utensils, 
  ArrowLeft, 
  Plus, 
  Receipt, 
  RefreshCw,
  Bell,
  CreditCard,
  DollarSign,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { customerApi } from '../../services/api.js';
import { useTenant } from '../../context/TenantContext.js';
import { ReceiptModal } from '../../components/ReceiptModal.js';

export const CustomerOrderTracking: React.FC = () => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { restaurant } = useTenant();

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Call Waiter & Payment States
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [waiterCallSuccess, setWaiterCallSuccess] = useState<string | null>(null);
  const [isPayingOnline, setIsPayingOnline] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any>(null);

  // Accordion state for multi-order mode (collapsed by default when 2+ orders)
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleOrderExpand = (id: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const fetchOrder = () => {
    if (!orderId || !token) {
      setError('Order tracking requires a valid access token.');
      setIsLoading(false);
      return;
    }

    customerApi.getOrder(orderId, token)
      .then((data) => {
        setOrder(data.order);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch order status.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchOrder();
    // Poll every 4 seconds for status updates
    const interval = setInterval(fetchOrder, 4000);
    return () => clearInterval(interval);
  }, [orderId, token]);

  // Instant feedback: show "waiter called" immediately, send the request in the background.
  // If the server rejects it, the message is withdrawn and the guest is told.
  const handleCallWaiter = () => {
    if (!order) return;
    const tableLabel = order.table_number ? String(order.table_number).replace(/^T-0?/, '') : '';
    setWaiterCallSuccess(`Floor captain called for Table ${tableLabel}! Someone is on the way.`);
    setIsPayingOnline(false);
    setTimeout(() => setWaiterCallSuccess(null), 8000);

    customerApi
      .requestService({
        order_id: order.id,
        table_id: order.table_id,
        table_session_id: order.table_session_id,
        request_type: 'waiter',
        notes: `Customer called waiter from Table ${tableLabel}`
      })
      .catch((err: any) => {
        setWaiterCallSuccess(null);
        alert(err?.message || 'Failed to call waiter. Please try again.');
      });
  };

  const handleCustomerPayOnline = async () => {
    if (!order) return;
    setIsProcessingPayment(true);
    try {
      await customerApi.payOnline({
        order_id: order.id,
        table_session_id: order.table_session_id,
        method: 'online_gateway'
      });
      setIsPayingOnline(false);
      fetchOrder();
      alert('Payment successful! Your order bill is settled.');
    } catch (err: any) {
      alert(err.message || 'Payment failed.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mb-3" />
        <div className="text-slate-900 font-semibold text-sm">Loading Order Tracking...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Order Not Found</h2>
        <p className="text-xs text-slate-500 mb-6">{error || 'Unable to locate this order.'}</p>
        <button
          onClick={() => navigate('/u/customer/menu')}
          className="bg-slate-800 text-white font-bold py-2.5 px-5 rounded-xl text-xs"
        >
          Return to Menu
        </button>
      </div>
    );
  }

  const steps = [
    { key: 'placed', label: 'Order Placed', desc: 'Received by kitchen' },
    { key: 'accepted', label: 'Order Accepted', desc: 'Queued for preparation' },
    { key: 'preparing', label: 'Preparing Food', desc: 'Cooking fresh right now' },
    { key: 'ready', label: 'Ready to Serve', desc: 'Food plated hot & ready' },
    { key: 'served', label: 'Served', desc: 'Delivered to your table. Enjoy!' }
  ];

  // Specific Order Progress Calculation: Strictly based on that individual order's status
  const getStepStatus = (status: string, stepIndex: number) => {
    let activeIndex = 0;
    if (status === 'accepted') activeIndex = 1;
    else if (status === 'preparing') activeIndex = 2;
    else if (status === 'ready') activeIndex = 3;
    else if (status === 'served' || status === 'completed') activeIndex = 4;

    const isComplete = status === 'completed' || status === 'served';
    const isDone = isComplete ? true : stepIndex < activeIndex;
    const isCurrent = !isComplete && stepIndex === activeIndex;

    return { isDone, isCurrent };
  };

  const renderStatusBadge = (status: string, isPaid: boolean) => {
    if (status === 'completed' || isPaid) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          Completed
        </span>
      );
    }
    if (status === 'ready') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
          </span>
          Ready to Serve
        </span>
      );
    }
    if (status === 'preparing') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
          <ChefHat className="w-3 h-3 text-amber-700 animate-bounce" />
          Cooking Fresh
        </span>
      );
    }
    if (status === 'accepted') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
          Accepted
        </span>
      );
    }
    if (status === 'served') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          Served
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
        Order Placed
      </span>
    );
  };

  // Determine all orders on this session / table
  const sessionOrders: any[] = (order.session_orders && order.session_orders.length > 0)
    ? order.session_orders
    : [order];
  const hasMultipleOrders = sessionOrders.length >= 2;

  // Total session statistics
  // Money comes from the server's single table ledger: Total = whole bill, Paid = already settled,
  // Unpaid = what is still owed (new dishes only, when the earlier part was already paid).
  const hasLedger = typeof order.session_total_paise === 'number' && order.session_total_paise > 0;
  const totalSubtotalPaise = hasLedger
    ? order.session_total_paise
    : Math.round((order.subtotal_paise || 0) * 1.05);
  const totalPaidPaise = hasLedger ? (order.session_paid_paise || 0) : (order.is_paid ? totalSubtotalPaise : 0);
  const totalUnpaidPaise = hasLedger
    ? (order.session_unpaid_paise || 0)
    : (order.is_paid ? 0 : totalSubtotalPaise);
  const isEverythingPaid = totalUnpaidPaise === 0;

  const displayTable = order.table_number ? String(order.table_number).replace(/^T-0?/, '') : '';

  // Active receipt target for the ReceiptModal
  const activeReceiptOrder = selectedReceiptOrder || order;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="text-slate-600 hover:text-slate-900 flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Menu
          </button>
          <div className="text-center">
            <h1 className="font-bold text-sm">Order Tracking</h1>
            <div className="text-[10px] text-slate-400">
              {order.order_type === 'dine_in' ? `Table ${displayTable}` : 'Takeaway'}
              {hasMultipleOrders ? ` • ${sessionOrders.length} Orders` : ` • ${order.order_number}`}
            </div>
          </div>
          <button
            onClick={fetchOrder}
            className="text-slate-500 hover:text-slate-900 p-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Waiter Call Confirmation Notification */}
        {waiterCallSuccess && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500 text-amber-900 text-xs font-bold flex items-center gap-2.5 animate-bounce">
            <Bell className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{waiterCallSuccess}</span>
          </div>
        )}

        {/* Global Payment Banner */}
        {isEverythingPaid ? (
          <div className="p-5 rounded-3xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="font-black text-sm text-emerald-900">PAID • Bill Settled</div>
                <div className="text-xs text-emerald-700">All orders paid • Total ₹{(totalSubtotalPaise / 100).toFixed(2)}</div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedReceiptOrder(order);
                setIsReceiptOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center gap-1.5"
            >
              <Receipt className="w-3.5 h-3.5" />
              Receipt
            </button>
          </div>
        ) : totalUnpaidPaise > 0 ? (
          <div className="p-5 rounded-3xl bg-rose-50/80 border border-rose-200 text-rose-950 shadow-sm flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Unpaid Amount</span>
              <div className="text-xl font-black text-rose-600">₹{(totalUnpaidPaise / 100).toFixed(2)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Total Bill: ₹{(totalSubtotalPaise / 100).toFixed(2)}
                {totalPaidPaise > 0 && <> • Paid: ₹{(totalPaidPaise / 100).toFixed(2)}</>}
              </div>
            </div>
            <button
              onClick={() => setIsPayingOnline(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              Pay Online
            </button>
          </div>
        ) : null}

        {/* Section Header when Multiple Orders are placed on Table */}
        {hasMultipleOrders && (
          <div className="px-1 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Orders on Table {displayTable} ({sessionOrders.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Tap any order dropdown below to track live cooking progress & dishes
              </p>
            </div>
            <span className="text-xs font-black text-slate-700 font-mono">
              ₹{(totalSubtotalPaise / 100).toFixed(2)} Total
            </span>
          </div>
        )}

        {/* ORDER CARDS:
            - If 2+ orders: All minimized first, click dropdown to open that order's details.
            - If 1 order: By default, all details are shown directly open.
        */}
        <div className="space-y-4">
          {sessionOrders.map((o: any) => {
            const isSingle = !hasMultipleOrders;
            const isExpanded = isSingle || Boolean(expandedOrders[o.id]);
            const isCurrentUrlOrder = o.id === order.id;
            const orderItems = o.items || [];
            const subtotal = o.subtotal_paise || 0;
            const isPaid = Boolean(o.is_paid);

            return (
              <div
                key={o.id}
                className={`bg-white border rounded-3xl shadow-sm overflow-hidden transition-all duration-200 ${
                  isCurrentUrlOrder ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                }`}
              >
                {/* Accordion / Header Bar */}
                <button
                  type="button"
                  onClick={() => {
                    if (hasMultipleOrders) {
                      toggleOrderExpand(o.id);
                    }
                  }}
                  className={`w-full p-5 flex items-center justify-between text-left transition-colors ${
                    hasMultipleOrders ? 'hover:bg-slate-50/80 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                      isPaid 
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-600 border border-rose-200'
                    }`}>
                      <Utensils className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900">
                          Order {o.round_number || 1}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          ({o.order_number})
                        </span>
                        {isCurrentUrlOrder && hasMultipleOrders && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-600 text-white font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {orderItems.length > 0
                          ? orderItems.map((it: any) => `${it.quantity}x ${it.name_snapshot || it.name}`).join(', ')
                          : 'Dishes in order'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900 font-mono">
                        {isPaid ? (
                          <span className="text-emerald-600 font-bold">PAID</span>
                        ) : (
                          `₹${(subtotal / 100).toFixed(0)}`
                        )}
                      </div>
                      <div className="mt-0.5">
                        {renderStatusBadge(o.status, isPaid)}
                      </div>
                    </div>

                    {/* Dropdown Chevron for 2+ Orders */}
                    {hasMultipleOrders && (
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded Details: Live Stepper, Dishes List, and Receipt Button */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-5 animate-in fade-in duration-200">
                    {/* Live Progress Stepper for this specific order */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Cooking &amp; Delivery Progress
                      </div>
                      <div className="space-y-4">
                        {steps.map((step, idx) => {
                          const { isDone, isCurrent } = getStepStatus(o.status, idx);

                          return (
                            <div key={step.key} className="flex items-start gap-3.5 relative">
                              {idx < steps.length - 1 && (
                                <div
                                  className={`absolute left-3.5 top-7 w-0.5 h-7 -ml-[1px] transition-colors ${
                                    isDone ? 'bg-emerald-500' : 'bg-slate-200'
                                  }`}
                                />
                              )}

                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 z-10 transition-all ${
                                  isDone
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : isCurrent
                                    ? 'bg-rose-600 text-white ring-4 ring-rose-500/20 animate-pulse'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                              </div>

                              <div>
                                <div className={`font-bold text-xs ${
                                  isCurrent ? 'text-rose-600' : isDone ? 'text-slate-900 font-bold' : 'text-slate-400'
                                }`}>
                                  {step.label}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {step.desc}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dishes in this order */}
                    <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1.5 border-b border-slate-200/60 flex items-center justify-between">
                        <span>Dishes in Order {o.round_number || 1} ({orderItems.length})</span>
                        <span className="font-mono text-slate-700">₹{(subtotal / 100).toFixed(0)}</span>
                      </div>

                      <div className="divide-y divide-slate-200/60">
                        {orderItems.map((item: any, iIdx: number) => (
                          <div key={item.id || iIdx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-semibold text-slate-800">
                                {item.quantity}x {item.name_snapshot || item.name}
                              </div>
                              {(item.variant_name_snapshot || item.variant_name) && (
                                <div className="text-[10px] text-slate-400">
                                  {item.variant_name_snapshot || item.variant_name}
                                </div>
                              )}
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="text-[9px] text-slate-400">
                                  {item.modifiers.map((m: any) => m.name).join(', ')}
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-slate-700 font-mono">
                              ₹{((item.total_price_paise || item.unit_price_paise * item.quantity || 0) / 100).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Order Footer: Payment Status & Print Receipt */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-semibold">Payment:</span>
                        {isPaid ? (
                          <span className="font-extrabold text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> PAID
                          </span>
                        ) : (
                          <span className="font-bold text-rose-600">Pending (₹{(subtotal / 100).toFixed(0)})</span>
                        )}
                      </div>

                      {isPaid && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReceiptOrder(o);
                            setIsReceiptOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="space-y-3 pt-2">
          {/* Button 1: Call Waiter / Request Service */}
          <button
            onClick={handleCallWaiter}
            className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-slate-950 font-black py-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
          >
            <Bell className="w-4 h-4" />
            {waiterCallSuccess ? 'Waiter Called ✓' : 'Call Waiter / Request Service'}
          </button>

          {/* Button 2: Pay Bill Online (Only shown if NOT all paid yet) */}
          {!isEverythingPaid && (
            <button
              onClick={() => setIsPayingOnline(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black py-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Pay Unpaid Amount Online • ₹{(totalUnpaidPaise / 100).toFixed(2)}
            </button>
          )}

          {/* Button 3: Add More Dishes to this Table */}
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md"
          >
            <Plus className="w-4 h-4" />
            Add More Dishes to this Table
          </button>

          {/* Button 4: Running Bill */}
          {order.table_session_id && (
            <button
              onClick={() => navigate('/u/customer/bill')}
              className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 border border-slate-200"
            >
              <Receipt className="w-4 h-4" />
              View Total Running Table Bill
            </button>
          )}

          {/* Button 5: View & Print Receipt when bill is paid */}
          {isEverythingPaid && (
            <button
              onClick={() => {
                setSelectedReceiptOrder(order);
                setIsReceiptOpen(true);
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black py-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
            >
              <Receipt className="w-4 h-4" />
              View &amp; Print Paid Receipt
            </button>
          )}
        </div>
      </main>

      {/* Customer Online Payment Modal */}
      {isPayingOnline && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Settle Order Online</h3>
                <p className="text-xs text-slate-500">
                  {order.order_type === 'dine_in' ? `Table ${displayTable}` : `Order #${order.order_number}`}
                </p>
              </div>
              <button
                onClick={() => setIsPayingOnline(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-5 text-center">
              <span className="text-xs text-slate-500">Payable Amount</span>
              <div className="text-2xl font-black text-rose-600 mt-0.5">
                ₹{(totalUnpaidPaise / 100).toFixed(2)}
              </div>
              {(hasMultipleOrders || totalPaidPaise > 0) && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Total bill ₹{(totalSubtotalPaise / 100).toFixed(2)}{totalPaidPaise > 0 ? ` • already paid ₹${(totalPaidPaise / 100).toFixed(2)}` : ''}
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <button
                onClick={handleCustomerPayOnline}
                disabled={isProcessingPayment}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <CreditCard className="w-4 h-4" />
                {isProcessingPayment ? 'Processing Instant Payment...' : 'Pay via Instant UPI / Card'}
              </button>

              <button
                onClick={handleCallWaiter}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Ask Waiter to Collect Cash at Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROWSER-SIDE THERMAL RECEIPT MAKER / PRINT */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        receipt={
          activeReceiptOrder
            ? {
                orderNumber: activeReceiptOrder.order_number,
                roundNumber: activeReceiptOrder.round_number,
                tableNumber: order.table_number,
                orderType: order.order_type || 'dine_in',
                createdAt: activeReceiptOrder.created_at,
                items: activeReceiptOrder.items || [],
                subtotal_paise: activeReceiptOrder.subtotal_paise || 0,
                tax_paise: Math.round((activeReceiptOrder.subtotal_paise || 0) * 0.05),
                grand_total_paise: Math.round((activeReceiptOrder.subtotal_paise || 0) * 1.05),
                paymentMethod: activeReceiptOrder.is_paid ? 'Online / Cash' : 'Pending',
                isOnlinePayment: Boolean(activeReceiptOrder.bill?.receipt_token_hash || order.receipt_token),
                transactionReference: activeReceiptOrder.bill?.receipt_token_hash
                  ? `TXN-${activeReceiptOrder.bill.receipt_token_hash.substring(0, 8).toUpperCase()}`
                  : undefined
              }
            : null
        }
      />
    </div>
  );
};
