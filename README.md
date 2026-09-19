# WCU TRADE — Financial Markets Simulation Platform

**Western Caspian University · Phase 1**

A production-grade university trading simulator. **Live market data, virtual money.**
Real backend execution engine, immutable ledger, realistic spread/slippage/fees, margin,
leverage, liquidation, server-side SL/TP, and a professional exchange-style terminal.

> Educational simulation environment. No real funds are used. No deposits, withdrawals,
> cards or real broker execution. Nothing here is investment advice.

---

## What actually works (MVP end-to-end)

1. Log in as a student → see **$100,000** virtual balance.
2. **BTC/USDT** streams live prices from Binance; the chart and tape update in real time.
3. Place **BUY 0.01 BTC · Market** → executes through the `SimulationExecutionProvider`
   (ask + slippage + 0.10% fee), reserves margin, posts ledger entries.
4. A **position** appears; as the price moves, **unrealized P&L, equity, margin** update live.
5. Attach **Take Profit / Stop Loss** → the **server-side trigger engine** watches live marks
   and auto-closes when a level is hit (idempotently).
6. **Realized P&L** is written to the ledger; the **trade appears in history**.

Also implemented: limit/stop/stop-limit/trailing orders, short selling, leverage & isolated
margin, liquidation, portfolio & analytics, instructor account controls (reset/freeze/risk),
audit logging, watchlists, notifications/toasts, RBAC.

## Architecture

Monorepo (npm workspaces). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/DATABASE.md`](docs/DATABASE.md), [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

```
apps/api    NestJS (TypeScript) — modular monolith, Prisma, Redis, Socket.IO
apps/web    React + Vite + Tailwind — exchange terminal (lightweight-charts)
packages/shared  shared types, enums, money (decimal.js) helpers
infrastructure / docker
```

- **Money precision:** PostgreSQL `NUMERIC(38,18)` + `decimal.js`. Never binary floats.
- **Backend is authoritative:** equity/P&L/margin derived from ledger + live marks.
- **One upstream connection** per symbol → Redis fan-out → WebSocket to all clients.
- **Provider & execution abstraction** ready for a Phase-2 regulated broker.

## Prerequisites

- Node.js 20+ and npm 9+
- Docker (for PostgreSQL + Redis) — or your own Postgres/Redis

## Quick start (recommended: infra in Docker, apps local)

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run build:shared
npm run prisma:generate
npm run prisma:migrate            # applies the baseline migration (creates the schema)
npm run db:seed
npm run dev            # starts API (http://localhost:4000) + web (http://localhost:5173)
```

Open **http://localhost:5173** and sign in.

### Demo logins (password for all: `Passw0rd!`)

| Role | Email |
|---|---|
| Student | `student1@wcu.edu` |
| Student | `student2@wcu.edu` |
| Instructor | `instructor@wcu.edu` |
| Admin | `admin@wcu.edu` |

## Full Docker (everything containerized)

```bash
cp .env.example .env
docker compose up -d --build
# web:  http://localhost:8080
# api:  http://localhost:4000/api/health
```
The API container applies migrations and seeds automatically on first boot.

## Useful commands

```bash
npm run dev                 # api + web (watch)
npm run test                # financial-core unit tests (execution, risk, money math)
npm run prisma:migrate:dev --workspace @wcu/api
npm run db:seed
npm run build               # build shared + api + web
```

## Key API endpoints

`POST /api/auth/login` · `GET /api/markets` · `GET /api/markets/:symbol/candles`
`POST /api/orders` · `DELETE /api/orders/:id` · `GET /api/orders/open|history`
`GET /api/trades` · `GET /api/transactions` · `GET /api/portfolio` · `GET /api/analytics/performance`
`POST /api/positions/:id/close` · `POST /api/positions/:id/tpsl`
Instructor: `POST /api/instructor/classes` · `POST /api/instructor/accounts/:userId/reset`

## Configuration & feature flags

All in `.env` (`.env.example` documents every key): market-data provider, stale-quote
threshold, fees, slippage model, spread, max leverage, and feature flags
(`ENABLE_MARGIN`, `ENABLE_SHORT_SELLING`, `ENABLE_BROKER_INTEGRATION=false`, …).

## No-fake-data policy

Crypto uses **live Binance** data. Non-crypto symbols (stocks/forex/metals/indices) have
**no live provider in Phase 1** and are shown honestly as *no data / MARKET DATA UNAVAILABLE*
until a provider key (TwelveData/Polygon/Finnhub) is configured. Mock data is used only when
`DEMO_DEV_DATA=true`, clearly labelled.

## License

Educational use — Western Caspian University.
