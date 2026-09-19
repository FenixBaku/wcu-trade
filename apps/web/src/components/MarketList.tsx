import { useMemo, useState } from 'react';
import { useMarket } from '../store/market';
import { useSymbols, MarketRow } from '../hooks/useSymbols';
import { fmtNum, fmtPct, pnlColor } from '../lib/format';

const TABS = ['Favorites', 'Crypto', 'Stocks', 'Forex', 'Metals', 'Indices', 'Commodities'] as const;
const CLASS_MAP: Record<string, string> = {
  Crypto: 'CRYPTO', Stocks: 'STOCK', Forex: 'FOREX', Metals: 'METAL', Indices: 'INDEX', Commodities: 'COMMODITY',
};

export default function MarketList({
  active,
  onSelect,
  favorites,
}: {
  active: string;
  onSelect: (s: string) => void;
  favorites: Set<string>;
}) {
  const { data } = useSymbols();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Crypto');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    let list = data ?? [];
    if (tab === 'Favorites') list = list.filter((r) => favorites.has(r.symbol));
    else if (CLASS_MAP[tab]) list = list.filter((r) => r.assetClass === CLASS_MAP[tab]);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.base.toLowerCase().includes(q));
    }
    return list;
  }, [data, tab, search, favorites]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <input
          className="input !py-1 !font-sans text-xs"
          placeholder="Search BTC, Bitcoin…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex gap-1 px-2 py-1.5 overflow-x-auto border-b border-border text-2xs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-1 rounded whitespace-nowrap ${tab === t ? 'bg-elevated text-txt' : 'text-txt-muted hover:text-txt'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] px-3 py-1.5 text-2xs text-txt-faint uppercase tracking-wide border-b border-border">
        <span>Symbol</span>
        <span className="text-right pr-3">Last</span>
        <span className="text-right">24h%</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.map((r) => (
          <MarketRowItem key={r.symbol} row={r} active={active === r.symbol} onSelect={onSelect} />
        ))}
        {rows.length === 0 && <div className="p-4 text-center text-xs text-txt-faint">No markets</div>}
      </div>
    </div>
  );
}

function MarketRowItem({ row, active, onSelect }: { row: MarketRow; active: boolean; onSelect: (s: string) => void }) {
  const quote = useMarket((s) => s.quotes[row.symbol]);
  const hasData = !!quote;
  return (
    <button
      onClick={() => onSelect(row.symbol)}
      className={`w-full grid grid-cols-[1fr_auto_auto] items-center px-3 py-2 text-xs border-l-2 ${
        active ? 'bg-elevated border-wcu' : 'border-transparent hover:bg-panel-2'
      }`}
    >
      <div className="text-left">
        <div className="font-medium text-txt">{row.base}<span className="text-txt-faint">/{row.quote}</span></div>
        <div className="text-2xs text-txt-faint truncate max-w-[120px]">{row.name}</div>
      </div>
      <div className="num text-right pr-3 text-txt">
        {hasData ? fmtNum(quote.last, row.pricePrecision) : <span className="text-txt-faint text-2xs">no data</span>}
      </div>
      <div className={`num text-right ${hasData ? pnlColor(quote.changePct24h) : 'text-txt-faint'}`}>
        {hasData ? fmtPct(quote.changePct24h) : '—'}
      </div>
    </button>
  );
}
