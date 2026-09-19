import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PortfolioController } from '../portfolio/portfolio.controller';
import { OrdersController } from '../orders/orders.controller';
import { RiskService } from '../risk/risk.service';
import { TriggerService } from '../trigger/trigger.service';

@Module({
  providers: [TradingService, PortfolioService, RiskService, TriggerService],
  controllers: [TradingController, PortfolioController, OrdersController],
  exports: [TradingService, PortfolioService, RiskService],
})
export class TradingModule {}
