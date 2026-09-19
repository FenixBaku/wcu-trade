import type { Quote, Candle, OrderBook, TradePrint } from '@wcu/shared';

export type QuoteHandler = (q: Quote) => void;
export type TradeHandler = (t: TradePrint) => void;

/**
 * Provider abstraction (§8, §36). Adapters normalize a vendor's feed into our
 * canonical shapes. The application never couples to a single vendor.
 */
export interface IMarketDataProvider {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(internalSymbols: string[]): Promise<void>;
  unsubscribe(internalSymbols: string[]): Promise<void>;
  getQuote(internalSymbol: string): Promise<Quote | null>;
  getCandles(internalSymbol: string, timeframe: string, limit?: number): Promise<Candle[]>;
  getOrderBook(internalSymbol: string, depth?: number): Promise<OrderBook | null>;
  onQuote(handler: QuoteHandler): void;
  onTrade(handler: TradeHandler): void;
  isConnected(): boolean;
  lastMessageAt(): number | null;
}
