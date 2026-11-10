import React, { useEffect, useRef, useState } from 'react';
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
  ChevronLeft,
  Receipt
} from 'lucide-react';
import { publicApi, customerApi } from '../../services/api.js';
import { MenuCategory, MenuItem } from '../../types/index.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { ItemModal } from './ItemModal.js';

/* Horizontal swipe row for one category */
const CategoryRow: React.FC<{
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}> = ({ items, onSelect }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [items]);

  const scrollByCard = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 260), behavior: 'smooth' });
  };

  return (
    <div className="relative group/row">
      <div
        ref={rowRef}
        onScroll={updateArrows}
        className="menu-row flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-3 -mx-4"
      >
        {items.map((item) => (
          <article
            key={item.id}
            onClick={() => item.is_available && onSelect(item)}
            className={`snap-start shrink-0 w-[78%] sm:w-[17rem] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out overflow-hidden ${
              item.is_available ? 'cursor-pointer' : 'opacity-70'
            }`}
          >
            {/* Image box */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  loading="lazy"
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out hover:scale-105 ${
                    item.is_available ? '' : 'grayscale'
                  }`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                  <UtensilsCrossed className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                </div>
              )}

              {/* soft bottom fade for price legibility */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />

              {/* Dietary mark */}
              <span
                className={`absolute top-3 left-3 w-5 h-5 rounded-md bg-white/95 flex items-center justify-center border-2 ${
                  item.dietary_type === 'non_veg' ? 'border-rose-500' : 'border-emerald-500'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    item.dietary_type === 'non_veg' ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
              </span>

              {!item.is_available && (
                <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-slate-900/80 text-white text-[10px] font-bold uppercase tracking-wider">
                  Sold Out
                </span>
              )}

              {/* Price tag, bottom-right inside image */}
              <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur shadow-lg text-sm font-black text-slate-900 dark:text-white">
                ₹{(item.base_price_paise / 100).toFixed(0)}
              </div>
            </div>

            {/* Details */}
            <div className="p-4 flex flex-col gap-3">
              <div>
                <h3 className="font-bold text-[15px] text-slate-900 dark:text-white leading-snug line-clamp-1">
                  {item.name}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 min-h-[2.5rem]">
                  {item.description || ' '}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{item.preparation_time_minutes} min</span>
                </div>

                {item.is_available ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Unavailable
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
        <div className="shrink-0 w-1" aria-hidden />
      </div>

      {/* Desktop arrows */}
      {canLeft && (
        <button
          onClick={() => scrollByCard(-1)}
          aria-label="Scroll left"
          className="hidden sm:flex absolute left-1 top-[7rem] -translate-y-1/2 w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 transition-transform"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {canRight && (
        <button
          onClick={() => scrollByCard(1)}
          aria-label="Scroll right"
          className="hidden sm:flex absolute right-1 top-[7rem] -translate-y-1/2 w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg items-center justify-center text-slate-700 dark:text-slate-200 hover:scale-105 transition-transform"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

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

  // Highlight active category tab while scrolling
  useEffect(() => {
    if (isLoading) return;
    const sections = document.querySelectorAll('[data-cat-section]');
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).dataset.catSection;
          if (id) setActiveCategoryId(id);
        }
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isLoading, categories, searchQuery, dietaryFilter]);

  const handleCallWaiter = (type: string) => {
    if (!tableContext.tableId || !tableContext.sessionId) {
      alert('Service requests are only available for dine-in tables with an active QR session.');
      return;
    }

    // Instant feedback; the request is sent in the background
    setIsCallingWaiter(false);
    setCallSuccess(`Staff notified for "${type.toUpperCase()}".`);
    setTimeout(() => setCallSuccess(null), 4000);

    customerApi
      .requestService({
        table_id: tableContext.tableId,
        table_session_id: tableContext.sessionId,
        request_type: type
      })
      .catch((err: any) => {
        setCallSuccess(null);
        alert(err?.message || 'Failed to call staff.');
      });
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
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant?.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
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
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
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
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
                title="View Table Running Bill"
              >
                <Receipt className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">Bill</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar & Dietary Filters (single compact row) */}
        <div className="max-w-3xl mx-auto px-4 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search dishes, drinks, desserts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800/80 border-none rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
            <button
              onClick={() => setDietaryFilter('all')}
              className={`px-3 py-2 rounded-xl transition-all ${
                dietaryFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDietaryFilter('veg')}
              title="Pure Veg"
              aria-label="Pure Veg"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border ${
                dietaryFilter === 'veg'
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${dietaryFilter === 'veg' ? 'bg-white' : 'bg-emerald-500'}`}></span>
            </button>
            <button
              onClick={() => setDietaryFilter('non_veg')}
              title="Non-Veg"
              aria-label="Non-Veg"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border ${
                dietaryFilter === 'non_veg'
                  ? 'bg-rose-600 border-rose-600'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${dietaryFilter === 'non_veg' ? 'bg-white' : 'bg-rose-500'}`}></span>
            </button>
          </div>
        </div>

        {/* Category Scroll Tabs */}
        <div className="max-w-3xl mx-auto px-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-t border-slate-100 dark:border-slate-800/60 pt-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategoryId(cat.id);
                const el = document.getElementById(`cat_${cat.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
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
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-10">
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
            <section
              key={cat.id}
              id={`cat_${cat.id}`}
              data-cat-section={cat.id}
              className="space-y-4 scroll-mt-36"
            >
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {cat.name}
                  </h2>
                  {cat.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cat.description}</p>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-slate-400 shrink-0 ml-3">
                  {cat.items.length} {cat.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <CategoryRow items={cat.items} onSelect={setSelectedItem} />
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
