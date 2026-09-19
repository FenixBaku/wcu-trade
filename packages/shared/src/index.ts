export * from './enums';
export * from './money';
export * from './types';

export const WS_TOPICS = {
  quote: (sym: string) => `market.quote.${sym}`,
  trade: (sym: string) => `market.trade.${sym}`,
  depth: (sym: string) => `market.depth.${sym}`,
  candle: (sym: string, tf: string) => `market.candle.${sym}.${tf}`,
  portfolio: (userId: string) => `portfolio.${userId}`,
  orders: (userId: string) => `orders.${userId}`,
  notifications: (userId: string) => `notifications.${userId}`,
} as const;

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
