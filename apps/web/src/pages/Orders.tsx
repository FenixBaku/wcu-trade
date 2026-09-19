import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtNum, fmtUsd, fmtSigned, pnlColor } from '../lib/format';

const TABS = ['Open Orders', 'Order History', 'Trade History', 'Transactions'] as const;

export default function Orders() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Open Orders');
  return (
    <div className="h-full overflow-y-auto p-5">
      <h1 className="text-lg font-semibold mb-1">Orders</h1>
      <p className="text-xs text-txt-muted mb-4">Full audit trail — orders, fills and ledger transactions are immutable.</p>
      <div className="flex gap-1 border-b border-border mb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? 'text-txt border-b-2 border-wcu' : 'text-txt-muted'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Open Orders' && <Table url="/orders/open" cols={['createdAt|time', 'symbol', 'side|side', 'type', 'quantity|qty', 'status|status']} />}
      {tab === 'Order History' && <Table url="/orders/history" cols={['createdAt|time', 'symbol', 'side|side', 'type', 'averageFillPrice|num', 'quantity|qty', 'fee|usd', 'status|status']} />}
      {tab === 'Trade History' && <Table url="/trades" cols={['executedAt|time', 'symbol', 'side|side', 'quantity|qty', 'fillPrice|num', 'commission|usd', 'realizedPnl|pnl']} />}
      {tab === 'Transactions' && <Table url="/transactions" cols={['createdAt|time', 'type', 'amount|pnl', 'balanceAfter|usd', 'memo']} />}
    </div>
  );
}

function Table({ url, cols }: { url: string; cols: string[] }) {
  const { data } = useQuery({ queryKey: ['orders-page', url], queryFn: async () => (await api.get(url)).data, refetchInterval: 5000 });
  if (!data?.length) return <div className="p-8 text-center text-xs text-txt-faint">No records</div>;
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-xs num">
        <thead>
          <tr className="text-2xs text-txt-faint uppercase tracking-wide border-b border-border">
            {cols.map((c) => <th key={c} className="px-3 py-2 text-left font-medium">{c.split('|')[0].replace(/([A-Z])/g, ' $1')}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, i: number) => (
            <tr key={i} className="border-b border-border-soft hover:bg-panel-2">
              {cols.map((c) => {
                const [key, kind] = c.split('|');
                return <td key={c} className="px-3 py-1.5">{render(row[key], kind, row)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function render(v: any, kind: string | undefined, row: any) {
  if (v == null) return <span className="text-txt-faint">—</span>;
  switch (kind) {
    case 'time': return <span className="text-txt-faint">{new Date(v).toLocaleString('en-US', { hour12: false })}</span>;
    case 'side': return <span className={v === 'BUY' ? 'text-profit' : 'text-loss'}>{v}</span>;
    case 'num': return fmtNum(v);
    case 'qty': return fmtNum(v, 4);
    case 'usd': return <span className="text-txt-muted">{fmtUsd(v)}</span>;
    case 'pnl': return <span className={pnlColor(v)}>{parseFloat(v) ? fmtSigned(v) : '—'}</span>;
    case 'status': return <span className={v === 'FILLED' ? 'text-profit' : v === 'OPEN' ? 'text-wcu-bright' : 'text-txt-muted'}>{v}</span>;
    default: return <span className="text-txt font-sans">{String(v)}</span>;
  }
}
