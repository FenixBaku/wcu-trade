import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { D, Decimal, unrealizedPnl, roiPct } from '@wcu/shared';
import type { AccountSummary, PositionView } from '@wcu/shared';

/**
 * Portfolio read-model (§12, §18). Derives equity/P&L/margin from the ledger-backed
 * account plus live marks. Backend is authoritative — the frontend only renders these.
 *
 * Accounting model (margin/derivatives style, leverage=1 behaves spot-like):
 *   equity      = cashBalance + usedMargin + unrealizedPnl
 *   freeMargin  = equity - usedMargin            (a.k.a available)
 *   marginLevel = equity / usedMargin * 100
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly md: MarketDataService,
  ) {}

  private mark(symbol: string, fallback: Decimal.Value): Decimal {
    const q = this.md.getLatest(symbol);
    return q ? D(q.last) : D(fallback);
  }

  async openPositions(accountId: string) {
    return this.prisma.position.findMany({
      where: { accountId, closedAt: null },
      include: { asset: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  async positionViews(accountId: string): Promise<PositionView[]> {
    const positions = await this.openPositions(accountId);
    return positions.map((p) => {
      const mark = this.mark(p.asset.symbol, p.avgEntryPrice.toString());
      const upnl = unrealizedPnl(p.side, p.quantity.toString(), p.avgEntryPrice.toString(), mark);
      const marketValue = mark.mul(p.quantity.toString());
      return {
        id: p.id,
        symbol: p.asset.symbol,
        side: p.side,
        quantity: p.quantity.toString(),
        avgEntryPrice: p.avgEntryPrice.toString(),
        markPrice: mark.toString(),
        marketValue: marketValue.toString(),
        unrealizedPnl: upnl.toString(),
        realizedPnl: p.realizedPnl.toString(),
        roi: roiPct(upnl, p.usedMargin.toString()).toDecimalPlaces(2).toString(),
        usedMargin: p.usedMargin.toString(),
        leverage: p.leverage,
        liquidationPrice: p.liquidationPrice ? p.liquidationPrice.toString() : null,
        takeProfitPrice: p.takeProfitPrice ? p.takeProfitPrice.toString() : null,
        stopLossPrice: p.stopLossPrice ? p.stopLossPrice.toString() : null,
      };
    });
  }

  async summary(accountId: string): Promise<AccountSummary> {
    const account = await this.prisma.virtualAccount.findUniqueOrThrow({ where: { id: accountId } });
    const positions = await this.openPositions(accountId);

    let usedMargin = D(0);
    let unrealized = D(0);
    for (const p of positions) {
      const mark = this.mark(p.asset.symbol, p.avgEntryPrice.toString());
      usedMargin = usedMargin.plus(p.usedMargin.toString());
      unrealized = unrealized.plus(
        unrealizedPnl(p.side, p.quantity.toString(), p.avgEntryPrice.toString(), mark),
      );
    }

    const cash = D(account.cashBalance.toString());
    const equity = cash.plus(usedMargin).plus(unrealized);
    const freeMargin = equity.minus(usedMargin);
    const starting = D(account.startingBalance.toString());
    const realized = D(account.realizedPnl.toString());
    const totalPnl = realized.plus(unrealized);
    const totalReturnPct = starting.isZero() ? D(0) : totalPnl.div(starting).mul(100);
    const marginLevel = usedMargin.isZero() ? null : equity.div(usedMargin).mul(100);

    // Daily P&L: equity now minus the earliest snapshot since local midnight.
    const dailyPnl = await this.dailyPnl(accountId, equity);

    return {
      cashBalance: cash.toDecimalPlaces(2).toString(),
      equity: equity.toDecimalPlaces(2).toString(),
      available: freeMargin.toDecimalPlaces(2).toString(),
      usedMargin: usedMargin.toDecimalPlaces(2).toString(),
      freeMargin: freeMargin.toDecimalPlaces(2).toString(),
      unrealizedPnl: unrealized.toDecimalPlaces(2).toString(),
      realizedPnl: realized.toDecimalPlaces(2).toString(),
      totalPnl: totalPnl.toDecimalPlaces(2).toString(),
      dailyPnl: dailyPnl.toDecimalPlaces(2).toString(),
      totalReturnPct: totalReturnPct.toDecimalPlaces(2).toString(),
      marginLevel: marginLevel ? marginLevel.toDecimalPlaces(2).toString() : null,
      currency: account.currency,
      startingBalance: starting.toDecimalPlaces(2).toString(),
    };
  }

  private async dailyPnl(accountId: string, equityNow: Decimal): Promise<Decimal> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const snap = await this.prisma.portfolioSnapshot.findFirst({
      where: { accountId, ts: { gte: midnight } },
      orderBy: { ts: 'asc' },
    });
    if (!snap) return D(0);
    return equityNow.minus(snap.equity.toString());
  }

  /** Persist an equity snapshot for the equity curve / drawdown (§23). */
  async snapshot(accountId: string) {
    const s = await this.summary(accountId);
    await this.prisma.portfolioSnapshot.create({
      data: {
        accountId,
        equity: s.equity,
        cash: s.cashBalance,
        unrealizedPnl: s.unrealizedPnl,
        realizedPnl: s.realizedPnl,
        usedMargin: s.usedMargin,
      },
    });
  }

  async equityCurve(accountId: string, since?: Date) {
    return this.prisma.portfolioSnapshot.findMany({
      where: { accountId, ...(since ? { ts: { gte: since } } : {}) },
      orderBy: { ts: 'asc' },
      select: { ts: true, equity: true, realizedPnl: true, unrealizedPnl: true },
    });
  }
}
