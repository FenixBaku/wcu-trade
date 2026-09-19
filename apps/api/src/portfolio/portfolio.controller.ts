import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { PortfolioService } from './portfolio.service';
import { TradingService } from '../trading/trading.service';

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly trading: TradingService,
  ) {}

  private async accountId(userId: string) {
    return (await this.trading.getPrimaryAccount(userId)).id;
  }

  @Get()
  async overview(@CurrentUser() user: JwtUser) {
    const accountId = await this.accountId(user.sub);
    const [summary, positions] = await Promise.all([
      this.portfolio.summary(accountId),
      this.portfolio.positionViews(accountId),
    ]);
    return { summary, positions };
  }

  @Get('summary')
  async summary(@CurrentUser() user: JwtUser) {
    return this.portfolio.summary(await this.accountId(user.sub));
  }

  @Get('positions')
  async positions(@CurrentUser() user: JwtUser) {
    return this.portfolio.positionViews(await this.accountId(user.sub));
  }

  @Get('equity-curve')
  async equityCurve(@CurrentUser() user: JwtUser, @Query('range') range = 'ALL') {
    const accountId = await this.accountId(user.sub);
    const since = this.rangeToDate(range);
    return this.portfolio.equityCurve(accountId, since);
  }

  private rangeToDate(range: string): Date | undefined {
    const now = Date.now();
    const day = 86400000;
    switch (range) {
      case '1D': return new Date(now - day);
      case '1W': return new Date(now - 7 * day);
      case '1M': return new Date(now - 30 * day);
      case '3M': return new Date(now - 90 * day);
      default: return undefined;
    }
  }
}
