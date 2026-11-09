import React from 'react';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';

export const SuspendedNotice: React.FC = () => {
  const { restaurant, suspendedMessage } = useTenant();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700/80 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {restaurant?.name || 'Restaurant'} Service Paused
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          {suspendedMessage || 'Online ordering and digital dining services are currently suspended for this establishment.'}
        </p>

        <div className="bg-slate-900/60 rounded-xl p-4 text-xs text-slate-400 border border-slate-800 text-left flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200">Management Notice:</span> If you are the restaurant owner or manager, please contact the platform administration to resume active service.
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-700/60 text-xs text-slate-500">
          Powered by Smart Restaurant SaaS Operations
        </div>
      </div>
    </div>
  );
};
