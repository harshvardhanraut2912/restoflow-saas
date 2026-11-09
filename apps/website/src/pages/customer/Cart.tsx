import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight, 
  Utensils, 
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Users
} from 'lucide-react';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { publicApi } from '../../services/api.js';

export const CustomerCart: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant, settings } = useTenant();
  const {
    items,
    orderType,
    setOrderType,
    tableContext,
    setTableContext,
    subtotalPaise,
    taxPaise,
    packagingChargePaise,
    grandTotalPaise,
    updateQuantity,
    removeFromCart,
    clearCart
  } = useCart();

  const [tables, setTables] = useState<any[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingTables(true);
    publicApi.getTables()
      .then((res) => {
        setTables(res.tables || []);
      })
      .catch((err) => {
        console.error('Failed to load tables:', err);
      })
      .finally(() => {
        setIsLoadingTables(false);
      });
  }, []);

  // If tableNumber was already set from QR scan, sync tableId automatically
  useEffect(() => {
    if (tables.length > 0 && tableContext.tableNumber && !tableContext.tableId) {
      const match = tables.find(
        (t) =>
          t.table_number === tableContext.tableNumber ||
          t.table_number === `T-${String(tableContext.tableNumber).padStart(2, '0')}` ||
          `T-${String(t.table_number).padStart(2, '0')}` === tableContext.tableNumber
      );
      if (match) {
        setTableContext({
          tableId: match.id,
          tableNumber: match.table_number,
          sessionId: tableContext.sessionId
        });
      }
    }
  }, [tables, tableContext.tableNumber, tableContext.tableId]);

  // Instant 0ms table selection (zero lag, non-blocking)
  const handleSelectTable = (t: any) => {
    setTableError(null);

    // 1. Instant client update (0 milliseconds!)
    setTableContext({
      tableId: t.id,
      tableNumber: t.table_number,
      sessionId: tableContext.sessionId
    });
    setOrderType('dine_in');

    // 2. Silent background sync without delaying the user
    publicApi.resolveQr(t.table_number)
      .then((res) => {
        if (res?.session?.id) {
          setTableContext({
            tableId: res.table.id,
            tableNumber: res.table.table_number,
            sessionId: res.session.id
          });
        }
      })
      .catch((err) => {
        console.debug('Background table sync:', err);
      });
  };

  const handleProceedToCheckout = () => {
    if (orderType === 'dine_in' && !tableContext.tableId) {
      setTableError('Please choose your seated table below before proceeding to checkout.');
      const el = document.getElementById('table-selector-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    navigate('/u/customer/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Your cart is empty</h2>
        <p className="text-xs text-slate-500 mb-6">Explore our menu and add your favorite dishes</p>
        <button
          onClick={() => navigate('/u/customer/menu')}
          className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-xl text-sm transition-all"
          style={{ backgroundColor: restaurant?.primary_color || undefined }}
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-32">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Menu
          </button>
          <h1 className="font-bold text-sm">Your Order Summary</h1>
          <button
            onClick={clearCart}
            className="text-rose-600 dark:text-rose-400 text-xs font-semibold"
          >
            Clear
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Dining Mode Selector */}
        <div className="bg-slate-200/60 dark:bg-slate-800/60 p-1 rounded-2xl flex text-xs font-bold">
          <button
            onClick={() => setOrderType('dine_in')}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
              orderType === 'dine_in'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Dine-In {tableContext.tableNumber ? `(Table ${tableContext.tableNumber})` : ''}</span>
          </button>
          <button
            onClick={() => setOrderType('takeaway')}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
              orderType === 'takeaway'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>
        </div>

        {/* TABLE SELECTOR SECTION (For Dine-In Orders) */}
        {orderType === 'dine_in' && (
          <div
            id="table-selector-section"
            className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm space-y-4 transition-all ${
              !tableContext.tableId
                ? 'border-rose-300 dark:border-rose-900/60 ring-2 ring-rose-500/20'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    tableContext.tableId
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 animate-pulse'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    {tableContext.tableId
                      ? `Seated at Table ${tableContext.tableNumber}`
                      : 'Choose Your Dining Table'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {tableContext.tableId
                      ? 'Your table is highlighted below. Tap another table to switch.'
                      : 'Tap which table you are seated at to link your order:'}
                  </p>
                </div>
              </div>

              {tableContext.tableId && (
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  Table {tableContext.tableNumber}
                </span>
              )}
            </div>

            {/* Validation Notice Banner */}
            {tableError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 animate-bounce-short">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{tableError}</span>
              </div>
            )}

            {/* Tables Grid */}
            {isLoadingTables ? (
              <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                <span>Loading restaurant tables...</span>
              </div>
            ) : tables.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No active tables found for this restaurant.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {tables.map((t) => {
                  const rawCtx = (tableContext.tableNumber || '').replace(/\D/g, '');
                  const rawT = (t.table_number || '').replace(/\D/g, '');
                  const isSelected =
                    tableContext.tableId === t.id ||
                    tableContext.tableNumber === t.table_number ||
                    (rawCtx && rawT && rawCtx === rawT);
                  const isOccupied = t.status === 'occupied' && !isSelected;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTable(t)}
                      className={`relative p-3 rounded-2xl text-center transition-all flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'border-2 border-emerald-500 bg-emerald-50/95 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 shadow-md ring-4 ring-emerald-500/20 scale-[1.03]'
                          : 'border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 active:scale-95'
                      }`}
                    >
                      {/* Top Highlight Badge */}
                      {isSelected && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-sm flex items-center gap-0.5 whitespace-nowrap">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Your Table
                        </span>
                      )}

                      <div className="mt-1">
                        <span
                          className={`text-sm sm:text-base font-black ${
                            isSelected
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {t.table_number.startsWith('T-') ? t.table_number : `Table ${t.table_number}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                        <Users className="w-3 h-3" />
                        <span>{t.capacity || 4} Seats</span>
                      </div>

                      {isOccupied && (
                        <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md">
                          Occupied
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Cart Line Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    item.menuItem.dietary_type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}></span>
                  <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                    {item.menuItem.name}
                  </div>
                </div>

                {item.selectedVariant && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Portion: {item.selectedVariant.name}
                  </div>
                )}

                {item.selectedModifiers.length > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Modifiers: {item.selectedModifiers.map((m) => m.name).join(', ')}
                  </div>
                )}

                <div className="text-xs font-bold text-slate-900 dark:text-white pt-1">
                  ₹{(item.totalPricePaise / 100).toFixed(0)}
                </div>
              </div>

              {/* Quantity Changer */}
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-1 shrink-0">
                <button
                  onClick={() => updateQuantity(item.id, -1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {item.quantity === 1 ? <Trash2 className="w-3.5 h-3.5 text-rose-500" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
                <span className="w-7 text-center text-xs font-bold">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, 1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bill Breakdown Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3 text-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Bill Breakdown</div>
          
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Item Subtotal</span>
            <span>₹{(subtotalPaise / 100).toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>GST ({settings?.tax_rate_percent || 5}%)</span>
            <span>₹{(taxPaise / 100).toFixed(2)}</span>
          </div>

          {orderType === 'takeaway' && packagingChargePaise > 0 && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Packaging Charges</span>
              <span>₹{(packagingChargePaise / 100).toFixed(2)}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between font-black text-sm text-slate-900 dark:text-white">
            <span>To Pay (approx)</span>
            <span>₹{(grandTotalPaise / 100).toFixed(2)}</span>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Checkout Trigger */}
      <div className="fixed bottom-4 left-4 right-4 z-40 max-w-xl mx-auto">
        <button
          onClick={handleProceedToCheckout}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white rounded-2xl p-4 shadow-xl shadow-rose-900/30 flex items-center justify-between font-bold text-sm transition-transform active:scale-98"
          style={{ backgroundColor: restaurant?.primary_color || undefined }}
        >
          <div>
            <div className="text-xs text-rose-100">Step 2: Customer Mobile</div>
            <div className="text-base font-black">₹{(grandTotalPaise / 100).toFixed(0)}</div>
          </div>
          <div className="flex items-center gap-1">
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
};
