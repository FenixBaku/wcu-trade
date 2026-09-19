import { pnlColor } from '../lib/format';

export default function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pnl' | 'plain';
}) {
  const color = tone === 'pnl' ? pnlColor(value) : 'text-txt';
  return (
    <div className="panel p-4">
      <div className="text-2xs text-txt-faint uppercase tracking-wide">{label}</div>
      <div className={`num text-xl font-semibold mt-1 ${color}`}>{value}</div>
      {sub && <div className={`num text-xs mt-0.5 ${tone === 'pnl' ? pnlColor(sub) : 'text-txt-muted'}`}>{sub}</div>}
    </div>
  );
}
