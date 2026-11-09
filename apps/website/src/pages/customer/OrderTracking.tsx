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
  Bell
} from 'lucide-react';
import { customerApi } from '../../services/api.js';
import { useTenant } from '../../context/TenantContext.js';

export const CustomerOrderTracking: React.FC = () => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { restaurant } = useTenant();

  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    // Poll every 5 seconds for status updates
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [orderId, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mb-3" />
        <div className="text-slate-900 dark:text-white font-semibold text-sm">Loading Order Tracking...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Order Not Found</h2>
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
    { key: 'ready', label: 'Ready to Serve', desc: 'Your food is ready!' },
    { key: 'served', label: 'Served', desc: 'Enjoy your meal!' }
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Menu
          </button>
          <div className="text-center">
            <h1 className="font-bold text-sm">Order Status</h1>
            <div className="text-[10px] text-slate-400">Order {order.order_number}</div>
          </div>
          <button
            onClick={fetchOrder}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Status Stepper Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {order.order_type === 'dine_in' ? `Table ${order.table_number || ''}` : 'Takeaway Order'}
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {order.order_number}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</span>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                ₹{(order.subtotal_paise / 100).toFixed(0)}
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className="space-y-6">
            {steps.map((step, idx) => {
              const isDone = idx < activeIndex;
              const isCurrent = idx === activeIndex;

              return (
                <div key={step.key} className="flex items-start gap-4 relative">
                  {idx < steps.length - 1 && (
                    <div
                      className={`absolute left-4 top-8 w-0.5 h-10 -ml-[1px] transition-colors ${
                        idx < activeIndex ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  )}

                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 z-10 transition-all ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : isCurrent
                        ? 'bg-rose-600 text-white ring-4 ring-rose-500/20 animate-pulse'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                  </div>

                  <div>
                    <div className={`font-bold text-xs sm:text-sm ${
                      isCurrent ? 'text-rose-600 dark:text-rose-400' : isDone ? 'text-slate-900 dark:text-white' : 'text-slate-400'
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100 dark:border-slate-800">
            Ordered Dishes ({order.items?.length || 0})
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {order.items?.map((item: any) => (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
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

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add More Dishes to this Table
          </button>

          {order.table_session_id && (
            <button
              onClick={() => navigate('/u/customer/bill')}
              className="w-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
            >
              <Receipt className="w-4 h-4" />
              View Total Running Table Bill
            </button>
          )}
        </div>
      </main>
    </div>
  );
};
