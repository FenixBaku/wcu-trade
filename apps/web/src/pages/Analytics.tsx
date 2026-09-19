import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import StatCard from '../components/StatCard';
import { fmtUsd, fmtPct } from '../lib/format';

export default function Analytics() {
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: async () => (await api.get('/analytics/performance')).data, refetchInterval: 10000 });

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Performance Analytics</h1>
        <p className="text-xs text-txt-muted">Computed from immutable trade history and equity snapshots.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trades" value={data ? String(data.totalTrades) : '—'} />
        <StatCard label="Win Rate" value={data ? fmtPct((data.winRate ?? 0) * 100, 1) : '—'} />
        <StatCard label="Profit Factor" value={data?.profitFactor ?? '—'} />
        <StatCard label="Risk / Reward" value={data?.riskReward ?? '—'} />
        <StatCard label="Gross Profit" value={fmtUsd(data?.grossProfit)} tone="pnl" />
        <StatCard label="Gross Loss" value={fmtUsd(data ? `-${data.grossLoss}` : undefined)} tone="pnl" />
        <StatCard label="Avg Profit" value={fmtUsd(data?.averageProfit)} tone="pnl" />
        <StatCard label="Avg Loss" value={fmtUsd(data ? `-${data.averageLoss}` : undefined)} tone="pnl" />
        <StatCard label="Max Drawdown" value={data ? `${data.maxDrawdownPct}%` : '—'} />
        <StatCard label="Sharpe Ratio" value={data?.sharpe ?? '—'} />
        <StatCard label="Realized P&L" value={fmtUsd(data?.realizedPnl)} tone="pnl" />
      </div>
      <div className="panel p-4 text-xs text-txt-muted">
        <p>Additional metrics — Sortino, volatility, exposure, concentration, holding duration and long/short breakdown — are computed from the same trade and snapshot history and will render here as the module UI expands.</p>
      </div>
    </div>
  );
}
