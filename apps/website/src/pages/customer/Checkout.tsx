import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, User, FileText, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { customerApi } from '../../services/api.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';

export const CustomerCheckout: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant, settings } = useTenant();
  const {
    items,
    orderType,
    tableContext,
    subtotalPaise,
    taxPaise,
    packagingChargePaise,
    grandTotalPaise,
    clearCart
  } = useCart();

  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    navigate('/u/customer/menu');
    return null;
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate phone: 10 digits
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (orderType === 'dine_in' && !tableContext.tableId) {
      setError('Please select your dining table before placing a dine-in order.');
      navigate('/u/customer/cart');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        order_type: orderType,
        table_id: orderType === 'dine_in' ? tableContext.tableId : null,
        table_session_id: orderType === 'dine_in' ? tableContext.sessionId : null,
        phone: `+91${cleanDigits.slice(-10)}`,
        customer_name: customerName.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          menu_item_id: item.menuItem.id,
          variant_id: item.selectedVariant?.id || null,
          quantity: item.quantity,
          modifier_ids: item.selectedModifiers.map((m) => m.id)
        }))
      };

      const res = await customerApi.checkout(payload);

      // Trigger celebratory confetti
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });

      // Clear cart
      clearCart();

      // Navigate to order tracking
      navigate(`/u/customer/order/${res.order_id}?token=${res.access_token}`);
    } catch (err: any) {
      setError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/u/customer/cart')}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Cart
          </button>
          <h1 className="font-bold text-sm">Customer Details & Confirm</h1>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handlePlaceOrder} className="space-y-5">
          {/* Mobile Number (Mandatory) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Mobile Number *
              </label>
              <span className="text-[10px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full">
                Required for Order Tracking & Loyalty
              </span>
            </div>

            <div className="flex items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 overflow-hidden focus-within:ring-2 focus-within:ring-rose-500">
              <div className="px-3.5 py-3 text-xs font-bold text-slate-500 border-r border-slate-200 dark:border-slate-700">
                🇮🇳 +91
              </div>
              <input
                type="tel"
                required
                maxLength={10}
                placeholder="Enter 10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-transparent border-none px-3.5 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Earn 1 loyalty point for every ₹1 eligible spend on this number.
            </p>
          </div>

          {/* Customer Name & Notes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Your Name (Optional)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Kitchen Instructions (Optional)
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <textarea
                  rows={2}
                  placeholder="e.g. Make less spicy, extra green chutney..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-rose-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Order Snapshot Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>Ordering Mode</span>
              {orderType === 'dine_in' ? (
                tableContext.tableNumber ? (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Table {tableContext.tableNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('/u/customer/cart')}
                      className="text-[10px] text-rose-600 dark:text-rose-400 font-bold hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/u/customer/cart')}
                    className="text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800"
                  >
                    ⚠️ Choose Table ↗
                  </button>
                )
              ) : (
                <span className="font-bold text-slate-900 dark:text-white">Takeaway</span>
              )}
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Items Total</span>
              <span>₹{(subtotalPaise / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>GST & Charges</span>
              <span>₹{((taxPaise + packagingChargePaise) / 100).toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between font-black text-sm text-slate-900 dark:text-white">
              <span>Payable Amount</span>
              <span>₹{(grandTotalPaise / 100).toFixed(2)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || phone.replace(/\D/g, '').length < 10}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-xl shadow-rose-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: restaurant?.primary_color || undefined }}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Transmitting to Kitchen...
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                Confirm & Place Order (₹{(grandTotalPaise / 100).toFixed(0)})
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
};
