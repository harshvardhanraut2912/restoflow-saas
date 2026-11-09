import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, MenuItem, MenuItemModifier, MenuItemVariant } from '../types/index.js';
import { useTenant } from './TenantContext.js';

interface TableContext {
  tableId: string | null;
  tableNumber: string | null;
  sessionId: string | null;
}

interface CartContextType {
  items: CartItem[];
  orderType: 'dine_in' | 'takeaway';
  tableContext: TableContext;
  subtotalPaise: number;
  taxPaise: number;
  packagingChargePaise: number;
  grandTotalPaise: number;
  totalQuantity: number;
  addToCart: (item: MenuItem, variant?: MenuItemVariant, modifiers?: MenuItemModifier[]) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  setOrderType: (type: 'dine_in' | 'takeaway') => void;
  setTableContext: (ctx: TableContext) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useTenant();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('smartresto_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [tableContext, setTableContext] = useState<TableContext>(() => {
    try {
      const saved = sessionStorage.getItem('smartresto_table_ctx');
      return saved ? JSON.parse(saved) : { tableId: null, tableNumber: null, sessionId: null };
    } catch {
      return { tableId: null, tableNumber: null, sessionId: null };
    }
  });

  // Persist to session storage
  useEffect(() => {
    sessionStorage.setItem('smartresto_cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    sessionStorage.setItem('smartresto_table_ctx', JSON.stringify(tableContext));
  }, [tableContext]);

  const addToCart = (menuItem: MenuItem, variant?: MenuItemVariant, modifiers: MenuItemModifier[] = []) => {
    const unitPricePaise = (variant ? variant.price_paise : menuItem.base_price_paise) +
      modifiers.reduce((sum, m) => sum + m.price_paise, 0);

    // Modifier hash to combine duplicate items with exact same options
    const modKey = modifiers.map((m) => m.id).sort().join('_');
    const existingIndex = items.findIndex(
      (c) =>
        c.menuItem.id === menuItem.id &&
        c.selectedVariant?.id === variant?.id &&
        c.selectedModifiers.map((m) => m.id).sort().join('_') === modKey
    );

    if (existingIndex > -1) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].totalPricePaise = updated[existingIndex].quantity * updated[existingIndex].unitPricePaise;
      setItems(updated);
    } else {
      const newItem: CartItem = {
        id: `${menuItem.id}_${variant?.id || 'base'}_${modKey}_${Date.now()}`,
        menuItem,
        selectedVariant: variant,
        selectedModifiers: modifiers,
        quantity: 1,
        unitPricePaise,
        totalPricePaise: unitPricePaise
      };
      setItems([...items, newItem]);
    }
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setItems((prev) => {
      return prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalPricePaise: newQty * item.unitPricePaise
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const subtotalPaise = items.reduce((sum, item) => sum + item.totalPricePaise, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const taxRate = settings?.tax_rate_percent || 5.0;
  const taxPaise = Math.round(subtotalPaise * (taxRate / 100));
  const packagingChargePaise = orderType === 'takeaway' ? (settings?.packaging_charge_paise || 0) : 0;
  const grandTotalPaise = subtotalPaise + taxPaise + packagingChargePaise;

  return (
    <CartContext.Provider
      value={{
        items,
        orderType,
        tableContext,
        subtotalPaise,
        taxPaise,
        packagingChargePaise,
        grandTotalPaise,
        totalQuantity,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        setOrderType,
        setTableContext
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
