import React, { useState } from 'react';
import { X, Clock, Plus, Minus } from 'lucide-react';
import { MenuItem, MenuItemVariant, MenuItemModifier } from '../../types/index.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';

interface ItemModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({ item, onClose }) => {
  const { addToCart } = useCart();
  const { restaurant } = useTenant();

  if (!item) return null;

  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | undefined>(
    item.variants && item.variants.length > 0 ? item.variants[0] : undefined
  );
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, MenuItemModifier>>(() => {
    const initial: Record<string, MenuItemModifier> = {};
    if (item.modifier_groups) {
      for (const group of item.modifier_groups) {
        if (group.is_required && group.modifiers.length > 0) {
          initial[group.id] = group.modifiers[0];
        }
      }
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);

  // Compute live price
  const basePrice = selectedVariant ? selectedVariant.price_paise : item.base_price_paise;
  const modsPrice = Object.values(selectedModifiers).reduce((sum, m) => sum + m.price_paise, 0);
  const unitPricePaise = basePrice + modsPrice;
  const totalPricePaise = unitPricePaise * quantity;

  const handleModifierToggle = (groupId: string, modifier: MenuItemModifier, isRadio: boolean) => {
    if (isRadio) {
      setSelectedModifiers({ ...selectedModifiers, [groupId]: modifier });
    } else {
      const copy = { ...selectedModifiers };
      if (copy[modifier.id]) {
        delete copy[modifier.id];
      } else {
        copy[modifier.id] = modifier;
      }
      setSelectedModifiers(copy);
    }
  };

  const handleAdd = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(item, selectedVariant, Object.values(selectedModifiers));
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header Image */}
        <div className="relative h-48 sm:h-52 bg-slate-100 dark:bg-slate-800 shrink-0">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">
              {item.name}
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Dietary Tag */}
          <div className="absolute bottom-4 left-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-md ${
              item.dietary_type === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              {item.dietary_type.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{item.name}</h2>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                ₹{(unitPricePaise / 100).toFixed(0)}
              </div>
            </div>

            {item.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {item.description}
              </p>
            )}

            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Avg. prep time: {item.preparation_time_minutes} mins</span>
            </div>
          </div>

          {/* Variants Selector */}
          {item.variants && item.variants.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Choose Portion / Size
              </div>
              <div className="space-y-2">
                {item.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      selectedVariant?.id === v.id
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="variant"
                        checked={selectedVariant?.id === v.id}
                        onChange={() => setSelectedVariant(v)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span>{v.name}</span>
                    </div>
                    <span>₹{(v.price_paise / 100).toFixed(0)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Modifier Groups */}
          {item.modifier_groups && item.modifier_groups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {group.name}
                </span>
                {group.is_required && (
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Required</span>
                )}
              </div>

              <div className="space-y-2">
                {group.modifiers.map((mod) => {
                  const isChecked = selectedModifiers[group.id]?.id === mod.id || !!selectedModifiers[mod.id];
                  return (
                    <label
                      key={mod.id}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        isChecked
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type={group.max_selection === 1 ? 'radio' : 'checkbox'}
                          name={`mod_${group.id}`}
                          checked={isChecked}
                          onChange={() => handleModifierToggle(group.id, mod, group.max_selection === 1)}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span>{mod.name}</span>
                      </div>
                      {mod.price_paise > 0 ? (
                        <span>+₹{(mod.price_paise / 100).toFixed(0)}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">Free</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Actions Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center gap-4 shrink-0">
          {/* Quantity Controls */}
          <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 p-1">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-bold text-slate-900 dark:text-white">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to Cart Button */}
          <button
            onClick={handleAdd}
            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-rose-900/30 flex items-center justify-between"
            style={{ backgroundColor: restaurant?.primary_color || undefined }}
          >
            <span>Add to Order</span>
            <span>₹{(totalPricePaise / 100).toFixed(0)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
