import { useEffect, useRef, useState } from 'react';
import { useMarket } from '../store/market';
import { fmtNum, fmtSigned, fmtPct, fmtCompact, pnlColor } from '../lib/format';
import type { MarketRow } from '../hooks/useSymbols';

export default function SymbolHeader({ row, fav, toggleFav }: { row: MarketRow; fav: boolean; toggleFav: () => void }) {
  const quote = useMarket((s) => s.quotes[row.symbol]);
  const pp = row.pricePrecision;
  const [flash, setFlash] = useState('');
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (!quote) return;
    if (prev.current !== null && quote.last !== prev.current) {
      setFlash(quote.last > prev.current ? 'text-profit' : 'text-loss');
      const t = setTimeout(() => setFlash(''), 400);
      prev.current = quote.last;
      return () => clearTimeout(t);
    }
    prev.current = quote.last;
  }, [quote]);

  const change = quote ? (quote.last * quote.changePct24h) / 100 : 0;

  return (
    <div className="flex items-center gap-6 px-4 py-2.5 border-b border-border bg-panel/40">
      <div className="flex items-center gap-2">
        <button onClick={toggleFav} className={`text-lg leading-none ${fav ? 'text-yellow-400' : 'text-txt-faint hover:text-txt-muted'}`}>★</button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{row.base}<span className="text-txt-faint">/{row.quote}</span></span>
            <span className="text-2xs px-1.5 py-0.5 rounded bg-elevated text-txt-muted uppercase">{row.assetClass}</span>
          </div>
          <div className="text-2xs text-txt-faint">{row.name}</div>
        </div>
      </div>

      <div className={`num text-2xl font-semibold transition-colors ${flash || 'text-txt'}`}>
        {quote ? fmtNum(quote.last, pp) : <span className="text-txt-faint text-base">no live data</span>}
      </div>

      {quote && (
        <>
          <HeaderStat label="24h Change" value={<span className={pnlColor(change)}>{fmtSigned(change, pp, '')} <span className="text-xs">{fmtPct(quote.changePct24h)}</span></span>} />
          <HeaderStat label="24h High" value={fmtNum(quote.high24h, pp)} />
          <HeaderStat label="24h Low" value={fmtNum(quote.low24h, pp)} />
          <HeaderStat label="24h Volume" value={fmtCompact(quote.volume24h)} />
          <HeaderStat label="Bid / Ask" value={<span><span className="text-profit">{fmtNum(quote.bid, pp)}</span> / <span className="text-loss">{fmtNum(quote.ask, pp)}</span></span>} />
          <div className="ml-auto flex items-center gap-1.5 text-2xs">
            <span className={`w-2 h-2 rounded-full ${quote.synthetic ? 'bg-orange-400' : 'bg-profit animate-pulse'}`} />
            <span className="text-txt-muted">{quote.provider}{quote.synthetic ? ' · derived' : ' · live'}</span>
          </div>
        </>
      )}
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs text-txt-faint uppercase tracking-wide">{label}</div>
      <div className="num text-sm text-txt">{value}</div>
    </div>
  );
}
