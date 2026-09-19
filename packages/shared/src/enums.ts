// Shared domain enums — mirror the Prisma schema exactly (values kept as string unions
// so both the NestJS API and the React web app import the same source of truth).

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  UNIVERSITY_ADMIN: 'UNIVERSITY_ADMIN',
  INSTRUCTOR: 'INSTRUCTOR',
  STUDENT: 'STUDENT',
  OBSERVER: 'OBSERVER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AssetClass = {
  CRYPTO: 'CRYPTO',
  FOREX: 'FOREX',
  METAL: 'METAL',
  STOCK: 'STOCK',
  INDEX: 'INDEX',
  COMMODITY: 'COMMODITY',
  ETF: 'ETF',
} as const;
export type AssetClass = (typeof AssetClass)[keyof typeof AssetClass];

export const OrderSide = { BUY: 'BUY', SELL: 'SELL' } as const;
export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

export const PositionSide = { LONG: 'LONG', SHORT: 'SHORT' } as const;
export type PositionSide = (typeof PositionSide)[keyof typeof PositionSide];

export const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
  STOP_LIMIT: 'STOP_LIMIT',
  TRAILING_STOP: 'TRAILING_STOP',
  OCO: 'OCO',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  NEW: 'NEW',
  OPEN: 'OPEN',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  TRIGGERED: 'TRIGGERED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const MarginMode = { CROSS: 'CROSS', ISOLATED: 'ISOLATED' } as const;
export type MarginMode = (typeof MarginMode)[keyof typeof MarginMode];

export const LedgerType = {
  INITIAL_DEPOSIT: 'INITIAL_DEPOSIT',
  TRADE_BUY: 'TRADE_BUY',
  TRADE_SELL: 'TRADE_SELL',
  COMMISSION: 'COMMISSION',
  REALIZED_PNL: 'REALIZED_PNL',
  MARGIN_RESERVE: 'MARGIN_RESERVE',
  MARGIN_RELEASE: 'MARGIN_RELEASE',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  ACCOUNT_RESET: 'ACCOUNT_RESET',
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

export const MarketDataStatus = {
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
} as const;
export type MarketDataStatus = (typeof MarketDataStatus)[keyof typeof MarketDataStatus];

export const NotificationType = {
  ORDER_FILLED: 'ORDER_FILLED',
  LIMIT_FILLED: 'LIMIT_FILLED',
  STOP_LOSS_TRIGGERED: 'STOP_LOSS_TRIGGERED',
  TAKE_PROFIT_TRIGGERED: 'TAKE_PROFIT_TRIGGERED',
  MARGIN_WARNING: 'MARGIN_WARNING',
  POSITION_LIQUIDATED: 'POSITION_LIQUIDATED',
  COMPETITION_STARTED: 'COMPETITION_STARTED',
  COMPETITION_FINISHED: 'COMPETITION_FINISHED',
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  MARKET_DATA_RECONNECTED: 'MARKET_DATA_RECONNECTED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
