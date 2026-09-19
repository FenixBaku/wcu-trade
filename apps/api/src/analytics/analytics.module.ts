import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { TradingModule } from '../trading/trading.module';

@Module({
  imports: [TradingModule],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
