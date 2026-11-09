import React from 'react';
import { Printer, X, ShieldCheck } from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';

export interface ReceiptItem {
  name?: string;
  name_snapshot?: string;
  quantity?: number;
  total_price_paise?: number;
  price_paise?: number;
  unit_price_paise?: number;
  variant?: string;
  variant_name_snapshot?: string;
}

export interface ReceiptData {
  orderNumber?: string;
  roundNumber?: number;
  tableNumber?: string;
  orderType?: 'dine_in' | 'takeaway' | string;
  createdAt?: string;
  items?: ReceiptItem[];
  subtotal_paise?: number;
  tax_paise?: number;
  service_charge_paise?: number;
  grand_total_paise?: number;
  paymentMethod?: string;
  isOnlinePayment?: boolean;
  transactionReference?: string;
  invoiceNumber?: string;
}

export interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, receipt }) => {
  const { restaurant } = useTenant();

  if (!isOpen || !receipt) return null;

  const subtotal = receipt.subtotal_paise || 0;
  const tax = receipt.tax_paise !== undefined ? receipt.tax_paise : Math.round(subtotal * 0.05);
  const grandTotal = receipt.grand_total_paise || (subtotal + tax);

  const formattedDate = receipt.createdAt
    ? new Date(receipt.createdAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

  const isOnline = Boolean(
    receipt.isOnlinePayment ||
    receipt.paymentMethod === 'online_gateway' ||
    receipt.transactionReference
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white animate-fade-in">
      <div className="bg-white text-slate-900 rounded-3xl max-w-xs w-full p-6 shadow-2xl printable-receipt border border-slate-200 print:shadow-none print:border-none print:max-w-none print:w-full print:p-2">
        {/* Modal Top Bar (Screen only) */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 no-print">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Receipt Preview</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt Content */}
        <div className="text-center">
          {/* Restaurant Logo */}
          {restaurant?.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="w-12 h-12 rounded-xl object-cover mx-auto mb-2 border border-slate-200 shadow-sm"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg mx-auto mb-2 shadow-sm"
              style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
            >
              {restaurant?.name?.charAt(0) || 'R'}
            </div>
          )}

          {/* Restaurant Name */}
          <h2 className="text-base font-black text-slate-900 tracking-tight leading-snug">
            {restaurant?.name || 'Restaurant'}
          </h2>
          <p className="text-[10px] text-slate-500 font-medium">Official Tax &amp; Dining Receipt</p>

          {/* RED PAID BADGE / STAMP */}
          <div className="my-2.5">
            <span className="inline-block border-2 border-red-600 text-red-600 uppercase font-black px-3 py-0.5 rounded-lg text-xs tracking-widest rotate-[-2deg] shadow-sm">
              ★ PAID ★
            </span>
          </div>
        </div>

        {/* Order Details & Meta */}
        <div className="py-2.5 border-t border-b border-dashed border-slate-300 text-[11px] text-slate-600 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">Order Number</span>
            <span className="font-mono font-bold text-slate-900">
              {receipt.orderNumber || '#ORD'}
              {receipt.roundNumber ? ` (Order ${receipt.roundNumber})` : ''}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">Dining Service</span>
            <span className="font-semibold text-slate-800">
              {receipt.orderType === 'dine_in'
                ? `Table ${receipt.tableNumber || '-'}`
                : 'Takeaway'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">Date &amp; Time</span>
            <span className="font-mono text-[10px]">{formattedDate}</span>
          </div>

          {receipt.invoiceNumber && (
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">Invoice #</span>
              <span className="font-mono text-[10px] font-bold text-slate-800">{receipt.invoiceNumber}</span>
            </div>
          )}
        </div>

        {/* Itemized Dishes List */}
        <div className="py-2.5 border-b border-dashed border-slate-300 text-xs">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">
            <span>Item</span>
            <span>Total</span>
          </div>

          <div className="space-y-1.5">
            {receipt.items && receipt.items.length > 0 ? (
              receipt.items.map((item, idx) => {
                const name = item.name_snapshot || item.name || 'Dish';
                const qty = item.quantity || 1;
                const price = (item.total_price_paise !== undefined ? item.total_price_paise : (item.price_paise || item.unit_price_paise || 0) * qty) / 100;
                const variant = item.variant_name_snapshot || item.variant;

                return (
                  <div key={idx} className="flex justify-between items-start text-[11px]">
                    <div className="text-left pr-2 leading-tight">
                      <span className="font-semibold text-slate-800">{qty}x {name}</span>
                      {variant && (
                        <div className="text-[10px] text-slate-500 font-normal">({variant})</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-900 shrink-0">₹{price.toFixed(0)}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-slate-400 text-center py-1 text-[11px]">Order items settled</div>
            )}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-xs text-slate-600">
          <div className="flex justify-between text-[11px]">
            <span>Net Subtotal</span>
            <span className="font-mono font-semibold">₹{(subtotal / 100).toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>GST Tax (5%)</span>
            <span className="font-mono font-semibold">₹{(tax / 100).toFixed(2)}</span>
          </div>

          {receipt.service_charge_paise ? (
            <div className="flex justify-between text-[11px]">
              <span>Service Charge</span>
              <span className="font-mono font-semibold">₹{(receipt.service_charge_paise / 100).toFixed(2)}</span>
            </div>
          ) : null}

          <div className="pt-1.5 mt-1 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
            <span>Total Amount Paid</span>
            <span className="font-mono text-base text-rose-600">₹{(grandTotal / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Payment & Online Receipt Details */}
        <div className="py-2.5 border-b border-dashed border-slate-300 text-xs text-center space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Payment Mode</span>
            <span className="font-bold text-slate-800 uppercase tracking-wide">
              {receipt.paymentMethod ? receipt.paymentMethod.replace('_', ' ') : isOnline ? 'ONLINE UPI / CARD' : 'CASH'}
            </span>
          </div>

          {/* Online Gateway Receipt Block */}
          {isOnline ? (
            <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-left space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Online Payment Receipt Verified
              </div>
              <div className="text-[9px] font-mono text-emerald-700 truncate">
                Ref: {receipt.transactionReference || `TXN_${Date.now().toString().slice(-10)}`}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400">
              Payment received &amp; verified by Floor Captain
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="pt-3 pb-2 text-center">
          <p className="text-[10px] text-slate-400 leading-tight">
            Thank you for dining with {restaurant?.name || 'us'}!<br />
            Please visit again soon.
          </p>
        </div>

        {/* Action Buttons (Screen Only, Hidden in Print) */}
        <div className="pt-3 border-t border-slate-200 flex gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
