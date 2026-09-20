// Centralized typed configuration. Read from env with sane dev defaults.
export interface AppConfig {
  env: string;
  apiPort: number;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  redis: { host: string; port: number; url: string };
  marketData: {
    provider: string;
    binanceWsUrl: string;
    binanceRestUrl: string;
    quoteStaleThresholdMs: number;
  };
  sim: {
    defaultStartingBalance: string;
    baseCurrency: string;
    makerFeeBps: number;
    takerFeeBps: number;
    slippageModel: string;
    slippageBps: number;
    defaultSpreadBps: number;
    defaultMaxLeverage: number;
  };
  flags: Record<string, boolean>;
  demoDevData: boolean;
  corsOrigins: string[];
}

const bool = (v: string | undefined, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  // Render/Heroku inject PORT; fall back to API_PORT then 4000 for local dev.
  apiPort: parseInt(process.env.PORT ?? process.env.API_PORT ?? '4000', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  marketData: {
    provider: process.env.MARKET_DATA_PROVIDER ?? 'binance',
    // Public market-data endpoints (data.binance.vision). Unlike api.binance.com these are
    // not geo-blocked (api.binance.com returns HTTP 451 from US IPs, e.g. cloud regions).
    binanceWsUrl: process.env.BINANCE_WS_URL ?? 'wss://data-stream.binance.vision',
    binanceRestUrl: process.env.BINANCE_REST_URL ?? 'https://data-api.binance.vision',
    quoteStaleThresholdMs: parseInt(process.env.QUOTE_STALE_THRESHOLD_MS ?? '5000', 10),
  },
  sim: {
    defaultStartingBalance: process.env.DEFAULT_STARTING_BALANCE ?? '100000',
    baseCurrency: process.env.BASE_CURRENCY ?? 'USD',
    makerFeeBps: parseInt(process.env.DEFAULT_MAKER_FEE_BPS ?? '10', 10),
    takerFeeBps: parseInt(process.env.DEFAULT_TAKER_FEE_BPS ?? '10', 10),
    slippageModel: process.env.SLIPPAGE_MODEL ?? 'FIXED_BPS',
    slippageBps: parseInt(process.env.SLIPPAGE_BPS ?? '2', 10),
    defaultSpreadBps: parseInt(process.env.DEFAULT_SPREAD_BPS ?? '4', 10),
    defaultMaxLeverage: parseInt(process.env.DEFAULT_MAX_LEVERAGE ?? '10', 10),
  },
  flags: {
    ENABLE_MARGIN: bool(process.env.ENABLE_MARGIN, true),
    ENABLE_SHORT_SELLING: bool(process.env.ENABLE_SHORT_SELLING, true),
    ENABLE_COMPETITION: bool(process.env.ENABLE_COMPETITION, true),
    ENABLE_ASSIGNMENTS: bool(process.env.ENABLE_ASSIGNMENTS, true),
    ENABLE_STOCKS: bool(process.env.ENABLE_STOCKS, true),
    ENABLE_FOREX: bool(process.env.ENABLE_FOREX, true),
    ENABLE_CRYPTO: bool(process.env.ENABLE_CRYPTO, true),
    ENABLE_FUTURES_SIMULATION: bool(process.env.ENABLE_FUTURES_SIMULATION, false),
    ENABLE_BROKER_INTEGRATION: bool(process.env.ENABLE_BROKER_INTEGRATION, false),
  },
  demoDevData: bool(process.env.DEMO_DEV_DATA, false),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim()),
});
