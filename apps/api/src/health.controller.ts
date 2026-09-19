import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';
import { MarketDataService } from './market-data/market-data.service';

@Controller()
export class HealthController {
  constructor(private readonly md: MarketDataService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', marketData: this.md.health(), ts: Date.now() };
  }

  @Public()
  @Get()
  root() {
    return { name: 'WCU TRADE API', version: '1.0.0', docs: '/health' };
  }
}
