import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TradingService } from '../trading/trading.service';
import { D, Decimal } from '@wcu/shared';

/**
 * Performance analytics (§22). Computed from immutable trade history + equity snapshots.
 */
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trading: TradingService,
  ) {}

  @Get('performance')
  async performance(@CurrentUser() user: JwtUser) {
    const account = await this.trading.getPrimaryAccount(user.sub);
    const trades = await this.prisma.trade.findMany({
      where: { accountId: account.id },
      orderBy: { executedAt: 'asc' },
    });
    const closing = trades.filter((t) => !D(t.realizedPnl.toString()).isZero());
    const wins = closing.filter((t) => D(t.realizedPnl.toString()).gt(0));
    const losses = closing.filter((t) => D(t.realizedPnl.toString()).lt(0));

    const sum = (arr: typeof trades) => arr.reduce((a, t) => a.plus(t.realizedPnl.toString()), D(0));
    const grossProfit = sum(wins);
    const grossLoss = sum(losses).abs();
    const avgWin = wins.length ? grossProfit.div(wins.length) : D(0);
    const avgLoss = losses.length ? grossLoss.div(losses.length) : D(0);

    const snapshots = await this.prisma.portfolioSnapshot.findMany({
      where: { accountId: account.id },
      orderBy: { ts: 'asc' },
    });
    const maxDrawdown = this.maxDrawdown(snapshots.map((s) => D(s.equity.toString())));
    const sharpe = this.sharpe(snapshots.map((s) => D(s.equity.toString())));

    return {
      totalTrades: closing.length,
      winRate: closing.length ? wins.length / closing.length : 0,
      lossRate: closing.length ? losses.length / closing.length : 0,
      grossProfit: grossProfit.toDecimalPlaces(2).toString(),
      grossLoss: grossLoss.toDecimalPlaces(2).toString(),
      profitFactor: grossLoss.isZero() ? null : grossProfit.div(grossLoss).toDecimalPlaces(2).toString(),
      averageProfit: avgWin.toDecimalPlaces(2).toString(),
      averageLoss: avgLoss.toDecimalPlaces(2).toString(),
      riskReward: avgLoss.isZero() ? null : avgWin.div(avgLoss).toDecimalPlaces(2).toString(),
      maxDrawdownPct: maxDrawdown.toDecimalPlaces(2).toString(),
      sharpe: sharpe.toDecimalPlaces(2).toString(),
      realizedPnl: account.realizedPnl.toString(),
    };
  }

  private maxDrawdown(equity: Decimal[]): Decimal {
    let peak = equity[0] ?? D(0);
    let maxDd = D(0);
    for (const e of equity) {
      if (e.gt(peak)) peak = e;
      if (peak.gt(0)) {
        const dd = peak.minus(e).div(peak).mul(100);
        if (dd.gt(maxDd)) maxDd = dd;
      }
    }
    return maxDd;
  }

  private sharpe(equity: Decimal[]): Decimal {
    if (equity.length < 3) return D(0);
    const rets: Decimal[] = [];
    for (let i = 1; i < equity.length; i++) {
      const prev = equity[i - 1];
      if (prev.isZero()) continue;
      rets.push(equity[i].minus(prev).div(prev));
    }
    if (rets.length < 2) return D(0);
    const mean = rets.reduce((a, r) => a.plus(r), D(0)).div(rets.length);
    const variance = rets.reduce((a, r) => a.plus(r.minus(mean).pow(2)), D(0)).div(rets.length);
    const std = variance.sqrt();
    if (std.isZero()) return D(0);
    return mean.div(std).mul(Math.sqrt(252));
  }
}
