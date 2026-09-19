import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { api } from '../lib/api';
import { useMarket } from '../store/market';
import type { Candle } from '@wcu/shared';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export default function Chart({ symbol, pricePrecision = 2 }: { symbol: string; pricePrecision?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandle = useRef<CandlestickData | null>(null);
  const [tf, setTf] = useState('15m');
  const [noData, setNoData] = useState(false);
  const quote = useMarket((s) => s.quotes[symbol]);

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8B93A1', fontFamily: 'JetBrains Mono' },
      grid: { vertLines: { color: '#1C222B' }, horzLines: { color: '#1C222B' } },
      rightPriceScale: { borderColor: '#232A34' },
      timeScale: { borderColor: '#232A34', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    const cs = chart.addCandlestickSeries({
      upColor: '#16C784', downColor: '#EA3943', borderVisible: false,
      wickUpColor: '#16C784', wickDownColor: '#EA3943',
      priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / 10 ** pricePrecision },
    });
    const vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', color: '#2b3340' });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    chartRef.current = chart;
    candleSeries.current = cs;
    volSeries.current = vs;
    return () => { chart.remove(); chartRef.current = null; };
  }, [pricePrecision]);

  // Load candles when symbol/timeframe changes.
  useEffect(() => {
    let cancelled = false;
    setNoData(false);
    (async () => {
      try {
        const { data } = await api.get<Candle[]>(`/markets/${symbol}/candles`, { params: { tf, limit: 400 } });
        if (cancelled || !candleSeries.current) return;
        if (!data.length) { setNoData(true); candleSeries.current.setData([]); volSeries.current?.setData([]); return; }
        const candles: CandlestickData[] = data.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
        candleSeries.current.setData(candles);
        volSeries.current?.setData(data.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? 'rgba(22,199,132,0.4)' : 'rgba(234,57,67,0.4)' })));
        lastCandle.current = candles[candles.length - 1] ?? null;
        chartRef.current?.timeScale().fitContent();
      } catch {
        if (!cancelled) setNoData(true);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, tf]);

  // Live update the last candle's close from quote stream.
  useEffect(() => {
    if (!quote || !candleSeries.current || !lastCandle.current) return;
    const lc = lastCandle.current;
    const updated: CandlestickData = {
      time: lc.time,
      open: lc.open,
      high: Math.max(lc.high, quote.last),
      low: Math.min(lc.low, quote.last),
      close: quote.last,
    };
    lastCandle.current = updated;
    candleSeries.current.update(updated);
  }, [quote]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        {TIMEFRAMES.map((t) => (
          <button key={t} onClick={() => setTf(t)} className={`px-2 py-1 text-2xs rounded ${tf === t ? 'bg-elevated text-txt' : 'text-txt-muted hover:text-txt'}`}>
            {t.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-2xs text-txt-faint pr-2">TradingView Lightweight Charts</span>
      </div>
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {noData && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center">
              <div className="text-txt-muted font-medium">MARKET DATA UNAVAILABLE</div>
              <div className="text-2xs text-txt-faint mt-1">No live provider configured for {symbol} in Phase 1</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
