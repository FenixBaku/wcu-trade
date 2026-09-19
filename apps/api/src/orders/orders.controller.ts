import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TradingService } from '../trading/trading.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trading: TradingService,
  ) {}

  private async accountId(userId: string) {
    return (await this.trading.getPrimaryAccount(userId)).id;
  }

  @Get('orders/open')
  async open(@CurrentUser() user: JwtUser) {
    const accountId = await this.accountId(user.sub);
    const rows = await this.prisma.order.findMany({
      where: { accountId, status: { in: ['OPEN', 'NEW', 'PARTIALLY_FILLED', 'TRIGGERED'] } },
      include: { asset: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => this.serialize(o));
  }

  @Get('orders/history')
  async history(@CurrentUser() user: JwtUser) {
    const accountId = await this.accountId(user.sub);
    const rows = await this.prisma.order.findMany({
      where: { accountId, status: { in: ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'] } },
      include: { asset: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((o) => this.serialize(o));
  }

  @Get('trades')
  async trades(@CurrentUser() user: JwtUser) {
    const accountId = await this.accountId(user.sub);
    const rows = await this.prisma.trade.findMany({
      where: { accountId },
      include: { asset: true },
      orderBy: { executedAt: 'desc' },
      take: 200,
    });
    return rows.map((t) => ({
      id: t.id,
      symbol: t.asset.symbol,
      side: t.side,
      quantity: t.quantity.toString(),
      marketPrice: t.marketPrice.toString(),
      fillPrice: t.fillPrice.toString(),
      commission: t.commission.toString(),
      slippage: t.slippage.toString(),
      realizedPnl: t.realizedPnl.toString(),
      executedAt: t.executedAt.toISOString(),
    }));
  }

  @Get('transactions')
  async transactions(@CurrentUser() user: JwtUser) {
    const accountId = await this.accountId(user.sub);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((l) => ({
      id: l.id,
      type: l.type,
      amount: l.amount.toString(),
      balanceAfter: l.balanceAfter.toString(),
      memo: l.memo,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  private serialize(o: any) {
    return {
      id: o.id,
      symbol: o.asset.symbol,
      side: o.side,
      positionSide: o.positionSide,
      type: o.type,
      status: o.status,
      quantity: o.quantity.toString(),
      requestedPrice: o.requestedPrice?.toString() ?? null,
      limitPrice: o.limitPrice?.toString() ?? null,
      stopPrice: o.stopPrice?.toString() ?? null,
      takeProfitPrice: o.takeProfitPrice?.toString() ?? null,
      stopLossPrice: o.stopLossPrice?.toString() ?? null,
      filledQuantity: o.filledQuantity.toString(),
      averageFillPrice: o.averageFillPrice?.toString() ?? null,
      fee: o.fee.toString(),
      slippage: o.slippage.toString(),
      createdAt: o.createdAt.toISOString(),
      filledAt: o.filledAt?.toISOString() ?? null,
    };
  }
}
