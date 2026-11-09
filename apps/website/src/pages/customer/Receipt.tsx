import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, CheckCircle, ShieldCheck, Utensils } from 'lucide-react';
import { publicApi } from '../../services/api.js';

export const CustomerReceipt: React.FC = () => {
  const { receiptToken } = useParams();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptToken) {
      setError('Missing receipt token.');
      setIsLoading(false);
      return;
    }

    publicApi.getReceipt(receiptToken)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired receipt.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [receiptToken]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-slate-600 font-semibold text-sm">Loading Official Receipt...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Receipt Unavailable</h2>
          <p className="text-xs text-slate-500">{error || 'This receipt could not be verified.'}</p>
        </div>
      </div>
    );
  }

  const { restaurant, bill, items, payments } = data;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 flex flex-col items-center print:bg-white print:p-0">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 print:shadow-none print:border-none print:p-4">
        {/* Top Restaurant Branding */}
        <div className="text-center pb-6 border-b border-dashed border-slate-300">
          {restaurant.logo_url && (
            <img src={restaurant.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border border-slate-200" />
          )}
          <h1 className="text-xl font-black text-slate-900">{restaurant.name}</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-2">
            <CheckCircle className="w-3.5 h-3.5" />
            Tax Invoice & Payment Settled
          </div>
        </div>

        {/* Invoice Meta */}
        <div className="py-4 border-b border-dashed border-slate-300 text-xs text-slate-600 space-y-1.5">
          <div className="flex justify-between">
            <span className="font-semibold text-slate-400">Invoice Number</span>
            <span className="font-mono font-bold text-slate-900">{bill.bill_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-400">Date & Time</span>
            <span>{new Date(bill.settled_at || bill.created_at).toLocaleString()}</span>
          </div>
          {bill.table_number && (
            <div className="flex justify-between">
              <span className="font-semibold text-slate-400">Table</span>
              <span className="font-bold text-slate-900">Table {bill.table_number}</span>
            </div>
          )}
        </div>

        {/* Itemized Lines */}
        <div className="py-4 border-b border-dashed border-slate-300 space-y-2 text-xs">
          <div className="flex justify-between font-bold text-slate-400 uppercase tracking-wider text-[10px] pb-1">
            <span>Item</span>
            <span>Amount</span>
          </div>

          {items.map((item: any) => (
            <div key={item.id} className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-slate-800">
                  {item.quantity}x {item.name_snapshot}
                </div>
                {item.variant_name_snapshot && (
                  <div className="text-[10px] text-slate-500">{item.variant_name_snapshot}</div>
                )}
              </div>
              <span className="font-bold text-slate-900">₹{(item.total_price_paise / 100).toFixed(0)}</span>
            </div>
          ))}
        </div>

        {/* Financial Calculation */}
        <div className="py-4 border-b border-dashed border-slate-300 space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Item Subtotal</span>
            <span>₹{(bill.subtotal_paise / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>GST Tax</span>
            <span>₹{(bill.tax_paise / 100).toFixed(2)}</span>
          </div>
          {bill.service_charge_paise > 0 && (
            <div className="flex justify-between">
              <span>Service Charge</span>
              <span>₹{(bill.service_charge_paise / 100).toFixed(2)}</span>
            </div>
          )}
          {bill.round_off_paise !== 0 && (
            <div className="flex justify-between">
              <span>Round Off</span>
              <span>₹{(bill.round_off_paise / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="pt-2 flex justify-between font-black text-base text-slate-900">
            <span>Grand Total</span>
            <span>₹{(bill.grand_total_paise / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Payments Settled */}
        <div className="py-4 border-b border-dashed border-slate-300 text-xs space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Settlement Record</div>
          {payments.map((p: any) => (
            <div key={p.id} className="flex justify-between items-center text-slate-700">
              <span className="capitalize font-semibold">{p.method.replace('_', ' ')}</span>
              <span className="font-bold text-emerald-600">Paid ₹{(p.amount_paise / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-6 text-center space-y-4">
          <p className="text-[11px] text-slate-400">
            Thank you for dining with {restaurant.name}!
          </p>

          <button
            onClick={() => window.print()}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-2xl text-xs flex items-center justify-center gap-2 print:hidden transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
