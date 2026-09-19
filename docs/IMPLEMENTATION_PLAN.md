# WCU TRADE — Implementation Plan

Incremental delivery. Each phase is buildable and testable on its own. The **MVP
end-to-end flow** (§78 of the brief) is the acceptance bar for Phase C+D.

## Status legend
- ✅ implemented in this repo
- 🟡 foundation implemented, expansion documented
- ⬜ planned / stubbed with clear interface

## PHASE A — Foundation
- ✅ Monorepo (npm workspaces): `apps/api`, `apps/web`, `packages/shared`
- ✅ Docker Compose (postgres, redis, api, web) + `.env.example`
- ✅ Prisma schema (full domain), migrations, seed
- ✅ Auth: JWT access + refresh rotation, RBAC guard, decorators
- ✅ Users/roles seeded (super admin, university admin, instructor, 2 students)

## PHASE B — Market Data
- ✅ `IMarketDataProvider` abstraction + Symbol Registry
- ✅ `BinanceMarketDataProvider` (live public WS: quotes/trades; REST candles)
- ✅ Collector → Normalizer → Redis cache + pub/sub
- ✅ Provider health (`LIVE/DELAYED/STALE/OFFLINE`) + backoff reconnect
- ✅ WebSocket gateway fan-out to clients
- 🟡 TwelveData/Polygon adapters (interface + config gating; stock/forex live data behind keys)

## PHASE C — Trading Engine (core money)
- ✅ Virtual accounts + append-only ledger (`LedgerService`)
- ✅ `IExecutionProvider` → `SimulationExecutionProvider` (fill price, spread, slippage, fee)
- ✅ `FeeService`, `SlippageService`, `SpreadService` (config-driven, not hardcoded)
- ✅ Market BUY/SELL, position engine (weighted avg entry, realized/unrealized P&L)
- ✅ Atomic execution (DB tx + row lock + idempotency key)

## PHASE D — Orders
- ✅ LIMIT, STOP, STOP_LIMIT order intake + state machine + order_events
- ✅ Server-side TriggerEngine: SL / TP / STOP / LIMIT fill / trailing-stop (idempotent)
- ✅ Order history, trade history, transaction (ledger) history endpoints
- 🟡 OCO (data model present; pairing logic foundation)
- 🟡 Partial fills (schema + fields ready; Phase 1 fills whole)

## PHASE E — Risk
- ✅ Leverage + isolated margin, initial/maintenance margin, liquidation price
- ✅ Liquidation as a real virtual trade + ledger event + notification
- ✅ RiskService limits (balance, max leverage, short-selling toggle, allowed assets, exposure)
- 🟡 Cross margin (schema + margin_mode ready; isolated enabled first)

## PHASE F — Professional UI
- ✅ WCU dark institutional design system (Tailwind theme)
- ✅ Login experience, top nav, connection/market-data status
- ✅ Trading terminal: market list, live chart, order book (native/synthetic-labelled),
  recent trades, order entry (market/limit/stop + TP/SL), positions/orders tabs
- ✅ Portfolio dashboard (equity, P&L cards, positions, equity curve)
- ✅ Orders page (open/history/trades/transactions)
- 🟡 Analytics, Competition, Academy pages (data endpoints + initial UI)

## PHASE G — Academic system
- 🟡 Instructor dashboard: classes, students, account reset, freeze, risk settings
- 🟡 Competition mode + risk-adjusted leaderboard
- 🟡 Assignments + auto-evaluation
- ✅ Audit logging across sensitive actions
- ⬜ Reporting (PDF/CSV) — service interface defined

## Testing (financial core — non-negotiable)
- ✅ Market buy/sell fill pricing (spread, slippage, fee)
- ✅ Long & short unrealized/realized P&L
- ✅ Weighted average entry
- ✅ SL/TP trigger direction + idempotency (no double execution)
- ✅ Ledger invariant (cash == Σ entries) and §70 worked example
- ✅ Insufficient-balance rejection, stale-quote rejection

## Acceptance — MVP end-to-end (§78)
Login (student) → see $100,000 → BTC/USDT live price + chart update → BUY 0.01 market via
`SimulationExecutionProvider` → position appears → price moves → unrealized P&L + equity
update live → set TP/SL → price hits level → auto close on server → realized P&L to ledger →
trade in history. **This flow is the definition of done for the first milestone.**
