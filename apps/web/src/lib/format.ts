export function fmtNum(v: number | string | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtUsd(v: number | string | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtSigned(v: number | string | null | undefined, dp = 2, prefix = '$'): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (!isFinite(n as number)) return '—';
  const sign = (n as number) >= 0 ? '+' : '-';
  return `${sign}${prefix}${Math.abs(n as number).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtPct(v: number | string | null | undefined, dp = 2): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (!isFinite(n as number)) return '—';
  const sign = (n as number) >= 0 ? '+' : '';
  return `${sign}${(n as number).toFixed(dp)}%`;
}

export const pnlColor = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (!n) return 'text-txt-muted';
  return (n as number) >= 0 ? 'text-profit' : 'text-loss';
};

export function fmtCompact(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (!isFinite(n as number)) return '—';
  return (n as number).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}
