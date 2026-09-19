import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMarket } from '../store/market';
import { fmtNum } from '../lib/format';
import type { OrderBook as OB } from '@wcu/shared';

export default function OrderBook({ symbol, pricePrecision = 2 }: { symbol: string; pricePrecision?: number }) {
  const quote = useMarket((s) => s.quotes[symbol]);
  const { data } = useQuery({
    queryKey: ['orderbook', symbol],
    queryFn: async () => (await api.get<OB>(`/markets/${symbol}/orderbook`, { params: { depth: 12 } })).data,
    refetchInterval: 2000,
  });

  const asks = (data?.asks ?? []).slice(0, 10).reverse();
  const bids = (data?.bids ?? []).slice(0, 10);
  const maxAmt = Math.max(1, ...[...asks, ...bids].map((l) => l.amount));

  return (
    <div className="flex flex-col h-full text-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-txt-muted font-medium text-xs">Order Book</span>
        {data && (
          <span className={`px-1.5 py-0.5 rounded text-2xs ${data.native ? 'bg-profit/15 text-profit' : 'bg-orange-500/15 text-orange-400'}`}>
            {data.native ? 'NATIVE' : 'SYNTHETIC'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-txt-faint uppercase tracking-wide">
        <span>Price</span><span className="text-right">Amount</span><span className="text-right">Total</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {asks.map((l, i) => <Row key={`a${i}`} l={l} side="ask" max={maxAmt} pp={pricePrecision} />)}
      </div>
      <div className="px-3 py-1.5 num text-sm font-semibold border-y border-border text-center text-txt">
        {quote ? fmtNum(quote.last, pricePrecision) : '—'}
      </div>
      <div className="flex-1 overflow-hidden">
        {bids.map((l, i) => <Row key={`b${i}`} l={l} side="bid" max={maxAmt} pp={pricePrecision} />)}
      </div>
    </div>
  );
}

function Row({ l, side, max, pp }: { l: { price: number; amount: number }; side: 'ask' | 'bid'; max: number; pp: number }) {
  const pct = Math.min(100, (l.amount / max) * 100);
  const color = side === 'ask' ? 'text-loss' : 'text-profit';
  const bar = side === 'ask' ? 'bg-loss/10' : 'bg-profit/10';
  return (
    <div className="relative grid grid-cols-3 px-3 py-0.5 num hover:bg-panel-2">
      <div className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${pct}%` }} />
      <span className={`relative ${color}`}>{fmtNum(l.price, pp)}</span>
      <span className="relative text-right text-txt-muted">{fmtNum(l.amount, 4)}</span>
      <span className="relative text-right text-txt-faint">{fmtNum(l.price * l.amount, 0)}</span>
    </div>
  );
}
