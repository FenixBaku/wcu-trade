import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useMarket } from '../store/market';
import { usePortfolio } from '../store/portfolio';
import { fmtUsd, fmtNum } from '../lib/format';
import type { MarketRow } from '../hooks/useSymbols';

const TYPES = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'] as const;
type OType = (typeof TYPES)[number];

export default function OrderEntry({ row }: { row: MarketRow }) {
  const quote = useMarket((s) => s.quotes[row.symbol]);
  const summary = usePortfolio((s) => s.summary);
  const qc = useQueryClient();

  const [tab, setTab] = useState<'SPOT' | 'MARGIN'>('SPOT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState<OType>('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pp = row.pricePrecision;
  const available = parseFloat(summary?.available ?? '0');
  const refPrice = useMemo(() => {
    if (type === 'LIMIT' && limitPrice) return parseFloat(limitPrice);
    if ((type === 'STOP' || type === 'STOP_LIMIT') && stopPrice) return parseFloat(stopPrice);
    return quote?.last ?? 0;
  }, [type, limitPrice, stopPrice, quote]);

  const qtyNum = parseFloat(qty) || 0;
  const notional = qtyNum * refPrice;
  const margin = leverage > 0 ? notional / leverage : notional;
  const fee = notional * ((tab === 'MARGIN' ? 10 : 10) / 10000); // taker 0.10%
  const canData = !!quote;

  const setPct = (pct: number) => {
    if (!refPrice) return;
    const maxNotional = available * leverage;
    const q = (maxNotional * pct) / refPrice;
    setQty(q > 0 ? q.toFixed(row.qtyPrecision) : '');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body: any = { symbol: row.symbol, side, type, quantity: qty };
      if (type === 'LIMIT' || type === 'STOP_LIMIT') body.limitPrice = limitPrice;
      if (type === 'STOP' || type === 'STOP_LIMIT') body.stopPrice = stopPrice;
      if (tp) body.takeProfitPrice = tp;
      if (sl) body.stopLossPrice = sl;
      if (tab === 'MARGIN') body.leverage = leverage;
      return (await api.post('/orders', body)).data;
    },
    onSuccess: (data) => {
      setMsg({ ok: true, text: `${side} order ${data.status?.toLowerCase() ?? 'placed'}` });
      setQty('');
      usePortfolio.getState().bumpOrders();
      qc.invalidateQueries({ queryKey: ['portfolio-summary'] });
      qc.invalidateQueries({ queryKey: ['open-orders'] });
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (e) => setMsg({ ok: false, text: apiError(e) }),
  });

  const disabled = !qtyNum || mutation.isPending || (type !== 'MARKET' && type !== 'STOP' && !limitPrice) || (type.includes('STOP') && !stopPrice);

  return (
    <div className="flex flex-col h-full">
      {/* SPOT / MARGIN */}
      <div className="flex border-b border-border">
        {(['SPOT', 'MARGIN'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === 'SPOT') setLeverage(1); }}
            className={`flex-1 py-2 text-xs font-medium ${tab === t ? 'text-txt border-b-2 border-wcu' : 'text-txt-muted'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {/* Buy / Sell */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSide('BUY')} className={`py-2 rounded text-sm font-semibold ${side === 'BUY' ? 'bg-profit text-white' : 'bg-elevated text-txt-muted'}`}>Buy / Long</button>
          <button onClick={() => setSide('SELL')} className={`py-2 rounded text-sm font-semibold ${side === 'SELL' ? 'bg-loss text-white' : 'bg-elevated text-txt-muted'}`}>Sell / Short</button>
        </div>

        {/* Order type */}
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`flex-1 py-1 text-2xs rounded ${type === t ? 'bg-elevated text-txt' : 'text-txt-muted hover:text-txt'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {tab === 'MARGIN' && (
          <div>
            <div className="flex justify-between text-2xs text-txt-muted mb-1"><span>Leverage</span><span className="num text-wcu-bright">{leverage}x</span></div>
            <input type="range" min={1} max={10} value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))} className="w-full accent-wcu" />
          </div>
        )}

        {(type === 'STOP' || type === 'STOP_LIMIT') && (
          <Field label="Stop Price" value={stopPrice} onChange={setStopPrice} placeholder={fmtNum(quote?.last, pp)} />
        )}
        {(type === 'LIMIT' || type === 'STOP_LIMIT') && (
          <Field label="Limit Price" value={limitPrice} onChange={setLimitPrice} placeholder={fmtNum(quote?.last, pp)} />
        )}

        <Field label={`Quantity (${row.base})`} value={qty} onChange={setQty} placeholder="0.00" />

        <div className="grid grid-cols-4 gap-1">
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <button key={p} onClick={() => setPct(p)} className="py-1 text-2xs rounded bg-base border border-border text-txt-muted hover:text-txt hover:border-wcu">
              {p * 100}%
            </button>
          ))}
        </div>

        {/* TP / SL */}
        <div className="pt-1 border-t border-border-soft">
          <div className="text-2xs text-txt-faint uppercase tracking-wide mb-2">Risk (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Take Profit" value={tp} onChange={setTp} placeholder="—" small />
            <Field label="Stop Loss" value={sl} onChange={setSl} placeholder="—" small />
          </div>
        </div>

        {/* Estimates */}
        <div className="space-y-1 text-xs pt-1 border-t border-border-soft">
          <Est label="Order Value" value={fmtUsd(notional)} />
          {tab === 'MARGIN' && <Est label="Est. Margin" value={fmtUsd(margin)} />}
          <Est label="Est. Fee (0.10%)" value={fmtUsd(fee)} />
          <Est label="Available" value={fmtUsd(available)} />
        </div>

        {msg && (
          <div className={`text-xs rounded px-3 py-2 ${msg.ok ? 'bg-profit/10 text-profit border border-profit/30' : 'bg-loss/10 text-loss border border-loss/30'}`}>
            {msg.text}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => mutation.mutate()}
          disabled={disabled}
          className={`w-full py-2.5 rounded font-semibold text-sm text-white ${side === 'BUY' ? 'bg-profit hover:bg-profit-soft' : 'bg-loss hover:bg-loss-soft'} disabled:opacity-40`}
        >
          {mutation.isPending ? 'Submitting…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${row.base}`}
        </button>
        {!canData && <p className="text-2xs text-txt-faint mt-2 text-center">No live quote — market orders unavailable for this symbol.</p>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, small }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; small?: boolean }) {
  return (
    <div>
      <label className="text-2xs text-txt-muted mb-1 block">{label}</label>
      <input className={`input ${small ? '!py-1 text-xs' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal" />
    </div>
  );
}

function Est({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-txt-muted">{label}</span>
      <span className="num text-txt">{value}</span>
    </div>
  );
}
