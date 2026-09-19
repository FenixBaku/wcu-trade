import { useMarket } from '../store/market';
import { fmtNum } from '../lib/format';

export default function RecentTrades({ symbol, pricePrecision = 2 }: { symbol: string; pricePrecision?: number }) {
  const trades = useMarket((s) => s.trades[symbol]) ?? [];
  return (
    <div className="flex flex-col h-full text-2xs">
      <div className="px-3 py-1.5 border-b border-border text-txt-muted font-medium text-xs">Recent Trades</div>
      <div className="grid grid-cols-3 px-3 py-1 text-txt-faint uppercase tracking-wide">
        <span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map((t, i) => (
          <div key={i} className="grid grid-cols-3 px-3 py-0.5 num hover:bg-panel-2">
            <span className={t.side === 'BUY' ? 'text-profit' : 'text-loss'}>{fmtNum(t.price, pricePrecision)}</span>
            <span className="text-right text-txt-muted">{fmtNum(t.amount, 4)}</span>
            <span className="text-right text-txt-faint">{new Date(t.ts).toLocaleTimeString('en-US', { hour12: false })}</span>
          </div>
        ))}
        {trades.length === 0 && <div className="p-4 text-center text-txt-faint">Waiting for trades…</div>}
      </div>
    </div>
  );
}
