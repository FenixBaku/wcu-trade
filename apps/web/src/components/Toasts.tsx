import { useEffect, useState } from 'react';
import { onToast } from '../lib/socket';

interface Toast {
  id: string;
  type: string;
  title: string;
  body: string;
  payload?: any;
}

const ACCENT: Record<string, string> = {
  TAKE_PROFIT_TRIGGERED: 'border-profit/50 bg-profit/10',
  STOP_LOSS_TRIGGERED: 'border-loss/50 bg-loss/10',
  POSITION_LIQUIDATED: 'border-loss/60 bg-loss/15',
  ORDER_FILLED: 'border-wcu/50 bg-wcu/10',
  LIMIT_FILLED: 'border-wcu/50 bg-wcu/10',
  MARGIN_WARNING: 'border-orange-500/50 bg-orange-500/10',
};

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return onToast((n) => {
      const t: Toast = { id: n.id ?? crypto.randomUUID(), type: n.type, title: n.title, body: n.body, payload: n.payload };
      setToasts((cur) => [t, ...cur].slice(0, 5));
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 6000);
    });
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50 space-y-2 w-80">
      {toasts.map((t) => (
        <div key={t.id} className={`panel border px-4 py-3 shadow-xl ${ACCENT[t.type] ?? 'border-border'}`}>
          <div className="text-2xs uppercase tracking-wide text-txt-faint">{t.type.replace(/_/g, ' ')}</div>
          <div className="font-semibold text-sm mt-0.5">{t.title}</div>
          <div className="text-xs text-txt-muted mt-0.5">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
