import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { D, Decimal } from '@wcu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MarketDataService } from '../market-data/market-data.service';
import { SymbolRegistryService } from '../market-data/symbol-registry.service';
import { RiskService } from '../risk/risk.service';
import { TradingService } from '../trading/trading.service';

/**
 * Server-side trigger engine (§5). Deterministically evaluates open positions
 * (TP / SL / liquidation) and resting orders (LIMIT / STOP / STOP_LIMIT / TRAILING_STOP)
 * against the latest live marks. Idempotent: a per-entity Redis lock + in-tx status
 * re-check guarantee a level can never fire twice. A leader lock keeps a single
 * instance evaluating in a multi-instance deployment.
 */
@Injectable()
export class TriggerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerService.name);
  private inflight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly md: MarketDataService,
    private readonly registry: SymbolRegistryService,
    private readonly risk: RiskService,
    private readonly trading: TradingService,
  ) {}

  onModuleInit() {
    this.logger.log('Trigger engine active');
  }

  @Interval(1000)
  async sweep() {
    // Leader election so only one instance evaluates triggers.
    const isLeader = await this.redis.acquireLock('trigger:leader', 2500);
    if (!isLeader) return;
    try {
      await Promise.all([this.evaluatePositions(), this.evaluateOrders()]);
    } catch (e) {
      this.logger.warn(`sweep error: ${(e as Error).message}`);
    }
  }

  private async evaluatePositions() {
    const positions = await this.prisma.position.findMany({
      where: { closedAt: null },
      include: { asset: true },
    });
    for (const pos of positions) {
      const q = this.md.getLatest(pos.asset.symbol);
      if (!q) continue;
      const mark = D(q.last);
      const key = `pos:${pos.id}`;
      if (this.inflight.has(key)) continue;

      // Liquidation has priority.
      if (this.risk.shouldLiquidate(pos.side, mark, pos.liquidationPrice ? pos.liquidationPrice.toString() : null)) {
        await this.fire(key, `trigger:${key}`, () => this.trading.liquidate(pos.id, mark));
        continue;
      }
      // Take profit
      if (pos.takeProfitPrice) {
        const tp = D(pos.takeProfitPrice.toString());
        const hit = pos.side === 'LONG' ? mark.gte(tp) : mark.lte(tp);
        if (hit) {
          await this.fire(key, `trigger:${key}`, () => this.trading.triggerClose(pos.id, 'TP', tp));
          continue;
        }
      }
      // Stop loss
      if (pos.stopLossPrice) {
        const sl = D(pos.stopLossPrice.toString());
        const hit = pos.side === 'LONG' ? mark.lte(sl) : mark.gte(sl);
        if (hit) {
          await this.fire(key, `trigger:${key}`, () => this.trading.triggerClose(pos.id, 'SL', sl));
        }
      }
    }
  }

  private async evaluateOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: 'OPEN', type: { in: ['LIMIT', 'STOP', 'STOP_LIMIT', 'TRAILING_STOP'] } },
    });
    for (const o of orders) {
      const symbol = this.symbolForAsset(o.assetId);
      if (!symbol) continue;
      const q = this.md.getLatest(symbol);
      if (!q) continue;
      const last = D(q.last);
      const key = `ord:${o.id}`;
      if (this.inflight.has(key)) continue;

      let match: Decimal | null = null;

      if (o.type === 'LIMIT' && o.limitPrice) {
        const lp = D(o.limitPrice.toString());
        if ((o.side === 'BUY' && last.lte(lp)) || (o.side === 'SELL' && last.gte(lp))) match = lp;
      } else if (o.type === 'STOP' && o.stopPrice) {
        const sp = D(o.stopPrice.toString());
        if ((o.side === 'BUY' && last.gte(sp)) || (o.side === 'SELL' && last.lte(sp))) match = last;
      } else if (o.type === 'STOP_LIMIT' && o.stopPrice) {
        const sp = D(o.stopPrice.toString());
        const stopHit = (o.side === 'BUY' && last.gte(sp)) || (o.side === 'SELL' && last.lte(sp));
        if (stopHit) match = o.limitPrice ? D(o.limitPrice.toString()) : last;
      } else if (o.type === 'TRAILING_STOP' && o.trailingDelta) {
        match = await this.evaluateTrailing(o, last);
      }

      if (match) {
        await this.fire(key, `trigger:${key}`, () =>
          this.trading.fillRestingOrder(o as any, symbol, match!),
        );
      }
    }
  }

  private async evaluateTrailing(o: any, last: Decimal): Promise<Decimal | null> {
    const delta = D(o.trailingDelta.toString());
    let anchor = o.trailingAnchor ? D(o.trailingAnchor.toString()) : last;
    if (o.side === 'SELL') {
      // protects a long: anchor tracks the high
      if (last.gt(anchor)) {
        anchor = last;
        await this.prisma.order.update({ where: { id: o.id }, data: { trailingAnchor: anchor.toString() } });
      }
      if (last.lte(anchor.minus(delta))) return last;
    } else {
      // BUY trailing protects a short: anchor tracks the low
      if (last.lt(anchor)) {
        anchor = last;
        await this.prisma.order.update({ where: { id: o.id }, data: { trailingAnchor: anchor.toString() } });
      }
      if (last.gte(anchor.plus(delta))) return last;
    }
    return null;
  }

  private symbolForAsset(assetId: string): string | undefined {
    return this.registry.all().find((a) => a.id === assetId)?.symbol;
  }

  /** Idempotent fire: in-process guard + Redis NX lock; the executor re-checks status in-tx. */
  private async fire(inflightKey: string, lockKey: string, fn: () => Promise<void>) {
    if (this.inflight.has(inflightKey)) return;
    const got = await this.redis.acquireLock(lockKey, 10000);
    if (!got) return;
    this.inflight.add(inflightKey);
    try {
      await fn();
    } catch (e) {
      this.logger.warn(`trigger ${inflightKey} failed: ${(e as Error).message}`);
    } finally {
      this.inflight.delete(inflightKey);
      await this.redis.releaseLock(lockKey);
    }
  }
}
