import { useEffect, useRef } from 'react';
import { createChart, IChartApi, UTCTimestamp } from 'lightweight-charts';

export default function EquityCurve({ data }: { data: { ts: string; equity: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = createChart(ref.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8B93A1', fontFamily: 'JetBrains Mono' },
      grid: { vertLines: { color: '#1C222B' }, horzLines: { color: '#1C222B' } },
      rightPriceScale: { borderColor: '#232A34' },
      timeScale: { borderColor: '#232A34', timeVisible: true },
      autoSize: true,
    });
    const s = c.addAreaSeries({ lineColor: '#2D6BFF', topColor: 'rgba(45,107,255,0.25)', bottomColor: 'rgba(45,107,255,0.02)', lineWidth: 2 });
    chart.current = c;
    (c as any)._series = s;
    return () => c.remove();
  }, []);

  useEffect(() => {
    const s = (chart.current as any)?._series;
    if (!s) return;
    const seen = new Set<number>();
    const points = data
      .map((d) => ({ time: Math.floor(new Date(d.ts).getTime() / 1000) as UTCTimestamp, value: parseFloat(d.equity) }))
      .filter((p) => { if (seen.has(p.time)) return false; seen.add(p.time); return true; });
    s.setData(points);
    chart.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div className="relative h-full">
      <div ref={ref} className="absolute inset-0" />
      {data.length < 2 && (
        <div className="absolute inset-0 grid place-items-center text-2xs text-txt-faint pointer-events-none">
          Equity snapshots appear here as you trade
        </div>
      )}
    </div>
  );
}
