import { useMarket } from '../store/market';

const MAP: Record<string, { color: string; label: string }> = {
  LIVE: { color: 'bg-profit', label: 'LIVE' },
  DELAYED: { color: 'bg-yellow-400', label: 'DELAYED' },
  STALE: { color: 'bg-orange-500', label: 'STALE' },
  OFFLINE: { color: 'bg-loss', label: 'OFFLINE' },
};

export default function ConnectionStatus() {
  const health = useMarket((s) => s.health);
  const status = health?.status ?? 'OFFLINE';
  const m = MAP[status] ?? MAP.OFFLINE;
  return (
    <div className="flex items-center gap-2 text-xs" title={`Provider: ${health?.provider ?? '—'}`}>
      <span className="text-txt-faint uppercase tracking-wide text-2xs">Market Data</span>
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${m.color} ${status === 'LIVE' ? 'animate-pulse' : ''}`} />
        <span className="text-txt-muted font-medium">{m.label}</span>
      </span>
    </div>
  );
}
