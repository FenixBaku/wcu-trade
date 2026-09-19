import { Module } from '@nestjs/common';
import { WatchlistController } from './watchlist.controller';

@Module({
  controllers: [WatchlistController],
})
export class WatchlistModule {}
