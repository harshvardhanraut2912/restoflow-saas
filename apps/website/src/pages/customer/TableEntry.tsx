import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Utensils, CheckCircle, AlertCircle, ArrowRight, Clock, Users } from 'lucide-react';
import { publicApi } from '../../services/api.js';
import { useCart } from '../../context/CartContext.js';
import { useTenant } from '../../context/TenantContext.js';

export const TableEntry: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('t') || searchParams.get('table');
  const { setTableContext, setOrderType } = useCart();
  const { restaurant } = useTenant();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError('No QR token found in link. Please re-scan your table QR code.');
      setIsLoading(false);
      return;
    }

    publicApi.resolveQr(token)
      .then((data) => {
        setTableData(data);
        // Automatically sync active tenant to the QR code's restaurant
        if (data.restaurant?.slug) {
          localStorage.setItem('active_tenant_slug', data.restaurant.slug);
          localStorage.setItem('active_tenant_id', data.restaurant.id);
        }
        setTableContext({
          tableId: data.table.id,
          tableNumber: data.table.table_number,
          sessionId: data.session.id
        });
        setOrderType('dine_in');
      })
      .catch((err) => {
        setError(err.message || 'Invalid or revoked QR code.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center animate-pulse mb-4">
          <Utensils className="w-8 h-8" />
        </div>
        <div className="text-slate-900 font-bold text-base">Verifying Table QR...</div>
        <p className="text-xs text-slate-500 mt-1">Connecting to restaurant operations</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">QR Code Notice</h2>
          <p className="text-xs text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => navigate('/u/customer/menu')}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Browse Menu as Takeaway
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 to-amber-500"></div>

        {/* Restaurant Identity */}
        {restaurant?.logo_url ? (
          <img src={restaurant.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md border border-slate-200" />
        ) : (
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center font-bold text-white text-2xl mx-auto mb-4 shadow-md"
            style={{ backgroundColor: restaurant?.primary_color || '#e11d48' }}
          >
            {restaurant?.name?.charAt(0) || 'R'}
          </div>
        )}

        <h1 className="text-2xl font-black text-slate-900 mb-1">
          {restaurant?.name || 'Restaurant'}
        </h1>
        <p className="text-xs text-slate-500 mb-6">Welcome to your digital dining table</p>

        {/* Verified Table Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Verified Table</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Active Session
            </span>
          </div>

          <div className="text-3xl font-black text-slate-900 flex items-center gap-3">
            Table {tableData?.table?.table_number}
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Capacity: {tableData?.table?.capacity} Guests</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Dine-In Enabled</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/u/customer/menu')}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 group"
          style={{ backgroundColor: restaurant?.primary_color || undefined }}
        >
          <span>View Menu & Start Ordering</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        <p className="text-[11px] text-slate-400 mt-4">
          All orders placed will be linked directly to Table {tableData?.table?.table_number}
        </p>
      </div>
    </div>
  );
};
