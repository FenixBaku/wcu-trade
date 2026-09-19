import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSymbols } from '../hooks/useSymbols';
import { useMarket } from '../store/market';
import { fmtNum, fmtPct, fmtCompact, pnlColor } from '../lib/format';

const FILTERS = ['All', 'Top Gainers', 'Top Losers', 'Most Active', 'Crypto', 'Stocks', 'Forex', 'Metals', 'Indices', 'Commodities'] as const;
const CLASS_MAP: Record<string, string> = { Crypto: 'CRYPTO', Stocks: 'STOCK', Forex: 'FOREX', Metals: 'METAL', Indices: 'INDEX', Commodities: 'COMMODITY' };

export default function Markets() {
  const { data } = useSymbols();
  const quotes = useMarket((s) => s.quotes);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    let list = (data ?? []).map((r) => ({ ...r, q: quotes[r.symbol] ?? r.liveQuote }));
    if (CLASS_MAP[filter]) list = list.filter((r) => r.assetClass === CLASS_MAP[filter]);
    if (search) { const s = search.toLowerCase(); list = list.filter((r) => r.symbol.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)); }
    if (filter === 'Top Gainers') list = [...list].filter((r) => r.q).sort((a, b) => (b.q!.changePct24h) - (a.q!.changePct24h));
    if (filter === 'Top Losers') list = [...list].filter((r) => r.q).sort((a, b) => (a.q!.changePct24h) - (b.q!.changePct24h));
    if (filter === 'Most Active') list = [...list].filter((r) => r.q).sort((a, b) => (b.q!.volume24h) - (a.q!.volume24h));
    return list;
  }, [data, quotes, filter, search]);

  return (
    <div className="h-full overflow-y-auto p-5">
      <h1 className="text-lg font-semibold mb-3">Markets</h1>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="input !font-sans !w-64 text-sm" placeholder="Search markets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1.5 text-xs rounded ${filter === f ? 'bg-elevated text-txt' : 'text-txt-muted hover:text-txt'}`}>{f}</button>
          ))}
        </div>
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm num">
          <thead>
            <tr className="text-2xs text-txt-faint uppercase tracking-wide border-b border-border">
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-right font-medium">Last Price</th>
              <th className="px-4 py-2.5 text-right font-medium">24h Change</th>
              <th className="px-4 py-2.5 text-right font-medium">24h High</th>
              <th className="px-4 py-2.5 text-right font-medium">24h Low</th>
              <th className="px-4 py-2.5 text-right font-medium">Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} onClick={() => navigate(`/trade/${r.symbol}`)} className="border-b border-border-soft hover:bg-panel-2 cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="font-sans font-medium">{r.base}<span className="text-txt-faint">/{r.quote}</span></div>
                  <div className="text-2xs text-txt-faint font-sans">{r.name}</div>
                </td>
                <td className="px-4 py-2.5 text-right">{r.q ? fmtNum(r.q.last, r.pricePrecision) : <span className="text-txt-faint text-xs">no data</span>}</td>
                <td className={`px-4 py-2.5 text-right ${r.q ? pnlColor(r.q.changePct24h) : 'text-txt-faint'}`}>{r.q ? fmtPct(r.q.changePct24h) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-txt-muted">{r.q ? fmtNum(r.q.high24h, r.pricePrecision) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-txt-muted">{r.q ? fmtNum(r.q.low24h, r.pricePrecision) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-txt-muted">{r.q ? fmtCompact(r.q.volume24h) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
