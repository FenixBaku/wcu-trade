import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import type { Quote, Candle, OrderBook, TradePrint } from '@wcu/shared';
import { IMarketDataProvider, QuoteHandler, TradeHandler } from './provider.interface';
import { SymbolRegistryService } from './symbol-registry.service';

/**
 * Live Binance public market-data adapter (§8, Phase B).
 * Uses combined public streams (@ticker for quotes incl. best bid/ask, @trade for prints).
 * No API key required for public market data. Exponential-backoff reconnect.
 */
export class BinanceMarketDataProvider implements IMarketDataProvider {
  readonly name = 'binance';
  private readonly logger = new Logger('BinanceProvider');
  private ws: WebSocket | null = null;
  private subscribed = new Set<string>(); // internal symbols
  private quoteHandlers: QuoteHandler[] = [];
  private tradeHandlers: TradeHandler[] = [];
  private connected = false;
  private _lastMessageAt: number | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualClose = false;

  constructor(
    private readonly wsUrl: string,
    private readonly restUrl: string,
    private readonly registry: SymbolRegistryService,
  ) {}

  isConnected() {
    return this.connected;
  }
  lastMessageAt() {
    return this._lastMessageAt;
  }
  onQuote(h: QuoteHandler) {
    this.quoteHandlers.push(h);
  }
  onTrade(h: TradeHandler) {
    this.tradeHandlers.push(h);
  }

  async connect() {
    this.manualClose = false;
    // seed subscription set from registry (all binance-mapped symbols)
    for (const s of this.registry.internalSymbolsForProvider('binance')) this.subscribed.add(s);
    this.openSocket();
  }

  async disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  async subscribe(internalSymbols: string[]) {
    let changed = false;
    for (const s of internalSymbols) {
      if (this.registry.toProvider('binance', s) && !this.subscribed.has(s)) {
        this.subscribed.add(s);
        changed = true;
      }
    }
    if (changed) this.reopen();
  }

  async unsubscribe(internalSymbols: string[]) {
    let changed = false;
    for (const s of internalSymbols) if (this.subscribed.delete(s)) changed = true;
    if (changed) this.reopen();
  }

  private streamNames(): string[] {
    const names: string[] = [];
    for (const internal of this.subscribed) {
      const p = this.registry.toProvider('binance', internal);
      if (!p) continue;
      const low = p.toLowerCase();
      names.push(`${low}@ticker`, `${low}@trade`);
    }
    return names;
  }

  private openSocket() {
    const streams = this.streamNames();
    if (streams.length === 0) {
      this.logger.warn('No Binance streams to subscribe (no mapped symbols)');
      return;
    }
    const url = `${this.wsUrl}/stream?streams=${streams.join('/')}`;
    this.logger.log(`Connecting Binance WS (${this.subscribed.size} symbols)`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this._lastMessageAt = Date.now();
      this.logger.log('Binance WS connected');
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      this._lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(raw.toString());
        const stream: string = msg.stream;
        const data = msg.data;
        if (!stream || !data) return;
        if (stream.endsWith('@ticker')) this.handleTicker(data);
        else if (stream.endsWith('@trade')) this.handleTrade(data);
      } catch {
        /* ignore malformed frame */
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (!this.manualClose) this.scheduleReconnect();
    });

    this.ws.on('error', (e) => {
      this.logger.warn(`Binance WS error: ${(e as Error).message}`);
      this.ws?.close();
    });
  }

  private reopen() {
    if (this.manualClose) return;
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.openSocket();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    this.logger.warn(`Binance WS reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private handleTicker(d: any) {
    const internal = this.registry.toInternal('binance', d.s);
    if (!internal) return;
    const q: Quote = {
      symbol: internal,
      bid: parseFloat(d.b),
      ask: parseFloat(d.a),
      last: parseFloat(d.c),
      changePct24h: parseFloat(d.P),
      high24h: parseFloat(d.h),
      low24h: parseFloat(d.l),
      volume24h: parseFloat(d.q), // quote volume (USD-ish)
      provider: 'binance',
      ts: d.E ?? Date.now(),
      synthetic: false,
    };
    for (const h of this.quoteHandlers) h(q);
  }

  private handleTrade(d: any) {
    const internal = this.registry.toInternal('binance', d.s);
    if (!internal) return;
    const t: TradePrint = {
      symbol: internal,
      price: parseFloat(d.p),
      amount: parseFloat(d.q),
      side: d.m ? 'SELL' : 'BUY', // m = buyer is market maker => aggressive sell
      ts: d.T ?? Date.now(),
    };
    for (const h of this.tradeHandlers) h(t);
  }

  async getQuote(internalSymbol: string): Promise<Quote | null> {
    const ps = this.registry.toProvider('binance', internalSymbol);
    if (!ps) return null;
    try {
      const res = await fetch(`${this.restUrl}/api/v3/ticker/24hr?symbol=${ps}`);
      if (!res.ok) return null;
      const d: any = await res.json();
      return {
        symbol: internalSymbol,
        bid: parseFloat(d.bidPrice),
        ask: parseFloat(d.askPrice),
        last: parseFloat(d.lastPrice),
        changePct24h: parseFloat(d.priceChangePercent),
        high24h: parseFloat(d.highPrice),
        low24h: parseFloat(d.lowPrice),
        volume24h: parseFloat(d.quoteVolume),
        provider: 'binance',
        ts: Date.now(),
        synthetic: false,
      };
    } catch {
      return null;
    }
  }

  async getCandles(internalSymbol: string, timeframe: string, limit = 500): Promise<Candle[]> {
    const ps = this.registry.toProvider('binance', internalSymbol);
    if (!ps) return [];
    try {
      const res = await fetch(
        `${this.restUrl}/api/v3/klines?symbol=${ps}&interval=${timeframe}&limit=${limit}`,
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as any[];
      return rows.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }));
    } catch {
      return [];
    }
  }

  async getOrderBook(internalSymbol: string, depth = 20): Promise<OrderBook | null> {
    const ps = this.registry.toProvider('binance', internalSymbol);
    if (!ps) return null;
    try {
      const res = await fetch(`${this.restUrl}/api/v3/depth?symbol=${ps}&limit=${depth}`);
      if (!res.ok) return null;
      const d: any = await res.json();
      return {
        symbol: internalSymbol,
        bids: d.bids.map((b: string[]) => ({ price: parseFloat(b[0]), amount: parseFloat(b[1]) })),
        asks: d.asks.map((a: string[]) => ({ price: parseFloat(a[0]), amount: parseFloat(a[1]) })),
        native: true,
        ts: Date.now(),
      };
    } catch {
      return null;
    }
  }
}
