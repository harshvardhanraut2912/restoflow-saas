import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, CheckCircle, Bell, RefreshCw, CreditCard } from 'lucide-react';
import { customerApi } from '../../services/api.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';

export const CustomerRunningBill: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant } = useTenant();
  const { tableContext } = useCart();

  const [billRecord, setBillRecord] = useState<any>(null);
  const [billData, setBillData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestSent, setRequestSent] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [receiptToken, setReceiptToken] = useState<string | null>(null);

  const loadBill = () => {
    if (!tableContext.sessionId) {
      setIsLoading(false);
      return;
    }

    customerApi.getSessionBill(tableContext.sessionId)
      .then((data) => {
        setBillRecord(data.bill);
        setBillData(data.summary);
        if (data.bill?.receipt_token_hash) {
          setReceiptToken(data.bill.receipt_token_hash);
        }
      })
      .catch((err) => {
        console.error('Failed to load session bill:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadBill();
    const interval = setInterval(loadBill, 4000);
    return () => clearInterval(interval);
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

  const handlePayOnline = async () => {
    if (!tableContext.sessionId) return;
    setIsPaying(true);
    try {
      const res = await customerApi.payOnline({
        table_session_id: tableContext.sessionId,
        method: 'online_gateway'
      });
      if (res.receipt_token) {
        setReceiptToken(res.receipt_token);
      }
      loadBill();
      alert('Payment successful! Your table bill has been settled.');
    } catch (err: any) {
      alert(err.message || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-rose-600 animate-spin mb-3" />
        <div className="text-slate-900 font-semibold text-sm">Computing Running Bill...</div>
      </div>
    );
  }

  if (!tableContext.sessionId || !billData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <Receipt className="w-12 h-12 text-slate-400 mb-3 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">No Active Running Bill</h2>
        <p className="text-xs text-slate-500 mb-6">You don't have an active table session yet.</p>
        <button
          onClick={() => navigate('/u/customer/menu')}
          className="bg-slate-900 text-white font-bold py-2.5 px-6 rounded-xl text-xs mx-auto"
        >
          View Menu
        </button>
      </div>
    );
  }

  const isBillPaid = billRecord?.status === 'paid';

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
            <h1 className="font-bold text-sm">Table {tableContext.tableNumber} Bill</h1>
            <div className="text-[10px] text-slate-400">Live Session Total</div>
          </div>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Paid Status Banner */}
        {isBillPaid && (
          <div className="p-5 rounded-3xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-emerald-600 shrink-0" />
              <div>
                <div className="font-black text-sm text-emerald-900">PAID • Bill Settled</div>
                <div className="text-xs text-emerald-700">Thank you for dining with us!</div>
              </div>
            </div>
            {receiptToken && (
              <button
                onClick={() => navigate(`/u/customer/receipt/${receiptToken}`)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/20"
              >
                Receipt ↗
              </button>
            )}
          </div>
        )}

        {requestSent && !isBillPaid && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Bill settlement requested! The floor captain is bringing the bill to your table.</span>
          </div>
        )}

        {/* Aggregated Items */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
            All Session Items ({billData.items?.length || 0})
          </div>

          <div className="divide-y divide-slate-100">
            {billData.items?.map((item: any) => (
              <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">
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
        <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 text-xs shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Invoice Calculation</div>

          <div className="flex justify-between text-slate-600">
            <span>Net Item Subtotal</span>
            <span>₹{(billData.subtotal_paise / 100).toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>GST ({billData.tax_rate_percent}%)</span>
            <span>₹{(billData.tax_paise / 100).toFixed(2)}</span>
          </div>

          {billData.service_charge_paise > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Service Charge ({billData.service_charge_percent}%)</span>
              <span>₹{(billData.service_charge_paise / 100).toFixed(2)}</span>
            </div>
          )}

          {billData.round_off_paise !== 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Round Off</span>
              <span>₹{(billData.round_off_paise / 100).toFixed(2)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-between font-black text-base text-slate-900">
            <span>Grand Total</span>
            <span className={isBillPaid ? 'text-emerald-600' : 'text-rose-600'}>
              {isBillPaid ? 'PAID ' : ''}₹{(billData.grand_total_paise / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Action Controls - Vanishes when already Paid */}
        {!isBillPaid ? (
          <div className="space-y-3">
            <button
              onClick={handlePayOnline}
              disabled={isPaying}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl text-sm transition-all shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CreditCard className="w-5 h-5" />
              {isPaying ? 'Processing Online Payment...' : 'Pay Bill Online (UPI / Card)'}
            </button>

            <button
              onClick={handleRequestBill}
              disabled={requestSent}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Bell className="w-4 h-4" />
              {requestSent ? 'Bill Requested from Floor Captain' : 'Request Waiter to Table to Settle (Cash/Card)'}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <button
              onClick={() => navigate('/u/customer/menu')}
              className="bg-slate-900 text-white font-bold py-3 px-6 rounded-2xl text-xs"
            >
              Return to Menu
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
