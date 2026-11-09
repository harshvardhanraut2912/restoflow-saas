import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, CheckCircle, Bell, RefreshCw } from 'lucide-react';
import { customerApi } from '../../services/api.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';

export const CustomerRunningBill: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant } = useTenant();
  const { tableContext } = useCart();

  const [billData, setBillData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    if (!tableContext.sessionId) {
      setIsLoading(false);
      return;
    }

    customerApi.getSessionBill(tableContext.sessionId)
      .then((data) => {
        setBillData(data.summary);
      })
      .catch((err) => {
        console.error('Failed to load session bill:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [tableContext.sessionId]);

  const handleRequestBill = async () => {
    if (!tableContext.tableId || !tableContext.sessionId) return;
    try {
      await customerApi.requestService({
        table_id: tableContext.tableId,
        table_session_id: tableContext.sessionId,
        request_type: 'bill'
      });
      setRequestSent(true);
    } catch (err: any) {
      alert(err.message || 'Failed to request bill.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mb-3" />
        <div className="text-slate-900 dark:text-white font-semibold text-sm">Computing Running Bill...</div>
      </div>
    );
  }

  if (!tableContext.sessionId || !billData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <Receipt className="w-12 h-12 text-slate-400 mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Active Running Bill</h2>
        <p className="text-xs text-slate-500 mb-6">You don't have an active table session yet.</p>
        <button
          onClick={() => navigate('/u/customer/menu')}
          className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 px-6 rounded-xl text-xs"
        >
          View Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24">
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
            <h1 className="font-bold text-sm">Table {tableContext.tableNumber} Bill</h1>
            <div className="text-[10px] text-slate-400">Live Session Total</div>
          </div>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {requestSent && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Bill settlement requested! The floor captain is bringing the bill to your table.</span>
          </div>
        )}

        {/* Aggregated Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100 dark:border-slate-800">
            All Session Items ({billData.items?.length || 0})
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {billData.items?.map((item: any) => (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {item.quantity}x {item.name_snapshot}
                  </div>
                  {item.variant_name_snapshot && (
                    <div className="text-[11px] text-slate-400">{item.variant_name_snapshot}</div>
                  )}
                </div>
                <span className="font-bold">₹{(item.total_price_paise / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3 text-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Invoice Calculation</div>

          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Net Item Subtotal</span>
            <span>₹{(billData.subtotal_paise / 100).toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>GST ({billData.tax_rate_percent}%)</span>
            <span>₹{(billData.tax_paise / 100).toFixed(2)}</span>
          </div>

          {billData.service_charge_paise > 0 && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Service Charge ({billData.service_charge_percent}%)</span>
              <span>₹{(billData.service_charge_paise / 100).toFixed(2)}</span>
            </div>
          )}

          {billData.round_off_paise !== 0 && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Round Off</span>
              <span>₹{(billData.round_off_paise / 100).toFixed(2)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between font-black text-base text-slate-900 dark:text-white">
            <span>Grand Total</span>
            <span className="text-rose-600 dark:text-rose-400">₹{(billData.grand_total_paise / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Request Bill Button */}
        <button
          onClick={handleRequestBill}
          disabled={requestSent}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-4 rounded-2xl text-sm transition-all shadow-xl shadow-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: restaurant?.primary_color || undefined }}
        >
          <Bell className="w-4 h-4" />
          {requestSent ? 'Bill Requested from Captain' : 'Request Printed Bill & Settle (Cash/Card/UPI)'}
        </button>
      </main>
    </div>
  );
};
