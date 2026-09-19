import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { MarketDataModule } from './market-data/market-data.module';
import { ExecutionModule } from './execution/execution.module';
import { LedgerModule } from './ledger/ledger.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationModule } from './notifications/notification.module';
import { AuthModule } from './auth/auth.module';
import { TradingModule } from './trading/trading.module';
import { InstructorModule } from './instructor/instructor.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    JwtModule.register({ global: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    // Infrastructure (global)
    PrismaModule,
    RedisModule,
    AuditModule,
    ExecutionModule,
    LedgerModule,
    MarketDataModule,
    RealtimeModule,
    NotificationModule,
    // Feature modules
    AuthModule,
    TradingModule,
    InstructorModule,
    AdminModule,
    AnalyticsModule,
    WatchlistModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
