import type {
  AssetClass,
  MarketDataStatus,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  Role,
} from './enums';

export interface Quote {
  symbol: string; // internal symbol e.g. BTC-USDT
  bid: number;
  ask: number;
  last: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  provider: string;
  ts: number; // provider/collector timestamp (ms)
  synthetic?: boolean; // true if bid/ask are derived, not exchange-native
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DepthLevel {
  price: number;
  amount: number;
}
export interface OrderBook {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  native: boolean; // false = synthetic/derived
  ts: number;
}

export interface TradePrint {
  symbol: string;
  price: number;
  amount: number;
  side: OrderSide;
  ts: number;
}

export interface MarketSymbol {
  symbol: string;
  base: string;
  quote: string;
  name: string;
  assetClass: AssetClass;
  pricePrecision: number;
  qtyPrecision: number;
}

export interface AccountSummary {
  cashBalance: string;
  equity: string;
  available: string;
  usedMargin: string;
  freeMargin: string;
  unrealizedPnl: string;
  realizedPnl: string;
  totalPnl: string;
  dailyPnl: string;
  totalReturnPct: string;
  marginLevel: string | null;
  currency: string;
  startingBalance: string;
}

export interface PositionView {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: string;
  avgEntryPrice: string;
  markPrice: string;
  marketValue: string;
  unrealizedPnl: string;
  realizedPnl: string;
  roi: string;
  usedMargin: string;
  leverage: number;
  liquidationPrice: string | null;
  takeProfitPrice: string | null;
  stopLossPrice: string | null;
}

export interface OrderView {
  id: string;
  symbol: string;
  side: OrderSide;
  positionSide: PositionSide;
  type: OrderType;
  status: OrderStatus;
  quantity: string;
  requestedPrice: string | null;
  limitPrice: string | null;
  stopPrice: string | null;
  takeProfitPrice: string | null;
  stopLossPrice: string | null;
  filledQuantity: string;
  averageFillPrice: string | null;
  fee: string;
  slippage: string;
  createdAt: string;
  filledAt: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
}

export interface ProviderHealth {
  provider: string;
  connected: boolean;
  status: MarketDataStatus;
  lastMessageAt: number | null;
  latencyMs: number | null;
}
