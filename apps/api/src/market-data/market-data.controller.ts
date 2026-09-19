import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { MarketDataService } from './market-data.service';
import { SymbolRegistryService } from './symbol-registry.service';

@UseGuards(JwtAuthGuard)
@Controller('markets')
export class MarketDataController {
  constructor(
    private readonly md: MarketDataService,
    private readonly registry: SymbolRegistryService,
  ) {}

  @Get()
  async list() {
    const symbols = this.registry.all();
    const quotes = await Promise.all(
      symbols.map(async (s) => ({ ...s, liveQuote: await this.md.getQuote(s.symbol) })),
    );
    return quotes;
  }

  @Get('health')
  health() {
    return this.md.health();
  }

  @Get(':symbol')
  async one(@Param('symbol') symbol: string) {
    const meta = this.registry.get(symbol);
    const quote = await this.md.getQuote(symbol);
    return { ...meta, quote, fresh: this.md.isFresh(symbol) };
  }

  @Get(':symbol/candles')
  candles(
    @Param('symbol') symbol: string,
    @Query('tf') tf = '1m',
    @Query('limit') limit = '500',
  ) {
    return this.md.getCandles(symbol, tf, Math.min(parseInt(limit, 10) || 500, 1000));
  }

  @Get(':symbol/orderbook')
  orderbook(@Param('symbol') symbol: string, @Query('depth') depth = '20') {
    return this.md.getOrderBook(symbol, Math.min(parseInt(depth, 10) || 20, 50));
  }

  @Get(':symbol/trades')
  trades(@Param('symbol') symbol: string) {
    return this.md.getRecentTrades(symbol);
  }
}
