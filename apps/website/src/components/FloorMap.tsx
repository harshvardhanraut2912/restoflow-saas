import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, X, Receipt as ReceiptIcon, ChefHat, Settings2, Utensils } from 'lucide-react';
import { waiterApi } from '../services/api.js';
import { useTenant } from '../context/TenantContext.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const fmtNum = (val?: string | null) => (val ? String(val).replace(/^T-0?/, '') : '');
const money = (paise?: number | null) => `₹${((paise || 0) / 100).toFixed(2)}`;
const hash = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const FINAL = ['completed', 'cancelled', 'rejected'];

const SHIRTS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4f46e5'];
const SKINS = ['#f1c9a5', '#e0a97d', '#c68863', '#8d5a3b', '#f6d7b8', '#b9815b'];
const HAIRS = ['#2b1d14', '#4a2f1d', '#1c1917', '#7a4b2a', '#a16207', '#3f3f46'];

type Seat = { x: number; y: number; rot: number };
type Shape = 'round' | 'square' | 'rect';

const CX = 120;
const CY = 110;

const buildLayout = (capacity: number, index: number) => {
  const cap = Math.max(2, capacity || 4);
  const shape: Shape = cap >= 7 ? 'rect' : index % 2 === 0 ? 'round' : 'square';
  const seats: Seat[] = [];

  if (shape === 'rect') {
    const n = Math.min(cap, 10);
    const top = Math.ceil(n / 2);
    const bottom = n - top;
    const place = (count: number, y: number, rot: number) => {
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? CX : CX - 52 + (104 / (count - 1)) * i;
        seats.push({ x, y, rot });
      }
    };
    place(top, 56, 0);
    place(bottom, 164, 180);
  } else {
    const n = Math.min(cap, 6);
    for (let i = 0; i < n; i++) {
      const theta = -90 + (360 / n) * i;
      const rad = (theta * Math.PI) / 180;
      seats.push({ x: CX + Math.cos(rad) * 66, y: CY + Math.sin(rad) * 66, rot: theta + 90 });
    }
  }
  return { shape, seats };
};

/* ------------------------------------------------------------------ */
/* Person (top-down)                                                   */
/* ------------------------------------------------------------------ */
const Person: React.FC<{ seat: Seat; seed: number; delay: number }> = ({ seat, seed, delay }) => {
  const shirt = SHIRTS[seed % SHIRTS.length];
  const skin = SKINS[(seed >> 3) % SKINS.length];
  const hair = HAIRS[(seed >> 5) % HAIRS.length];
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rot})`}>
      <g className="floor-person-in" style={{ animationDelay: `${delay}ms` }}>
        <g className="floor-person-sway" style={{ animationDelay: `${(seed % 7) * 220}ms`, animationDuration: `${3 + (seed % 5) * 0.4}s` }}>
          {/* arms */}
          <ellipse cx={-11} cy={5} rx={3.2} ry={6.5} fill={shirt} opacity={0.85} />
          <ellipse cx={11} cy={5} rx={3.2} ry={6.5} fill={shirt} opacity={0.85} />
          {/* shoulders */}
          <ellipse cx={0} cy={0} rx={12.5} ry={7.5} fill={shirt} />
          <ellipse cx={0} cy={-1.5} rx={9} ry={4} fill="#fff" opacity={0.12} />
          {/* head */}
          <g className="floor-head-bob">
            <circle cx={0} cy={1.5} r={7.2} fill={hair} />
            <ellipse cx={0} cy={3.2} rx={5.6} ry={5.2} fill={skin} />
          </g>
        </g>
      </g>
    </g>
  );
};

const Chair: React.FC<{ seat: Seat; occupied: boolean }> = ({ seat, occupied }) => (
  <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rot})`}>
    <rect x={-14} y={-14} width={28} height={7} rx={3.5} fill={occupied ? '#6b4a2e' : '#8b6b4a'} opacity={0.95} />
    <rect x={-13} y={-8} width={26} height={22} rx={7} fill={occupied ? '#8a6240' : '#a98760'} />
    <rect x={-13} y={-8} width={26} height={22} rx={7} fill="none" stroke="#000" strokeOpacity={0.12} />
  </g>
);

/* ------------------------------------------------------------------ */
/* Single table illustration                                           */
/* ------------------------------------------------------------------ */
type Tone = 'free' | 'busy' | 'bill' | 'alert';

const TableIllustration: React.FC<{
  table: any;
  index: number;
  occupied: boolean;
  tone: Tone;
  hasFood: boolean;
  steaming: boolean;
}> = ({ table, index, occupied, tone, hasFood, steaming }) => {
  const { shape, seats } = useMemo(() => buildLayout(table.capacity, index), [table.capacity, index]);
  const h = hash(String(table.id));
  const guestCount = occupied ? Math.max(2, seats.length - (h % 2 === 0 ? 0 : 1)) : 0;
  const gid = `wood_${String(table.id).replace(/[^a-z0-9]/gi, '')}`;

  const glow =
    tone === 'alert' ? '#ef4444' : tone === 'bill' ? '#6366f1' : tone === 'busy' ? '#f59e0b' : '#10b981';

  const plate = (s: Seat) => ({
    x: s.x + (CX - s.x) * 0.52,
    y: s.y + (CY - s.y) * 0.52
  });

  return (
    <svg viewBox="0 0 240 220" className="w-full h-auto drop-shadow-sm" role="img" aria-label={`Table ${fmtNum(table.table_number)}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9b48a" />
          <stop offset="100%" stopColor="#b98a5c" />
        </linearGradient>
        <radialGradient id={`${gid}_sh`} cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#000" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* status glow */}
      {(occupied || tone === 'alert') && (
        <circle
          cx={CX}
          cy={CY}
          r={tone === 'alert' ? 104 : 96}
          fill={glow}
          className={tone === 'alert' ? 'floor-glow-fast' : 'floor-glow'}
        />
      )}
      {!occupied && <circle cx={CX} cy={CY} r={92} fill={glow} opacity={0.06} />}

      {/* floor shadow */}
      <ellipse cx={CX} cy={CY + 8} rx={shape === 'rect' ? 78 : 52} ry={shape === 'rect' ? 40 : 52} fill={`url(#${gid}_sh)`} />

      {/* chairs */}
      {seats.map((s, i) => (
        <Chair key={`c${i}`} seat={s} occupied={i < guestCount} />
      ))}

      {/* table top */}
      {shape === 'round' && (
        <>
          <circle cx={CX} cy={CY} r={40} fill={`url(#${gid})`} />
          <circle cx={CX} cy={CY} r={40} fill="none" stroke="#7c5a3a" strokeOpacity={0.55} strokeWidth={2} />
          <circle cx={CX} cy={CY} r={33} fill="none" stroke="#fff" strokeOpacity={0.18} />
        </>
      )}
      {shape === 'square' && (
        <>
          <rect x={CX - 38} y={CY - 38} width={76} height={76} rx={14} fill={`url(#${gid})`} />
          <rect x={CX - 38} y={CY - 38} width={76} height={76} rx={14} fill="none" stroke="#7c5a3a" strokeOpacity={0.55} strokeWidth={2} />
          <rect x={CX - 31} y={CY - 31} width={62} height={62} rx={10} fill="none" stroke="#fff" strokeOpacity={0.18} />
        </>
      )}
      {shape === 'rect' && (
        <>
          <rect x={CX - 70} y={CY - 28} width={140} height={56} rx={14} fill={`url(#${gid})`} />
          <rect x={CX - 70} y={CY - 28} width={140} height={56} rx={14} fill="none" stroke="#7c5a3a" strokeOpacity={0.55} strokeWidth={2} />
          <rect x={CX - 63} y={CY - 21} width={126} height={42} rx={10} fill="none" stroke="#fff" strokeOpacity={0.18} />
        </>
      )}

      {/* plates (food appears only once the order is SERVED) */}
      {occupied &&
        seats.slice(0, guestCount).map((s, i) => {
          const p = plate(s);
          const kind = (h + i) % 4;
          return (
            <g key={`p${i}`} className="floor-plate-in" style={{ animationDelay: `${300 + i * 90}ms` }}>
              {/* glass */}
              {hasFood && <circle cx={p.x + 11} cy={p.y - 3} r={2.4} fill="#bae6fd" stroke="#7dd3fc" strokeWidth={0.6} />}
              {/* plate */}
              <circle cx={p.x} cy={p.y} r={hasFood ? 8 : 6.2} fill="#fff" stroke="#cbd5e1" strokeWidth={0.8} />
              <circle cx={p.x} cy={p.y} r={hasFood ? 6 : 4} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
              {hasFood && (
                <g className="floor-food-in" style={{ animationDelay: `${i * 120}ms` }}>
                  {kind === 0 && (
                    <>
                      <circle cx={p.x} cy={p.y} r={4.6} fill="#c2410c" />
                      <circle cx={p.x - 1} cy={p.y - 1} r={2.4} fill="#f59e0b" />
                      <circle cx={p.x + 1.6} cy={p.y + 1.4} r={1} fill="#fde68a" />
                    </>
                  )}
                  {kind === 1 && (
                    <>
                      <ellipse cx={p.x - 1.5} cy={p.y} rx={4.6} ry={3.4} fill="#fef3c7" stroke="#fde68a" strokeWidth={0.5} />
                      <circle cx={p.x + 2.6} cy={p.y + 1.2} r={2.4} fill="#b45309" />
                    </>
                  )}
                  {kind === 2 && (
                    <>
                      <ellipse cx={p.x} cy={p.y + 0.8} rx={4.2} ry={3.2} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.5} />
                      <circle cx={p.x - 1.4} cy={p.y - 0.4} r={0.8} fill="#e2e8f0" />
                      <circle cx={p.x + 1.4} cy={p.y + 0.4} r={0.8} fill="#e2e8f0" />
                      <path d={`M${p.x - 4.4} ${p.y - 3} q4 -3 8.4 0`} stroke="#ea580c" strokeWidth={1.6} fill="none" strokeLinecap="round" />
                    </>
                  )}
                  {kind === 3 && (
                    <>
                      <circle cx={p.x} cy={p.y} r={4.6} fill="#16a34a" />
                      <circle cx={p.x - 1.4} cy={p.y - 1} r={1.3} fill="#ef4444" />
                      <circle cx={p.x + 1.6} cy={p.y + 1.2} r={1.1} fill="#facc15" />
                      <circle cx={p.x + 1.2} cy={p.y - 1.6} r={0.9} fill="#bbf7d0" />
                    </>
                  )}
                </g>
              )}
              {steaming && (
                <g>
                  <path d={`M${p.x - 2.5} ${p.y - 9} q-2 -3 0 -6`} className="floor-steam" fill="none" stroke="#94a3b8" strokeWidth={1.4} strokeLinecap="round" />
                  <path d={`M${p.x + 2.5} ${p.y - 9} q2 -3 0 -6`} className="floor-steam floor-steam-b" fill="none" stroke="#94a3b8" strokeWidth={1.4} strokeLinecap="round" />
                </g>
              )}
            </g>
          );
        })}

      {/* table number plate */}
      <g>
        <rect x={CX - 15} y={CY - 11} width={30} height={22} rx={7} fill="#1e293b" opacity={0.86} />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {fmtNum(table.table_number)}
        </text>
      </g>

      {/* guests */}
      {seats.slice(0, guestCount).map((s, i) => (
        <Person key={`g${i}`} seat={s} seed={h + i * 17} delay={i * 110} />
      ))}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Receipt popover                                                     */
/* ------------------------------------------------------------------ */
const STATUS_STYLE: Record<string, string> = {
  placed: 'bg-slate-200 text-slate-700',
  accepted: 'bg-sky-100 text-sky-700',
  preparing: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  served: 'bg-indigo-100 text-indigo-700'
};

const ReceiptPopover: React.FC<{
  table: any;
  orders: any[];
  requests: any[];
  side: 'left' | 'right';
  accent: string;
  onClose: () => void;
  onManage: () => void;
  onResolve: (id: string) => void;
  onServe: (orderId: string) => void;
  onSetEmpty: () => void;
}> = ({ table, orders, requests, side, accent, onClose, onManage, onResolve, onServe, onSetEmpty }) => {
  const { settings } = useTenant();
  const [bill, setBill] = useState<any | null>(null);

  const sig = orders.map((o) => `${o.id}:${o.status}`).join('|');
  useEffect(() => {
    let alive = true;
    if (!table.active_session_id || orders.length === 0) {
      setBill(null);
      return;
    }
    waiterApi
      .getSessionBill(table.active_session_id)
      .then((r: any) => alive && setBill(r?.summary || null))
      .catch(() => alive && setBill(null));
    return () => {
      alive = false;
    };
  }, [table.active_session_id, sig]);

  const subtotal = bill?.subtotal_paise ?? orders.reduce((s, o) => s + (o.subtotal_paise || 0), 0);
  const rate = settings?.tax_rate_percent ?? 5;
  const tax = bill?.tax_paise ?? Math.round(subtotal * (rate / 100));
  const total = bill?.grand_total_paise ?? subtotal + tax;

  const billStatuses = orders.map((o) => o.bill_status).filter(Boolean);
  const pay: { label: string; cls: string } = billStatuses.includes('paid') && billStatuses.every((s) => s === 'paid')
    ? { label: 'PAID', cls: 'border-emerald-600 text-emerald-700' }
    : billStatuses.includes('partially_paid')
    ? { label: 'PARTIALLY PAID', cls: 'border-amber-600 text-amber-700' }
    : { label: 'UNPAID', cls: 'border-rose-600 text-rose-600' };

  const placement =
    side === 'right'
      ? 'sm:left-full sm:ml-3 sm:right-auto'
      : 'sm:right-full sm:mr-3 sm:left-auto';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`fixed inset-x-3 bottom-3 z-50 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-0 ${placement} sm:w-80`}
    >
      <div className="floor-receipt-print" style={{ filter: `drop-shadow(0 22px 40px rgba(15,23,42,0.45)) drop-shadow(0 0 0 ${accent})` }}>
        <div
          className="relative px-4 pt-3.5 pb-2 text-slate-800 max-h-[70vh] sm:max-h-[30rem] overflow-y-auto text-[13px]"
          style={{ background: '#fffdf6', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          <div
            className="-mx-4 -mt-3.5 mb-3 px-4 py-3 flex items-center justify-between text-white"
            style={{ background: accent, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <div>
              <div className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase opacity-80">
                <ReceiptIcon className="w-3 h-3" /> Table Slip
              </div>
              <div className="text-2xl font-black tracking-tight leading-none mt-1">Table {fmtNum(table.table_number)}</div>
              <div className="text-[11px] opacity-80 mt-0.5">{table.capacity} seats</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Service requests */}
          {requests.length > 0 && (
            <div className="mb-2.5 space-y-1.5">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">!</span>
                    <span className="text-[10px] font-bold uppercase text-rose-700 truncate">{r.request_type}</span>
                  </div>
                  <button
                    onClick={() => onResolve(r.id)}
                    className="text-xs font-black px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 shrink-0 shadow-sm"
                  >
                    Done
                  </button>
                </div>
              ))}
            </div>
          )}

          {orders.length === 0 ? (
            <div className="py-5 text-center">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold">No orders yet</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Table is free for new guests</div>
            </div>
          ) : (
            <>
              {/* Orders & kitchen stage */}
              <div className="space-y-1.5">
                {orders.map((o) => (
                  <div key={o.id}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold">Order {o.round_number || ''} · #{String(o.order_number).slice(-5)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${STATUS_STYLE[o.status] || 'bg-slate-200 text-slate-700'}`}>
                        {o.status}
                      </span>
                    </div>
                    {o.status === 'ready' && (
                      <button
                        onClick={() => onServe(o.id)}
                        className="mt-1.5 w-full text-sm font-black py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                      >
                        <ChefHat className="w-5 h-5" /> Mark as Served
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="my-2.5 border-t border-dashed border-slate-300" />

              {/* Items */}
              <div className="space-y-1 text-[13px]">
                {bill?.items?.length
                  ? bill.items.map((it: any) => (
                      <div key={it.id} className="flex justify-between gap-2">
                        <span className="truncate">{it.quantity}x {it.name_snapshot}</span>
                        <span className="font-bold shrink-0">₹{((it.total_price_paise || 0) / 100).toFixed(0)}</span>
                      </div>
                    ))
                  : orders.flatMap((o) =>
                      (o.items || []).map((it: any, i: number) => (
                        <div key={`${o.id}_${i}`} className="flex justify-between gap-2">
                          <span className="truncate">{it.quantity}x {it.name}</span>
                        </div>
                      ))
                    )}
              </div>

              <div className="my-2.5 border-t border-dashed border-slate-300" />

              <div className="space-y-0.5 text-[12px] text-slate-500">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                <div className="flex justify-between"><span>GST</span><span>{money(tax)}</span></div>
                <div className="flex justify-between text-lg font-black text-slate-900 pt-1">
                  <span>TOTAL</span><span>{money(total)}</span>
                </div>
              </div>

              <div className="flex justify-center mt-3">
                <span className={`floor-stamp inline-block border-2 rounded-md px-4 py-1 text-sm font-black tracking-[0.2em] ${pay.cls}`}>
                  {pay.label}
                </span>
              </div>
            </>
          )}

          <button
            onClick={onManage}
            className="mt-3 w-full text-[11px] font-bold py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700 flex items-center justify-center gap-1.5"
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage / Add items / Pay
          </button>

          {(orders.length > 0 || table.status === 'occupied') && (
            <button
              onClick={onSetEmpty}
              className="mt-2 w-full text-sm font-black py-3 rounded-xl bg-rose-600 text-white hover:bg-rose-500 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              <CheckCircle className="w-4 h-4" /> Mark Table Empty
            </button>
          )}
        </div>
        {/* torn paper edge */}
        <div
          className="h-2.5 w-full"
          style={{
            background:
              'linear-gradient(-135deg, transparent 6px, #fffdf6 0) 0 0 / 12px 12px repeat-x, linear-gradient(135deg, transparent 6px, #fffdf6 0) 0 0 / 12px 12px repeat-x'
          }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Floor map                                                           */
/* ------------------------------------------------------------------ */
export const FloorMap: React.FC<{
  tables: any[];
  orders: any[];
  requests: any[];
  selectedId?: string | null;
  onManage: (table: any) => void;
  onResolve: (requestId: string) => void;
  onServe: (orderId: string) => void;
  onSetEmpty: (table: any) => void;
}> = ({ tables, orders, requests, selectedId, onManage, onResolve, onServe, onSetEmpty }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [side, setSide] = useState<'left' | 'right'>('right');

  const byTable = useMemo(() => {
    const map: Record<string, { orders: any[]; requests: any[] }> = {};
    tables.forEach((t) => (map[t.id] = { orders: [], requests: [] }));
    orders
      .filter((o) => o.table_id && !FINAL.includes(o.status))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((o) => map[o.table_id]?.orders.push(o));
    requests.forEach((r) => map[r.table_id]?.requests.push(r));
    return map;
  }, [tables, orders, requests]);

  const counts = useMemo(() => {
    let free = 0, busy = 0, bill = 0, alerts = 0;
    tables.forEach((t) => {
      const d = byTable[t.id];
      const occ = t.status === 'occupied' || (d?.orders.length || 0) > 0;
      if (d?.requests.length) alerts++;
      if (!occ) free++;
      else if (t.session_status === 'bill_requested') bill++;
      else busy++;
    });
    return { free, busy, bill, alerts };
  }, [tables, byTable]);

  const handleClick = (e: React.MouseEvent<HTMLElement>, table: any) => {
    if (openId === table.id) {
      setOpenId(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setSide(r.left + r.width / 2 > window.innerWidth / 2 ? 'left' : 'right');
    setOpenId(table.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Live Floor Map</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tap a table to see its slip, orders and payment status</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Free ({counts.free})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Dining ({counts.busy})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Bill ({counts.bill})</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">!</span>
            Needs service ({counts.alerts})
          </span>
        </div>
      </div>

      <div className="relative rounded-[2rem] border border-stone-300/70 dark:border-slate-800 bg-gradient-to-br from-stone-100 via-amber-50/60 to-stone-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-7 shadow-inner">
        {/* plank floor texture */}
        <div
          className="absolute inset-0 rounded-[2rem] pointer-events-none opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(120,90,50,0.05) 0, rgba(120,90,50,0.05) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(0deg, rgba(120,90,50,0.035) 0, rgba(120,90,50,0.035) 1px, transparent 1px, transparent 160px)'
          }}
        />

        {openId && <div className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpenId(null)} />}

        <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-6">
          {tables.map((table, index) => {
            const d = byTable[table.id] || { orders: [], requests: [] };
            const occupied = table.status === 'occupied' || d.orders.length > 0;
            const needsService = d.requests.length > 0;
            const billRequested = occupied && table.session_status === 'bill_requested';
            const tone: Tone = needsService ? 'alert' : billRequested ? 'bill' : occupied ? 'busy' : 'free';
            const served = d.orders.some((o) => o.status === 'served');
            const hasFood = served;
            const steaming = served;
            const hasReady = d.orders.some((o) => o.status === 'ready');
            const isOpen = openId === table.id;

            return (
              <div key={table.id} className={`relative ${isOpen ? 'z-40' : 'z-10'}`}>
                <button
                  type="button"
                  onClick={(e) => handleClick(e, table)}
                  className={`group relative w-full rounded-3xl px-1 pt-2 pb-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none ${
                    isOpen || selectedId === table.id ? 'bg-white/60 dark:bg-white/5 ring-2 ring-rose-400/60' : 'hover:bg-white/40 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="mx-auto max-w-[230px]">
                    <TableIllustration
                      table={table}
                      index={index}
                      occupied={occupied}
                      tone={tone}
                      hasFood={hasFood}
                      steaming={steaming}
                    />
                  </div>

                  {/* Red alert badge */}
                  {needsService && (
                    <div className="absolute top-3 right-3 sm:right-5">
                      <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                      <span className="floor-alert-shake relative w-9 h-9 rounded-full bg-red-600 text-white font-black text-xl flex items-center justify-center shadow-lg shadow-red-600/40 border-2 border-white dark:border-slate-900">
                        !
                      </span>
                    </div>
                  )}

                  {/* Ready to serve badge */}
                  {hasReady && !needsService && (
                    <div className="absolute top-3 right-3 sm:right-5 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 border-2 border-white dark:border-slate-900 animate-bounce">
                      <ChefHat className="w-4 h-4" />
                    </div>
                  )}

                  {/* Food served chip */}
                  {served && (
                    <div className="absolute top-3 left-3 sm:left-5 px-2 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-emerald-700/30 border-2 border-white dark:border-slate-900">
                      <Utensils className="w-3 h-3" /> Served
                    </div>
                  )}

                  {/* Label */}
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <span className="text-sm font-black text-slate-900 dark:text-white">Table {fmtNum(table.table_number)}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        needsService
                          ? 'bg-red-600 text-white'
                          : billRequested
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                          : occupied
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {needsService
                        ? `${d.requests[0].request_type} requested`
                        : billRequested
                        ? 'Bill requested'
                        : served
                        ? 'Food served'
                        : occupied
                        ? 'Dining'
                        : 'Free'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <ReceiptPopover
                    table={table}
                    orders={d.orders}
                    requests={d.requests}
                    side={side}
                    accent={tone === 'alert' ? '#dc2626' : tone === 'bill' ? '#4f46e5' : served ? '#059669' : occupied ? '#d97706' : '#0f172a'}
                    onClose={() => setOpenId(null)}
                    onManage={() => {
                      setOpenId(null);
                      onManage(table);
                    }}
                    onResolve={onResolve}
                    onServe={onServe}
                    onSetEmpty={() => {
                      setOpenId(null);
                      onSetEmpty(table);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
