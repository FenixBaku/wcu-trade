# WCU TRADE — Database Design (PostgreSQL)

Source of truth for all financial state. Money & quantities use `NUMERIC(38,18)`.
Financial history is **immutable** — never overwritten; corrections are new ledger rows.
Full Prisma schema lives in [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).

## Precision & money rules

- Columns for money/qty/price: `Decimal @db.Decimal(38, 18)`.
- Realized/unrealized P&L, fees, slippage all persisted with a trade — reproducible.
- Equity/available/margin are **derived** from account + open positions + live mark, not
  stored as mutable truth (a cached snapshot table exists for charts only).

## Identity & academics

| Table | Notes |
|---|---|
| `users` | id, email (unique), password_hash, full_name, avatar, status |
| `roles` / `user_roles` | RBAC; a user may hold multiple roles |
| `faculties`, `departments`, `groups`, `courses` | academic hierarchy |
| `classes` | instructor-owned; holds trading config (leverage cap, allowed assets, fees, margin/short flags, start/end) |
| `class_students` | membership |
| `simulation_sessions` | a class run for a semester; a student can be in many over time, histories kept separate |
| `sessions` (auth) | refresh-token sessions, revocable, IP/user-agent |

## Assets, symbols, providers

| Table | Notes |
|---|---|
| `assets` | asset_class (CRYPTO/FOREX/METAL/STOCK/INDEX/COMMODITY/ETF), base/quote, price & qty precision, market-hours calendar ref, status |
| `market_providers` | provider name, enabled, credentials **encrypted** (never plaintext) |
| `provider_symbols` | maps internal symbol → provider symbol (`BTC-USDT`→`BTCUSDT`) |
| `market_price_snapshots` | periodic marks for audit/replay (NOT every tick) |

## Virtual accounts & ledger

`virtual_accounts`
- id, user_id, session_id (nullable), currency, kind (`SIM` in Phase 1),
  cash_balance, realized_pnl, starting_balance, status (`ACTIVE/FROZEN/SUSPENDED/ARCHIVED`),
  leverage_default, created_at.
- Derived at read time: equity, available, used_margin, free_margin, unrealized_pnl,
  margin_level, total_return_pct, daily_pnl.

`ledger_entries` (append-only)
- id, account_id, type (`INITIAL_DEPOSIT, TRADE_BUY, TRADE_SELL, COMMISSION,
  REALIZED_PNL, MARGIN_RESERVE, MARGIN_RELEASE, ADMIN_ADJUSTMENT, ACCOUNT_RESET`),
  amount (signed), balance_after, ref_order_id, ref_trade_id, memo, created_at.
- Every financial mutation writes ≥1 entry. Cash balance == sum of entries (invariant).

## Orders / trades / positions

`orders`
- id (UUID), account_id, symbol_id, side (`BUY/SELL`), position_side (`LONG/SHORT`),
  order_type (`MARKET, LIMIT, STOP, STOP_LIMIT, TRAILING_STOP, OCO`),
  quantity, requested_price, limit_price, stop_price,
  take_profit_price, stop_loss_price, trailing_delta,
  status (`NEW, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED, EXPIRED, TRIGGERED`),
  filled_quantity, average_fill_price, fee, slippage, leverage, margin_mode
  (`CROSS/ISOLATED`), reduce_only, client_order_id (idempotency),
  created_at, triggered_at, filled_at, cancelled_at.
- Structure supports **partial fills** even though Phase 1 fills whole.

`order_events` — append-only state transitions (audit of the state machine).

`trades` (immutable)
- id, order_id, account_id, symbol_id, side, quantity, market_price (reference),
  fill_price, commission, slippage, realized_pnl, provider_timestamp, executed_at.

`positions`
- id, account_id, symbol_id, side (`LONG/SHORT`), quantity, avg_entry_price,
  used_margin, leverage, margin_mode, liquidation_price, realized_pnl,
  take_profit_price, stop_loss_price, opened_at, updated_at, closed_at (null=open).
- Weighted-average entry on adds; realized P&L on reduces/closes.

## Snapshots, watchlists, academics-runtime

| Table | Notes |
|---|---|
| `portfolio_snapshots` | account_id, ts, equity, cash, unrealized, realized, margin — for equity curve/drawdown |
| `watchlists` / `watchlist_items` | per-user, ordered symbols |
| `competitions` / `competition_members` / `leaderboard_snapshots` | risk-adjusted scoring inputs |
| `assignments` / `assignment_rules` / `assignment_results` | rule set + auto-eval outcomes |
| `notifications` | per-user, type, payload, read_at |
| `audit_logs` | actor, action, target, old_data (jsonb), new_data (jsonb), ip, request_id, ts |

## Invariants (enforced in code + tests)

1. `cash_balance == Σ ledger_entries.amount` for the account.
2. A trade's `realized_pnl` follows from position avg entry, fill price, side and fees.
3. SL/TP/liquidation each fire **at most once** per position (idempotent triggers).
4. Equity = cash + Σ position marketValue adjustments (unrealized P&L) computed from live mark.
5. Available = equity − used_margin (never negative-spendable beyond it).
