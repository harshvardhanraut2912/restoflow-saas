import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  Clock, 
  ChefHat, 
  Utensils, 
  ArrowLeft, 
  Plus, 
  Receipt, 
  RefreshCw,
  Bell,
  CreditCard,
  DollarSign,
  X
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

  const handleCallWaiter = async () => {
    setIsCallingWaiter(true);
    try {
      await customerApi.requestService({
        order_id: order.id,
        table_id: order.table_id,
        table_session_id: order.table_session_id,
        request_type: 'waiter',
        notes: `Customer called waiter from Table ${order.table_number || ''}`
      });
      setWaiterCallSuccess(`Floor captain called for Table ${order.table_number || ''}! Someone is on the way.`);
      setTimeout(() => setWaiterCallSuccess(null), 8000);
    } catch (err: any) {
      alert(err.message || 'Failed to call waiter.');
    } finally {
      setIsCallingWaiter(false);
    }
  };

  const handleCustomerPayOnline = async () => {
    setIsProcessingPayment(true);
    try {
      const res = await customerApi.payOnline({
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

  const isOrderPaid = order.is_paid || order.status === 'completed' || order.bill?.status === 'paid';
  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const activeIndex = order.status === 'completed' ? 5 : (currentStepIndex >= 0 ? currentStepIndex : 0);

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
            <h1 className="font-bold text-sm">Order Status</h1>
            <div className="text-[10px] text-slate-400">
              {order.round_number ? `Order ${order.round_number} (${order.order_number})` : `Order ${order.order_number}`}
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

        {/* PAID Banner when order/bill is paid */}
        {isOrderPaid && (
          <div className="p-5 rounded-3xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="font-black text-sm text-emerald-900">PAID • Bill Settled</div>
                <div className="text-xs text-emerald-700">Thank you for dining with us!</div>
              </div>
            </div>
            <button
              onClick={() => setIsReceiptOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20 flex items-center gap-1.5"
            >
              <Receipt className="w-3.5 h-3.5" />
              Receipt
            </button>
          </div>
        )}

        {/* Status Stepper Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {order.order_type === 'dine_in' ? `Table ${order.table_number ? String(order.table_number).replace(/^T-0?/, '') : ''}` : 'Takeaway Order'}
                {order.round_number ? ` • Order ${order.round_number}` : ''}
              </span>
              <div className="text-2xl font-black text-slate-900">
                {order.order_number}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isOrderPaid ? 'Status' : order.session_subtotal_paise ? 'Total Table Amount' : 'Amount'}
              </span>
              <div className={`text-lg font-black ${isOrderPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isOrderPaid ? 'PAID' : `₹${((order.session_subtotal_paise || order.subtotal_paise) / 100).toFixed(0)}`}
              </div>
              {!isOrderPaid && order.session_subtotal_paise && order.session_subtotal_paise !== order.subtotal_paise && (
                <div className="text-[10px] text-slate-400 font-medium">
                  This Batch: ₹{(order.subtotal_paise / 100).toFixed(0)}
                </div>
              )}
            </div>
          </div>

          {/* Stepper */}
          <div className="space-y-6">
            {steps.map((step, idx) => {
              const isDone = isOrderPaid || idx < activeIndex;
              const isCurrent = !isOrderPaid && idx === activeIndex;

              return (
                <div key={step.key} className="flex items-start gap-4 relative">
                  {idx < steps.length - 1 && (
                    <div
                      className={`absolute left-4 top-8 w-0.5 h-10 -ml-[1px] transition-colors ${
                        isDone ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  )}

                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 z-10 transition-all ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : isCurrent
                        ? 'bg-rose-600 text-white ring-4 ring-rose-500/20 animate-pulse'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                  </div>

                  <div>
                    <div className={`font-bold text-xs sm:text-sm ${
                      isCurrent ? 'text-rose-600' : isDone ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ordered Items Breakdown */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100 flex items-center justify-between">
            <span>Dishes in Order {order.round_number || 1} ({order.items?.length || 0})</span>
            <span className="font-mono text-slate-700">₹{(order.subtotal_paise / 100).toFixed(0)}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {order.items?.map((item: any) => (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">
                    {item.quantity}x {item.name_snapshot}
                  </div>
                  {item.variant_name_snapshot && (
                    <div className="text-[11px] text-slate-400">{item.variant_name_snapshot}</div>
                  )}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="text-[10px] text-slate-400">
                      {item.modifiers.map((m: any) => m.name).join(', ')}
                    </div>
                  )}
                </div>
                <span className="font-bold">₹{(item.total_price_paise / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-Order Table Summary (when user places Order 1, Order 2, etc.) */}
        {order.session_orders && order.session_orders.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                All Orders on Table {order.table_number ? String(order.table_number).replace(/^T-0?/, '') : ''} ({order.session_orders.length})
              </span>
              <span className="text-xs font-black text-rose-600">
                Total: ₹{((order.session_subtotal_paise || order.subtotal_paise) / 100).toFixed(0)}
              </span>
            </div>

            <div className="space-y-2.5">
              {order.session_orders.map((so: any) => {
                const isCurrent = so.id === order.id;
                return (
                  <div
                    key={so.id}
                    className={`p-3 rounded-2xl border transition-all ${
                      isCurrent
                        ? 'bg-rose-50/60 border-rose-300'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-900 flex items-center gap-1.5">
                        <span className="text-rose-600 font-extrabold">Order {so.round_number || 1}</span>
                        <span className="text-slate-400 font-normal">({so.order_number})</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-600 text-white font-bold">This Order</span>
                        )}
                      </span>
                      <span className="text-slate-900 font-black">₹{(so.subtotal_paise / 100).toFixed(0)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {so.items?.map((it: any) => `${it.quantity}x ${it.name}`).join(', ')}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 uppercase font-semibold">Status: <span className="text-slate-700 font-bold">{so.status}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="space-y-3">
          {/* Button 1: Call Waiter / Request Service */}
          <button
            onClick={handleCallWaiter}
            disabled={isCallingWaiter}
            className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-slate-950 font-black py-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
          >
            <Bell className="w-4 h-4" />
            {isCallingWaiter ? 'Calling Waiter...' : 'Call Waiter / Request Service'}
          </button>

          {/* Button 2: Pay Bill Online (VPM / Card) - Only shown if NOT paid yet */}
          {!isOrderPaid && (
            <button
              onClick={() => setIsPayingOnline(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black py-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              Pay Bill Online (UPI / Card)
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
          {isOrderPaid && (
            <button
              onClick={() => setIsReceiptOpen(true)}
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
                <p className="text-xs text-slate-500">Order #{order.order_number}</p>
              </div>
              <button
                onClick={() => setIsPayingOnline(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-5 text-center">
              <span className="text-xs text-slate-500">Total Table Payable Amount</span>
              <div className="text-2xl font-black text-rose-600 mt-0.5">
                ₹{(((order.session_subtotal_paise || order.subtotal_paise)) / 100).toFixed(2)}
              </div>
              {order.session_subtotal_paise && order.session_subtotal_paise !== order.subtotal_paise && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Settles all orders on Table {order.table_number ? String(order.table_number).replace(/^T-0?/, '') : ''}
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
          order
            ? {
                orderNumber: order.order_number,
                roundNumber: order.round_number,
                tableNumber: order.table_number,
                orderType: order.order_type || 'dine_in',
                createdAt: order.created_at,
                items: order.items || [],
                subtotal_paise: order.subtotal_paise || 0,
                tax_paise: Math.round((order.subtotal_paise || 0) * 0.05),
                grand_total_paise: Math.round((order.subtotal_paise || 0) * 1.05),
                paymentMethod: isOrderPaid ? (order.payment_method || 'Online / Cash') : 'Pending',
                isOnlinePayment: Boolean(order.payment_method?.includes('online') || order.receipt_token),
                transactionReference: order.receipt_token ? `TXN-${order.receipt_token.substring(0, 8).toUpperCase()}` : undefined
              }
            : null
        }
      />
    </div>
  );
};
