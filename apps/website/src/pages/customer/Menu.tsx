import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  ShoppingBag, 
  Clock, 
  Plus, 
  Bell, 
  Check, 
  UtensilsCrossed,
  Sparkles,
  ChevronRight,
  Receipt
} from 'lucide-react';
import { publicApi, customerApi } from '../../services/api.js';
import { MenuCategory, MenuItem } from '../../types/index.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ItemModal } from './ItemModal.js';

export const CustomerMenu: React.FC = () => {
  const navigate = useNavigate();
  const { restaurant } = useTenant();
  const { totalQuantity, grandTotalPaise, tableContext, orderType, setOrderType } = useCart();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non_veg'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Service Call Modal
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [callSuccess, setCallSuccess] = useState<string | null>(null);

  useEffect(() => {
    publicApi.getMenu()
      .then((data) => {
        setCategories(data.categories || []);
        if (data.categories && data.categories.length > 0) {
          setActiveCategoryId(data.categories[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load menu:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleCallWaiter = async (type: string) => {
    if (!tableContext.tableId || !tableContext.sessionId) {
      alert('Service requests are only available for dine-in tables with an active QR session.');
      return;
    }

    try {
      await customerApi.requestService({
        table_id: tableContext.tableId,
        table_session_id: tableContext.sessionId,
        request_type: type
      });
      setIsCallingWaiter(false);
      setCallSuccess(`Staff notified for "${type.toUpperCase()}".`);
      setTimeout(() => setCallSuccess(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to call staff.');
    }
  };

  // Filter items
  const filteredCategories = categories.map((cat) => {
    const items = cat.items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesDietary = dietaryFilter === 'all' || item.dietary_type === dietaryFilter;
      return matchesSearch && matchesDietary;
    });
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-600/10 text-rose-600 flex items-center justify-center animate-pulse mb-3">
          <UtensilsCrossed className="w-6 h-6" />
        </div>
        <div className="text-slate-900 dark:text-white font-semibold text-sm">Loading Menu...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-28">
      {/* Top Navigation & Dynamic Restaurant Identity */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant?.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800" />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
              >
                {restaurant?.name?.charAt(0) || 'R'}
              </div>
            )}
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-900 dark:text-white">
                {restaurant?.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {tableContext.tableNumber ? (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Table {tableContext.tableNumber}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500">
                    Takeaway Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Call Waiter Quick Action */}
            {tableContext.tableId && (
              <button
                onClick={() => setIsCallingWaiter(true)}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
                title="Call staff / Request service"
              >
                <Bell className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Call Staff</span>
              </button>
            )}

            {/* Running Bill Shortcut */}
            {tableContext.sessionId && (
              <button
                onClick={() => navigate('/u/customer/bill')}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
                title="View Table Running Bill"
              >
                <Receipt className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">Bill</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar & Dietary Filter Pills */}
        <div className="max-w-3xl mx-auto px-4 pb-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search dishes, drinks, desserts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800/80 border-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Dietary Filters */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setDietaryFilter('all')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 ${
                dietaryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setDietaryFilter('veg')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 flex items-center gap-1.5 ${
                dietaryFilter === 'veg'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Pure Veg
            </button>
            <button
              onClick={() => setDietaryFilter('non_veg')}
              className={`px-3 py-1.5 rounded-full transition-all shrink-0 flex items-center gap-1.5 ${
                dietaryFilter === 'non_veg'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Non-Veg
            </button>
          </div>
        </div>

        {/* Category Scroll Tabs */}
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-t border-slate-100 dark:border-slate-800/60 pt-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategoryId(cat.id);
                const el = document.getElementById(`cat_${cat.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                activeCategoryId === cat.id
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              style={{
                backgroundColor: activeCategoryId === cat.id ? restaurant?.primary_color || undefined : undefined
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Menu Sections */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {callSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{callSuccess}</span>
          </div>
        )}

        {filteredCategories.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No dishes found matching your search.
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <section key={cat.id} id={`cat_${cat.id}`} className="space-y-4">
              <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {cat.name}
                  <span className="text-xs font-normal text-slate-400">({cat.items.length})</span>
                </h2>
                {cat.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cat.description}</p>
                )}
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex gap-4 transition-all hover:shadow-md ${
                      item.is_available
                        ? 'border-slate-200/80 dark:border-slate-800'
                        : 'border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    {/* Item Text & Pricing */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            item.dietary_type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}></span>
                          <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug">
                            {item.name}
                          </h3>
                        </div>

                        {item.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          <div className="font-black text-sm text-slate-900 dark:text-white">
                            ₹{(item.base_price_paise / 100).toFixed(0)}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{item.preparation_time_minutes}m</span>
                          </div>
                        </div>

                        {/* Add Button */}
                        {item.is_available ? (
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>ADD</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Sold Out
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Image */}
                    {item.image_url && (
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating Bottom Cart Pill */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-bounce-short">
          <button
            onClick={() => navigate('/u/customer/cart')}
            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl p-4 shadow-2xl flex items-center justify-between font-bold text-sm transition-transform active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center text-xs font-black">
                {totalQuantity}
              </div>
              <div className="text-left">
                <div className="text-xs text-slate-300 dark:text-slate-600">Total Bill (approx)</div>
                <div className="text-base font-black">₹{(grandTotalPaise / 100).toFixed(0)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <span>View Cart</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Item Customization Modal */}
      <ItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Call Waiter Modal */}
      {isCallingWaiter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xs w-full p-6 shadow-2xl text-center">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">Call Waiter / Staff</h3>
            <p className="text-xs text-slate-500 mb-4">Table {tableContext.tableNumber}</p>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold mb-4">
              <button
                onClick={() => handleCallWaiter('water')}
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
              >
                💧 Water
              </button>
              <button
                onClick={() => handleCallWaiter('cutlery')}
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
              >
                🍴 Cutlery
              </button>
              <button
                onClick={() => handleCallWaiter('waiter')}
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
              >
                🙋‍♂️ Assistance
              </button>
              <button
                onClick={() => handleCallWaiter('bill')}
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200"
              >
                🧾 Request Bill
              </button>
            </div>

            <button
              onClick={() => setIsCallingWaiter(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
