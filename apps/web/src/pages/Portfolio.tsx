import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePortfolio } from '../store/portfolio';
import StatCard from '../components/StatCard';
import EquityCurve from '../components/EquityCurve';
import BottomPanel from '../components/BottomPanel';
import { fmtUsd, fmtSigned, fmtPct } from '../lib/format';
import { useEffect } from 'react';

export default function Portfolio() {
  const setP = usePortfolio((s) => s.set);
  const summary = usePortfolio((s) => s.summary);

  const { data } = useQuery({ queryKey: ['portfolio'], queryFn: async () => (await api.get('/portfolio')).data, refetchInterval: 8000 });
  const { data: curve = [] } = useQuery({ queryKey: ['equity-curve'], queryFn: async () => (await api.get('/portfolio/equity-curve', { params: { range: 'ALL' } })).data, refetchInterval: 15000 });

  useEffect(() => { if (data) setP({ summary: data.summary, positions: data.positions }); }, [data, setP]);
  const s = summary ?? data?.summary;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <p className="text-xs text-txt-muted">Virtual account · derived from your ledger and live marks</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard label="Total Equity" value={fmtUsd(s?.equity)} />
        <StatCard label="Total P&L" value={fmtSigned(s?.totalPnl)} sub={fmtPct(s?.totalReturnPct)} tone="pnl" />
        <StatCard label="Today's P&L" value={fmtSigned(s?.dailyPnl)} tone="pnl" />
        <StatCard label="Available Cash" value={fmtUsd(s?.available)} />
        <StatCard label="Used Margin" value={fmtUsd(s?.usedMargin)} />
        <StatCard label="Unrealized P&L" value={fmtSigned(s?.unrealizedPnl)} tone="pnl" />
        <StatCard label="Realized P&L" value={fmtSigned(s?.realizedPnl)} tone="pnl" />
      </div>

      <div className="panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Equity Curve</h2>
          <span className="text-2xs text-txt-faint num">Margin Level: {s?.marginLevel ? `${s.marginLevel}%` : '—'}</span>
        </div>
        <div className="h-64"><EquityCurve data={curve} /></div>
      </div>

      <div className="panel h-80 overflow-hidden">
        <BottomPanel />
      </div>
    </div>
  );
}
