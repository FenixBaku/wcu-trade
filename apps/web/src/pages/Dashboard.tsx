import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useSymbols } from '../hooks/useSymbols';
import { useMarket } from '../store/market';
import StatCard from '../components/StatCard';
import { fmtUsd, fmtSigned, fmtPct, fmtNum, pnlColor } from '../lib/format';

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { data: overview } = useQuery({ queryKey: ['dash-portfolio'], queryFn: async () => (await api.get('/portfolio')).data, refetchInterval: 10000 });
  const { data: symbols } = useSymbols();
  const quotes = useMarket((s) => s.quotes);
  const s = overview?.summary;

  const movers = (symbols ?? [])
    .map((r) => ({ ...r, q: quotes[r.symbol] ?? r.liveQuote }))
    .filter((r) => r.q)
    .sort((a, b) => Math.abs(b.q!.changePct24h) - Math.abs(a.q!.changePct24h))
    .slice(0, 6);

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Welcome, {user?.fullName?.split(' ')[0]}</h1>
        <p className="text-xs text-txt-muted">WCU TRADE — Financial Markets Simulation Platform</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Virtual Equity" value={fmtUsd(s?.equity)} />
        <StatCard label="Total P&L" value={fmtSigned(s?.totalPnl)} sub={fmtPct(s?.totalReturnPct)} tone="pnl" />
        <StatCard label="Today's P&L" value={fmtSigned(s?.dailyPnl)} tone="pnl" />
        <StatCard label="Available Cash" value={fmtUsd(s?.available)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Top Movers</h2>
            <Link to="/markets" className="text-2xs text-wcu-bright">All markets →</Link>
          </div>
          <div className="space-y-1">
            {movers.map((m) => (
              <button key={m.symbol} onClick={() => navigate(`/trade/${m.symbol}`)} className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-panel-2">
                <span className="font-medium text-sm">{m.base}<span className="text-txt-faint">/{m.quote}</span></span>
                <span className="flex items-center gap-4 num text-sm">
                  <span>{fmtNum(m.q!.last, m.pricePrecision)}</span>
                  <span className={`${pnlColor(m.q!.changePct24h)} w-16 text-right`}>{fmtPct(m.q!.changePct24h)}</span>
                </span>
              </button>
            ))}
            {!movers.length && <div className="text-xs text-txt-faint py-6 text-center">Loading live markets…</div>}
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Open Positions</h2>
            <Link to="/portfolio" className="text-2xs text-wcu-bright">Portfolio →</Link>
          </div>
          {overview?.positions?.length ? (
            <div className="space-y-1">
              {overview.positions.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-2 py-2 rounded hover:bg-panel-2 text-sm">
                  <span className="font-medium">{p.symbol} <span className={`text-2xs ${p.side === 'LONG' ? 'text-profit' : 'text-loss'}`}>{p.side}</span></span>
                  <span className={`num ${pnlColor(p.unrealizedPnl)}`}>{fmtSigned(p.unrealizedPnl)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-txt-faint py-6 text-center">
              No open positions. <Link to="/trade" className="text-wcu-bright">Start trading →</Link>
            </div>
          )}
        </div>
      </div>

      <div className="panel p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Ready to trade?</div>
          <div className="text-xs text-txt-muted">Live BTC/USDT market data is streaming. Place your first simulated order.</div>
        </div>
        <button onClick={() => navigate('/trade/BTC-USDT')} className="btn-wcu">Open Trading Terminal</button>
      </div>
    </div>
  );
}
