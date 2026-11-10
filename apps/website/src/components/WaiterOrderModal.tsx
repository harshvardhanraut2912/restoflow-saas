import React, { useMemo, useState } from 'react';
import { X, Plus, Minus, Search, Trash2, Send, RefreshCw, ChefHat } from 'lucide-react';
import { waiterApi } from '../services/api.js';
import { MenuCategory, MenuItem, MenuItemVariant, MenuItemModifier, MenuItemModifierGroup } from '../types/index.js';

interface PosLine {
  key: string;
  menuItem: MenuItem;
  variant?: MenuItemVariant;
  modifiers: MenuItemModifier[];
  quantity: number;
  unitPricePaise: number;
}

interface WaiterOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableLabel: string;
  sessionId: string | null;
  categories: MenuCategory[];
  isMenuLoading: boolean;
  onReloadMenu: () => void;
  /** Current running bill (incl. tax) of the table, if it already has orders */
  runningTotalPaise?: number | null;
  onPlaced: (result: any) => void;
}

const rupees = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

const needsOptions = (item: MenuItem) =>
  (item.variants && item.variants.length > 0) ||
  (item.modifier_groups || []).some((g) => g.modifiers.length > 0);

const minRequired = (g: MenuItemModifierGroup) =>
  Math.max(g.min_selection || 0, g.is_required ? 1 : 0);

const maxAllowed = (g: MenuItemModifierGroup) => (g.max_selection && g.max_selection > 0 ? g.max_selection : Infinity);

export const WaiterOrderModal: React.FC<WaiterOrderModalProps> = ({
  isOpen,
  onClose,
  tableId,
  tableLabel,
  sessionId,
  categories,
  isMenuLoading,
  onReloadMenu,
  runningTotalPaise,
  onPlaced
}) => {
  const [lines, setLines] = useState<PosLine[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options sheet (variant / modifiers / quantity) for the dish being configured
  const [cfgItem, setCfgItem] = useState<MenuItem | null>(null);
  const [cfgVariantId, setCfgVariantId] = useState<string | null>(null);
  const [cfgMods, setCfgMods] = useState<Record<string, string[]>>({});
  const [cfgQty, setCfgQty] = useState(1);

  const subtotalPaise = useMemo(() => lines.reduce((s, l) => s + l.unitPricePaise * l.quantity, 0), [lines]);
  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => activeCat === 'all' || c.id === activeCat)
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) => !q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
        )
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, search, activeCat]);

  if (!isOpen) return null;

  const addLine = (item: MenuItem, variant: MenuItemVariant | undefined, modifiers: MenuItemModifier[], qty: number) => {
    const unit = (variant ? variant.price_paise : item.base_price_paise) + modifiers.reduce((s, m) => s + m.price_paise, 0);
    const key = `${item.id}|${variant?.id || ''}|${modifiers.map((m) => m.id).sort().join(',')}`;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: Math.min(50, copy[idx].quantity + qty) };
        return copy;
      }
      return [...prev, { key, menuItem: item, variant, modifiers, quantity: Math.min(50, qty), unitPricePaise: unit }];
    });
  };

  const handleTapItem = (item: MenuItem) => {
    if (!item.is_available) return;
    if (!needsOptions(item)) {
      addLine(item, undefined, [], 1);
      return;
    }
    // Open the options sheet with the same defaults the customer menu uses
    setCfgItem(item);
    setCfgVariantId(item.variants && item.variants.length > 0 ? item.variants[0].id : null);
    const initial: Record<string, string[]> = {};
    for (const g of item.modifier_groups || []) {
      if (g.is_required && g.modifiers.length > 0 && maxAllowed(g) === 1) initial[g.id] = [g.modifiers[0].id];
    }
    setCfgMods(initial);
    setCfgQty(1);
  };

  const toggleModifier = (g: MenuItemModifierGroup, modId: string) => {
    setCfgMods((prev) => {
      const current = prev[g.id] || [];
      if (maxAllowed(g) === 1) return { ...prev, [g.id]: [modId] };
      if (current.includes(modId)) return { ...prev, [g.id]: current.filter((id) => id !== modId) };
      if (current.length >= maxAllowed(g)) return prev;
      return { ...prev, [g.id]: [...current, modId] };
    });
  };

  const cfgVariant = cfgItem?.variants?.find((v) => v.id === cfgVariantId);
  const cfgSelectedModifiers: MenuItemModifier[] = cfgItem
    ? (cfgItem.modifier_groups || []).flatMap((g) => g.modifiers.filter((m) => (cfgMods[g.id] || []).includes(m.id)))
    : [];
  const cfgMissingGroup = cfgItem
    ? (cfgItem.modifier_groups || []).find((g) => g.modifiers.length > 0 && (cfgMods[g.id] || []).length < Math.min(minRequired(g), g.modifiers.length))
    : undefined;
  const cfgUnit = cfgItem
    ? (cfgVariant ? cfgVariant.price_paise : cfgItem.base_price_paise) + cfgSelectedModifiers.reduce((s, m) => s + m.price_paise, 0)
    : 0;

  const confirmConfig = () => {
    if (!cfgItem || cfgMissingGroup) return;
    addLine(cfgItem, cfgVariant, cfgSelectedModifiers, cfgQty);
    setCfgItem(null);
  };

  const changeQty = (key: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const handleClose = () => {
    if (isSubmitting) return;
    setCfgItem(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (lines.length === 0 || isSubmitting) return;
    setError(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 10) {
      setError('Guest mobile must be 10 digits (or leave it blank).');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await waiterApi.createOrder({
        order_type: 'dine_in',
        table_id: tableId,
        table_session_id: sessionId || undefined,
        phone: digits ? `+91${digits}` : undefined,
        customer_name: guestName.trim() || undefined,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
          menu_item_id: l.menuItem.id,
          variant_id: l.variant?.id || null,
          quantity: l.quantity,
          modifier_ids: l.modifiers.map((m) => m.id)
        }))
      });

      setLines([]);
      setNotes('');
      setPhone('');
      setGuestName('');
      setSearch('');
      setActiveCat('all');
      onPlaced(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to place order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl h-[90vh] max-h-[760px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Items to Table {tableLabel}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Goes to the kitchen and the table&apos;s bill exactly like a customer&apos;s QR order.
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-5">
          {/* MENU */}
          <div className="md:col-span-3 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
            <div className="p-3 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dishes..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[{ id: 'all', name: 'All' }, ...categories.map((c) => ({ id: c.id, name: c.name }))].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                      activeCat === c.id
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
              {categories.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 space-y-3">
                  {isMenuLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Loading menu...
                    </div>
                  ) : (
                    <>
                      <div>No menu items found.</div>
                      <button onClick={onReloadMenu} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold">
                        Retry
                      </button>
                    </>
                  )}
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">No dishes match your search.</div>
              ) : (
                visibleCategories.map((cat) => (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{cat.name}</div>
                    {cat.items.map((item) => {
                      const inBasket = lines.filter((l) => l.menuItem.id === item.id).reduce((s, l) => s + l.quantity, 0);
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleTapItem(item)}
                          disabled={!item.is_available}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                            item.is_available
                              ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-500'
                              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span
                                className={`inline-block w-2 h-2 rounded-full shrink-0 ${item.dietary_type === 'veg' || item.dietary_type === 'vegan' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              />
                              {item.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {!item.is_available
                                ? 'Sold out'
                                : needsOptions(item)
                                  ? 'Choose options'
                                  : 'Tap to add'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {inBasket > 0 && (
                              <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                                {inBasket}
                              </span>
                            )}
                            <span className="font-bold text-rose-500 dark:text-rose-400">
                              {item.variants && item.variants.length > 0 ? 'from ' : ''}
                              {rupees(item.variants && item.variants.length > 0 ? Math.min(...item.variants.map((v) => v.price_paise)) : item.base_price_paise)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* BASKET */}
          <div className="md:col-span-2 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
            <div className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
              Order Basket {totalQty > 0 && `(${totalQty})`}
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2">
              {lines.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-600">Tap dishes to add</div>
              ) : (
                lines.map((l) => (
                  <div key={l.key} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white">{l.menuItem.name}</div>
                        {(l.variant || l.modifiers.length > 0) && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {[l.variant?.name, ...l.modifiers.map((m) => m.name)].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white shrink-0">{rupees(l.unitPricePaise * l.quantity)}</div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg">
                        <button onClick={() => changeQty(l.key, -1)} className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-l-lg">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center font-bold text-slate-900 dark:text-white">{l.quantity}</span>
                        <button onClick={() => changeQty(l.key, 1)} className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-r-lg">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button onClick={() => removeLine(l.key)} className="text-rose-500 hover:text-rose-600 p-1" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Kitchen notes (e.g. less spicy, no onion)"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Guest mobile (optional)"
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <input
                  type="text"
                  maxLength={80}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name (optional)"
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-medium">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">This order (before GST)</span>
                <span className="font-black text-base text-slate-900 dark:text-white">{rupees(subtotalPaise)}</span>
              </div>
              {typeof runningTotalPaise === 'number' && runningTotalPaise > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                  Added to this table&apos;s running bill (currently ₹{(runningTotalPaise / 100).toFixed(2)}).
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isSubmitting || lines.length === 0}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Send to Kitchen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* OPTIONS SHEET */}
        {cfgItem && (
          <div className="absolute inset-0 bg-black/50 flex items-end sm:items-center justify-center z-10">
            <div className="bg-white dark:bg-slate-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85%] flex flex-col">
              <div className="flex items-start justify-between p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ChefHat className="w-4 h-4 text-rose-500" />
                    {cfgItem.name}
                  </div>
                  {cfgItem.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{cfgItem.description}</p>}
                </div>
                <button onClick={() => setCfgItem(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {cfgItem.variants && cfgItem.variants.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Portion / Size</div>
                    <div className="space-y-1.5">
                      {cfgItem.variants.map((v) => (
                        <label
                          key={v.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                            cfgVariantId === v.id
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input type="radio" name="pos-variant" checked={cfgVariantId === v.id} onChange={() => setCfgVariantId(v.id)} />
                            {v.name}
                          </span>
                          <span>{rupees(v.price_paise)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {(cfgItem.modifier_groups || [])
                  .filter((g) => g.modifiers.length > 0)
                  .map((g) => {
                    const single = maxAllowed(g) === 1;
                    return (
                      <div key={g.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{g.name}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                            {minRequired(g) > 0 ? 'Required' : single ? '' : `Up to ${Number.isFinite(maxAllowed(g)) ? maxAllowed(g) : 'any'}`}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {g.modifiers.map((m) => {
                            const checked = (cfgMods[g.id] || []).includes(m.id);
                            return (
                              <label
                                key={m.id}
                                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                                  checked
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type={single ? 'radio' : 'checkbox'}
                                    name={`pos-mod-${g.id}`}
                                    checked={checked}
                                    onChange={() => toggleModifier(g, m.id)}
                                  />
                                  {m.name}
                                </span>
                                <span>{m.price_paise > 0 ? `+${rupees(m.price_paise)}` : 'Free'}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl">
                  <button onClick={() => setCfgQty((q) => Math.max(1, q - 1))} className="w-8 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center text-xs font-bold text-slate-900 dark:text-white">{cfgQty}</span>
                  <button onClick={() => setCfgQty((q) => Math.min(50, q + 1))} className="w-8 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  onClick={confirmConfig}
                  disabled={!!cfgMissingGroup}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-between px-4 disabled:opacity-50"
                >
                  <span>{cfgMissingGroup ? `Select ${cfgMissingGroup.name}` : 'Add to Order'}</span>
                  <span>{rupees(cfgUnit * cfgQty)}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
