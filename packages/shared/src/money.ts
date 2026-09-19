import Decimal from 'decimal.js';

// Central money/quantity math. Never use JS number arithmetic for money.
// 38 significant digits mirrors the DB NUMERIC(38,18) precision budget.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = Decimal.Value;
export const D = (v: Numeric): Decimal => new Decimal(v ?? 0);

export const bps = (value: Numeric, basisPoints: Numeric): Decimal =>
  D(value).mul(D(basisPoints)).div(10000);

/** Round to a given decimal places for display/storage. */
export const round = (v: Numeric, dp = 2): Decimal => D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);

export const toFixed = (v: Numeric, dp = 2): string => D(v).toFixed(dp);

/** Weighted average entry price for adding `addQty` at `addPrice` to an existing position. */
export function weightedAvg(
  curQty: Numeric,
  curAvg: Numeric,
  addQty: Numeric,
  addPrice: Numeric,
): Decimal {
  const q0 = D(curQty);
  const q1 = D(addQty);
  const total = q0.plus(q1);
  if (total.isZero()) return D(0);
  return q0.mul(curAvg).plus(q1.mul(addPrice)).div(total);
}

/** Unrealized P&L for a position given the current mark price. */
export function unrealizedPnl(
  side: 'LONG' | 'SHORT',
  qty: Numeric,
  avgEntry: Numeric,
  mark: Numeric,
): Decimal {
  const diff = side === 'LONG' ? D(mark).minus(avgEntry) : D(avgEntry).minus(mark);
  return diff.mul(qty);
}

/** ROI % on the margin committed to a position. */
export function roiPct(pnl: Numeric, usedMargin: Numeric): Decimal {
  if (D(usedMargin).isZero()) return D(0);
  return D(pnl).div(usedMargin).mul(100);
}

export { Decimal };
