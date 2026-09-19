# WCU TRADE — System Architecture

**WCU TRADE — Financial Markets Simulation Platform**
Western Caspian University · Phase 1 (fully virtual, live market data)

---

## 1. Guiding principles

1. **Real simulator, not a fake frontend.** Every order executes through a real backend
   engine, mutates a real ledger, and produces auditable records.
2. **Backend is authoritative.** All money, P&L, margin and equity are computed server-side
   from order/trade/ledger history. The frontend only renders.
3. **Live data, virtual money.** Prices come from real providers (Binance first). Balances,
   fills, fees, margin and P&L are 100% virtual.
4. **Provider & execution abstraction.** `IMarketDataProvider` and `IExecutionProvider`
   isolate vendors so Phase 2 can swap in a regulated broker without rewriting the engine.
5. **Precision.** Money and quantities use PostgreSQL `NUMERIC` + `decimal.js` — never
   binary floats.
6. **No fake-data policy.** Random prices are never presented as live. Mock data only when
   `DEMO_DEV_DATA=true`, and it is clearly labelled.

## 2. High-level topology

```
                        External Market Providers
                     (Binance WS/REST, TwelveData, ...)
                                   │
                     ┌─────────────┴──────────────┐
                     │   MarketDataModule (API)     │   ← single upstream connection
                     │  Collector → Normalizer      │
                     └─────────────┬────────────────┘
                                   │ publish quotes/trades/candles
                              ┌────┴────┐
                              │  Redis  │  pub/sub + quote cache + locks
                              └────┬────┘
                                   │ fan-out
                     ┌─────────────┴────────────────┐
                     │  WebSocket Gateway (Socket.IO)│
                     └─────────────┬────────────────┘
                                   │  market.*, portfolio.*, orders.*, notifications.*
                          ┌────────┴─────────┐
                          │  React clients    │  (20–30+ students)
                          └───────────────────┘

     PostgreSQL  ← source of truth for accounts, ledger, orders, trades, positions
```

**Key rule:** exactly one upstream provider connection per symbol serves all students.
Browsers never talk to Binance directly; they subscribe to our gateway.

## 3. Backend — Modular Monolith (NestJS)

A single deployable, internally split into modules with clear boundaries. Market Data and
the Trading Engine are designed to be extractable into services later.

| Module | Responsibility |
|---|---|
| `AuthModule` | JWT access/refresh, rotation, RBAC guards, sessions |
| `UsersModule` | users, roles, profiles |
| `AcademicModule` | faculties, departments, groups, courses, classes, sessions |
| `MarketDataModule` | provider adapters, symbol registry, collector, health, Redis fan-out |
| `AssetsModule` | assets, symbols, precision, market hours/calendars |
| `TradingModule` | order intake, validation, orchestration |
| `OrderModule` | order lifecycle & state machine, order events |
| `ExecutionModule` | `IExecutionProvider` → `SimulationExecutionProvider` (fill pricing) |
| `LedgerModule` | virtual accounts + immutable ledger entries |
| `PortfolioModule` | positions, equity, P&L, snapshots |
| `RiskModule` | margin, leverage, liquidation, risk limits |
| `TriggerModule` | server-side SL/TP/stop/trailing evaluation loop |
| `AnalyticsModule` | performance metrics (Sharpe, drawdown, win rate, ...) |
| `CompetitionModule` | competitions, leaderboards, risk-adjusted scoring |
| `AssignmentModule` | assignments, rules, auto-evaluation |
| `NotificationModule` | real-time notifications + toasts |
| `ReportingModule` | PDF/CSV statements & reports |
| `AdminModule` | system settings, feature flags, providers, users |
| `AuditModule` | immutable audit log of sensitive actions |

### Request → execution flow (market order)

```
POST /orders
  → TradingModule validates (RBAC, asset allowed, market open, quote fresh)
  → RiskModule pre-check (balance, margin, exposure limits, leverage cap)
  → BEGIN TX (Postgres) with row lock on virtual_account
      → OrderModule creates order (NEW)
      → ExecutionModule.SimulationExecutionProvider.fill(order, quote)
          computes fill price = ask+slippage (buy) / bid-slippage (sell), + commission
      → LedgerModule posts entries (MARGIN_RESERVE / COMMISSION / TRADE_*)
      → PortfolioModule upserts position (weighted avg entry) / realizes PnL on close
      → OrderModule marks FILLED, writes trade
      → AuditModule records
    COMMIT
  → NotificationModule + WS push (portfolio.{user}, orders.{user})
```

Atomicity is guaranteed by a single DB transaction with `SELECT ... FOR UPDATE` on the
account row, plus idempotency keys on order intake and trigger execution.

## 4. Market data pipeline

- `IMarketDataProvider` adapters: `BinanceMarketDataProvider` (Phase 1, live),
  `TwelveDataMarketDataProvider`, `PolygonMarketDataProvider` (stubs, config-gated).
- **Symbol Registry** maps internal symbols (`BTC-USDT`) to provider symbols
  (`BTCUSDT`, `BTC/USD`).
- Collector maintains one upstream connection, normalizes ticks to a canonical `Quote`
  shape, caches latest in Redis (`quote:{symbol}`), and publishes to Redis pub/sub.
- **Health tracking:** `LIVE | DELAYED | STALE | OFFLINE` per provider; exponential-backoff
  reconnect. When a quote exceeds `QUOTE_STALE_THRESHOLD_MS`, market orders on that symbol
  are rejected until a fresh quote arrives.

## 5. Real-time (WebSocket) topics

`market.quote.{sym}`, `market.trade.{sym}`, `market.depth.{sym}`, `market.candle.{sym}.{tf}`,
`portfolio.{userId}`, `orders.{userId}`, `notifications.{userId}`.
Connection states surfaced to UI: `LIVE / RECONNECTING / DELAYED / OFFLINE`.

## 6. Trigger engine (SL/TP/Stop/Trailing) — server-side

A single interval worker (leased via a Redis lock so only one instance runs it) subscribes
to quote updates and evaluates every active trigger deterministically:

- LONG: TP when `price >= tp`, SL when `price <= sl`.
- SHORT: mirrored.
- Trailing stop tracks the best price and recomputes the stop.
- **Idempotency:** each trigger has a `triggered_at` guard + a Redis `NX` lock keyed by
  order id, so a level can never fire twice.

## 7. Frontend (React + Vite)

- TailwindCSS design system (WCU dark institutional theme), TanStack Query for REST,
  Zustand for global UI/session state, `lightweight-charts` for the chart, `socket.io-client`
  for live data.
- A single WS connection per client; a `marketStore` keeps the latest quotes and pushes
  targeted updates so only subscribed cells re-render (no full-tree re-renders).

## 8. Money & precision

- All monetary/quantity columns: `NUMERIC(38, 18)` in Postgres (Prisma `Decimal`).
- Server math via `decimal.js`. A `Money`/`Dec` helper centralizes rounding rules.
- Display precision is per-asset (`price_precision`, `qty_precision`).

## 9. Security

JWT access + rotating refresh tokens (hashed, stored per-session, revocable). RBAC guard
(`SUPER_ADMIN, UNIVERSITY_ADMIN, INSTRUCTOR, STUDENT, OBSERVER`). Helmet security headers,
CORS allowlist, class-validator DTO validation, rate limiting, audit logging. Provider
secrets stay server-side and are never shipped to the browser. Architecture leaves room for
university SSO/OIDC and MFA.

## 10. Deployment

`docker compose up` brings up `postgres`, `redis`, `api`, `web`. Prisma migrations + seed
create demo users, assets, symbols and a starter watchlist. See `README.md`.

## 11. Phase 2 readiness

`ENABLE_BROKER_INTEGRATION=false` in Phase 1. `IExecutionProvider` and separate
account "kind" allow a future `BrokerExecutionProvider` and real-money accounts without
touching the engine. No deposits/withdrawals/cards exist in Phase 1 by design.
