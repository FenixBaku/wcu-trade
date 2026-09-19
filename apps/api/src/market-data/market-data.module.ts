import { Global, Module } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { MarketDataController } from './market-data.controller';
import { SymbolRegistryService } from './symbol-registry.service';

@Global()
@Module({
  providers: [MarketDataService, SymbolRegistryService],
  controllers: [MarketDataController],
  exports: [MarketDataService, SymbolRegistryService],
})
export class MarketDataModule {}
