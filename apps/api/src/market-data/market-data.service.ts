import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Quote, Candle, OrderBook, TradePrint, ProviderHealth, MarketDataStatus } from '@wcu/shared';
import { RedisService } from '../redis/redis.service';
import { SymbolRegistryService } from './symbol-registry.service';
import { IMarketDataProvider } from './provider.interface';
import { BinanceMarketDataProvider } from './binance.provider';
import { WS_TOPICS, D } from '@wcu/shared';

type QuoteListener = (q: Quote) => void;
type TradeListener = (t: TradePrint) => void;

/**
 * Collector + Normalizer + fan-out (§8, §36). Maintains ONE upstream connection
 * and distributes to all clients via Redis pub/sub and in-process listeners.
 */
@Injectable()
export class MarketDataService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MarketDataService.name);
  private provider!: IMarketDataProvider;
  private latest = new Map<string, Quote>();
  private lastTrades = new Map<string, TradePrint[]>();
  private quoteListeners: QuoteListener[] = [];
  private tradeListeners: TradeListener[] = [];
  private staleThreshold: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly registry: SymbolRegistryService,
  ) {
    this.staleThreshold = this.config.get<number>('marketData.quoteStaleThresholdMs')!;
  }

  async onModuleInit() {
    const wsUrl = this.config.get<string>('marketData.binanceWsUrl')!;
    const restUrl = this.config.get<string>('marketData.binanceRestUrl')!;
    this.provider = new BinanceMarketDataProvider(wsUrl, restUrl, this.registry);

    this.provider.onQuote((q) => this.ingestQuote(q));
    this.provider.onTrade((t) => this.ingestTrade(t));

    try {
      await this.provider.connect();
    } catch (e) {
      this.logger.error(`Provider connect failed: ${(e as Error).message}`);
    }
  }

  async onApplicationShutdown() {
    await this.provider?.disconnect();
  }

  /**
   * Reload the symbol registry and ensure the provider is subscribed to all mapped
   * symbols. This lets a freshly-seeded database start streaming without restarting
   * the API. subscribe() diff-checks internally, so this is cheap when nothing changed.
   */
  @Interval(15000)
  async ensureSubscriptions() {
    try {
      await this.registry.reload();
      const symbols = this.registry.internalSymbolsForProvider('binance');
      if (symbols.length) await this.provider?.subscribe(symbols);
    } catch (e) {
      this.logger.warn(`ensureSubscriptions failed: ${(e as Error).message}`);
    }
  }

  // ---- ingestion ----
  private ingestQuote(q: Quote) {
    this.latest.set(q.symbol, q);
    void this.redis.cacheSet(`quote:${q.symbol}`, q, 30);
    void this.redis.publish(WS_TOPICS.quote(q.symbol), q);
    for (const l of this.quoteListeners) l(q);
  }

  private ingestTrade(t: TradePrint) {
    const arr = this.lastTrades.get(t.symbol) ?? [];
    arr.unshift(t);
    if (arr.length > 50) arr.pop();
    this.lastTrades.set(t.symbol, arr);
    void this.redis.publish(WS_TOPICS.trade(t.symbol), t);
    for (const l of this.tradeListeners) l(t);
  }

  // ---- in-process subscriptions (gateway, trigger engine) ----
  onQuote(l: QuoteListener) {
    this.quoteListeners.push(l);
  }
  onTrade(l: TradeListener) {
    this.tradeListeners.push(l);
  }

  // ---- reads ----
  getLatest(symbol: string): Quote | null {
    return this.latest.get(symbol) ?? null;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const mem = this.latest.get(symbol);
    if (mem) return mem;
    const cached = await this.redis.cacheGet<Quote>(`quote:${symbol}`);
    if (cached) return cached;
    // fall back to REST snapshot (also warms cache)
    const q = await this.provider.getQuote(symbol);
    if (q) this.ingestQuote(q);
    return q;
  }

  getRecentTrades(symbol: string): TradePrint[] {
    return this.lastTrades.get(symbol) ?? [];
  }

  getCandles(symbol: string, timeframe: string, limit = 500): Promise<Candle[]> {
    return this.provider.getCandles(symbol, timeframe, limit);
  }

  /** Native order book if the provider offers it; otherwise a synthetic one, clearly labelled. */
  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook | null> {
    const native = await this.provider.getOrderBook(symbol, depth);
    if (native) return native;
    return this.buildSyntheticBook(symbol, depth);
  }

  private buildSyntheticBook(symbol: string, depth: number): OrderBook | null {
    const q = this.latest.get(symbol);
    if (!q) return null;
    // Derive a shallow synthetic book around bid/ask. Clearly flagged native:false (§ no-fake-data).
    const bids: { price: number; amount: number }[] = [];
    const asks: { price: number; amount: number }[] = [];
    const step = D(q.ask).minus(q.bid).abs().div(2).toNumber() || q.last * 0.0001;
    for (let i = 0; i < depth; i++) {
      const amt = Math.max(0.001, Math.random() * 2);
      bids.push({ price: q.bid - step * i, amount: parseFloat(amt.toFixed(4)) });
      asks.push({ price: q.ask + step * i, amount: parseFloat(amt.toFixed(4)) });
    }
    return { symbol, bids, asks, native: false, ts: q.ts };
  }

  // ---- freshness / health ----
  isFresh(symbol: string): boolean {
    const q = this.latest.get(symbol);
    if (!q) return false;
    return Date.now() - q.ts <= this.staleThreshold;
  }

  status(): MarketDataStatus {
    const last = this.provider?.lastMessageAt();
    if (!this.provider?.isConnected() || !last) return 'OFFLINE';
    const age = Date.now() - last;
    if (age <= this.staleThreshold) return 'LIVE';
    if (age <= this.staleThreshold * 4) return 'DELAYED';
    return 'STALE';
  }

  health(): ProviderHealth {
    const last = this.provider?.lastMessageAt() ?? null;
    return {
      provider: this.provider?.name ?? 'none',
      connected: this.provider?.isConnected() ?? false,
      status: this.status(),
      lastMessageAt: last,
      latencyMs: last ? Date.now() - last : null,
    };
  }
}
