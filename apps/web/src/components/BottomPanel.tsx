import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePortfolio } from '../store/portfolio';
import { useMarket } from '../store/market';
import { fmtNum, fmtUsd, fmtSigned, pnlColor } from '../lib/format';
import type { PositionView } from '@wcu/shared';

const TABS = ['Positions', 'Open Orders', 'Order History', 'Trades'] as const;

export default function BottomPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Positions');
  const positions = usePortfolio((s) => s.positions);
  const dirty = usePortfolio((s) => s.ordersDirty);
  const qc = useQueryClient();

  const closeAll = useMutation({
    mutationFn: async () => (await api.post('/positions/close-all')).data,
    onSuccess: () => { usePortfolio.getState().bumpOrders(); qc.invalidateQueries({ queryKey: ['portfolio-summary'] }); },
  });
  const cancelAll = useMutation({
    mutationFn: async () => (await api.post('/orders/cancel-all')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['open-orders'] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b border-border px-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs ${tab === t ? 'text-txt border-b-2 border-wcu' : 'text-txt-muted'}`}>
            {t}
            {t === 'Positions' && positions.length > 0 && <span className="ml-1.5 text-2xs bg-elevated px-1.5 rounded-full">{positions.length}</span>}
          </button>
        ))}
        <div className="ml-auto flex gap-2 pr-1">
          {tab === 'Positions' && positions.length > 0 && (
            <button onClick={() => closeAll.mutate()} className="btn-ghost text-2xs border border-border">Close All</button>
          )}
          {tab === 'Open Orders' && (
            <button onClick={() => cancelAll.mutate()} className="btn-ghost text-2xs border border-border">Cancel All</button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'Positions' && <Positions positions={positions} />}
        {tab === 'Open Orders' && <OpenOrders key={dirty} />}
        {tab === 'Order History' && <OrderHistory key={dirty} />}
        {tab === 'Trades' && <Trades key={dirty} />}
      </div>
    </div>
  );
}

function Positions({ positions }: { positions: PositionView[] }) {
  const quotes = useMarket((s) => s.quotes);
  const qc = useQueryClient();
  const close = useMutation({
    mutationFn: async (id: string) => (await api.post(`/positions/${id}/close`)).data,
    onSuccess: () => { usePortfolio.getState().bumpOrders(); qc.invalidateQueries({ queryKey: ['portfolio-summary'] }); },
  });

  if (!positions.length) return <Empty text="No open positions" />;
  return (
    <table className="w-full text-xs num">
      <Thead cols={['Symbol', 'Side', 'Size', 'Entry', 'Mark', 'Liq.', 'Margin', 'P&L', 'ROI', 'TP/SL', '']} />
      <tbody>
        {positions.map((p) => {
          const mark = quotes[p.symbol]?.last ?? parseFloat(p.markPrice);
          const upnl = p.side === 'LONG' ? (mark - parseFloat(p.avgEntryPrice)) * parseFloat(p.quantity) : (parseFloat(p.avgEntryPrice) - mark) * parseFloat(p.quantity);
          const roi = parseFloat(p.usedMargin) ? (upnl / parseFloat(p.usedMargin)) * 100 : 0;
          return (
            <tr key={p.id} className="border-b border-border-soft hover:bg-panel-2">
              <Td className="font-sans font-medium text-txt">{p.symbol}</Td>
              <Td><span className={p.side === 'LONG' ? 'text-profit' : 'text-loss'}>{p.side}</span> <span className="text-txt-faint">{p.leverage}x</span></Td>
              <Td>{fmtNum(p.quantity, 4)}</Td>
              <Td>{fmtNum(p.avgEntryPrice)}</Td>
              <Td>{fmtNum(mark)}</Td>
              <Td className="text-txt-muted">{p.liquidationPrice && parseFloat(p.liquidationPrice) > 0 ? fmtNum(p.liquidationPrice) : '—'}</Td>
              <Td>{fmtUsd(p.usedMargin)}</Td>
              <Td className={pnlColor(upnl)}>{fmtSigned(upnl)}</Td>
              <Td className={pnlColor(roi)}>{roi >= 0 ? '+' : ''}{roi.toFixed(2)}%</Td>
              <Td className="text-txt-faint text-2xs">
                {p.takeProfitPrice ? `TP ${fmtNum(p.takeProfitPrice)}` : ''}{p.takeProfitPrice && p.stopLossPrice ? ' · ' : ''}{p.stopLossPrice ? `SL ${fmtNum(p.stopLossPrice)}` : ''}
                {!p.takeProfitPrice && !p.stopLossPrice ? '—' : ''}
              </Td>
              <Td><button onClick={() => close.mutate(p.id)} className="btn-ghost text-2xs border border-border hover:border-loss hover:text-loss">Close</button></Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OpenOrders() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['open-orders'], queryFn: async () => (await api.get('/orders/open')).data, refetchInterval: 4000 });
  const cancel = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/orders/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['open-orders'] }),
  });
  if (!data?.length) return <Empty text="No open orders" />;
  return (
    <table className="w-full text-xs num">
      <Thead cols={['Time', 'Symbol', 'Side', 'Type', 'Price', 'Qty', 'TP/SL', 'Status', '']} />
      <tbody>
        {data.map((o: any) => (
          <tr key={o.id} className="border-b border-border-soft hover:bg-panel-2">
            <Td className="text-txt-faint">{new Date(o.createdAt).toLocaleTimeString('en-US', { hour12: false })}</Td>
            <Td className="font-sans text-txt">{o.symbol}</Td>
            <Td><span className={o.side === 'BUY' ? 'text-profit' : 'text-loss'}>{o.side}</span></Td>
            <Td className="text-txt-muted">{o.type}</Td>
            <Td>{fmtNum(o.limitPrice ?? o.stopPrice ?? o.requestedPrice)}</Td>
            <Td>{fmtNum(o.quantity, 4)}</Td>
            <Td className="text-txt-faint text-2xs">{o.takeProfitPrice ? `TP ${fmtNum(o.takeProfitPrice)}` : ''} {o.stopLossPrice ? `SL ${fmtNum(o.stopLossPrice)}` : ''}</Td>
            <Td className="text-wcu-bright">{o.status}</Td>
            <Td><button onClick={() => cancel.mutate(o.id)} className="btn-ghost text-2xs border border-border hover:text-loss hover:border-loss">Cancel</button></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrderHistory() {
  const { data } = useQuery({ queryKey: ['order-history'], queryFn: async () => (await api.get('/orders/history')).data });
  if (!data?.length) return <Empty text="No order history" />;
  return (
    <table className="w-full text-xs num">
      <Thead cols={['Time', 'Symbol', 'Side', 'Type', 'Fill', 'Qty', 'Fee', 'Status']} />
      <tbody>
        {data.map((o: any) => (
          <tr key={o.id} className="border-b border-border-soft hover:bg-panel-2">
            <Td className="text-txt-faint">{new Date(o.createdAt).toLocaleString('en-US', { hour12: false })}</Td>
            <Td className="font-sans text-txt">{o.symbol}</Td>
            <Td><span className={o.side === 'BUY' ? 'text-profit' : 'text-loss'}>{o.side}</span></Td>
            <Td className="text-txt-muted">{o.type}</Td>
            <Td>{fmtNum(o.averageFillPrice)}</Td>
            <Td>{fmtNum(o.quantity, 4)}</Td>
            <Td className="text-txt-muted">{fmtUsd(o.fee)}</Td>
            <Td className={o.status === 'FILLED' ? 'text-profit' : 'text-txt-muted'}>{o.status}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Trades() {
  const { data } = useQuery({ queryKey: ['trades'], queryFn: async () => (await api.get('/trades')).data });
  if (!data?.length) return <Empty text="No trades yet" />;
  return (
    <table className="w-full text-xs num">
      <Thead cols={['Time', 'Symbol', 'Side', 'Qty', 'Fill', 'Fee', 'Realized P&L']} />
      <tbody>
        {data.map((t: any) => (
          <tr key={t.id} className="border-b border-border-soft hover:bg-panel-2">
            <Td className="text-txt-faint">{new Date(t.executedAt).toLocaleString('en-US', { hour12: false })}</Td>
            <Td className="font-sans text-txt">{t.symbol}</Td>
            <Td><span className={t.side === 'BUY' ? 'text-profit' : 'text-loss'}>{t.side}</span></Td>
            <Td>{fmtNum(t.quantity, 4)}</Td>
            <Td>{fmtNum(t.fillPrice)}</Td>
            <Td className="text-txt-muted">{fmtUsd(t.commission)}</Td>
            <Td className={pnlColor(t.realizedPnl)}>{parseFloat(t.realizedPnl) ? fmtSigned(t.realizedPnl) : '—'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Thead = ({ cols }: { cols: string[] }) => (
  <thead className="sticky top-0 bg-panel">
    <tr className="text-2xs text-txt-faint uppercase tracking-wide">
      {cols.map((c, i) => <th key={i} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-left'}`}>{c}</th>)}
    </tr>
  </thead>
);
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
const Empty = ({ text }: { text: string }) => <div className="p-8 text-center text-xs text-txt-faint">{text}</div>;
