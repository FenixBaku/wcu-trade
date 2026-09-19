import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, OrderStatus, OrderSide, PositionSide, OrderType, MarginMode } from '@prisma/client';
import { D, Decimal, weightedAvg, unrealizedPnl } from '@wcu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MarketDataService } from '../market-data/market-data.service';
import { SymbolRegistryService } from '../market-data/symbol-registry.service';
import { LedgerService } from '../ledger/ledger.service';
import { SimulationExecutionProvider } from '../execution/execution.provider';
import { FeeService } from '../execution/pricing.services';
import { RiskService } from '../risk/risk.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { NotificationService } from '../notifications/notification.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuditService } from '../audit/audit.service';
import { TradingErrors } from '../common/exceptions';
import { WS_TOPICS } from '@wcu/shared';
import { PlaceOrderDto, EditPositionDto } from './dto';

type Tx = Prisma.TransactionClient;

interface TradingConfig {
  maxLeverage: number;
  marginEnabled: boolean;
  shortEnabled: boolean;
  makerBps: number;
  takerBps: number;
  maxCryptoPct: Decimal;
  status: string;
}

interface FillDescriptor {
  fillPrice: Decimal;
  marketPrice: Decimal;
  slippage: Decimal;
  commission: Decimal;
  feeBps: number;
}

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly mmr = 0.005; // maintenance margin rate

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly md: MarketDataService,
    private readonly registry: SymbolRegistryService,
    private readonly ledger: LedgerService,
    private readonly exec: SimulationExecutionProvider,
    private readonly fees: FeeService,
    private readonly risk: RiskService,
    private readonly portfolio: PortfolioService,
    private readonly notifications: NotificationService,
    private readonly gateway: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  // ---- account & config resolution ----
  async getPrimaryAccount(userId: string) {
    const account = await this.prisma.virtualAccount.findFirst({
      where: { userId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!account) throw new NotFoundException('No virtual account for this user');
    return account;
  }

  async resolveConfig(userId: string): Promise<TradingConfig> {
    const membership = await this.prisma.classStudent.findFirst({
      where: { userId },
      include: { class: true },
      orderBy: { addedAt: 'desc' },
    });
    if (membership) {
      const c = membership.class;
      return {
        maxLeverage: c.maxLeverage,
        marginEnabled: c.marginEnabled,
        shortEnabled: c.shortEnabled,
        makerBps: c.makerFeeBps,
        takerBps: c.takerFeeBps,
        maxCryptoPct: D(c.maxCryptoPct.toString()),
        status: 'ACTIVE',
      };
    }
    const f = this.fees.defaultSchedule();
    return {
      maxLeverage: this.config.get<number>('sim.defaultMaxLeverage')!,
      marginEnabled: this.config.get<boolean>('flags.ENABLE_MARGIN') ?? true,
      shortEnabled: this.config.get<boolean>('flags.ENABLE_SHORT_SELLING') ?? true,
      makerBps: f.makerBps,
      takerBps: f.takerBps,
      maxCryptoPct: D(100),
      status: 'ACTIVE',
    };
  }

  // ---- public entrypoint ----
  async placeOrder(userId: string, dto: PlaceOrderDto, meta: { ip?: string } = {}) {
    const asset = this.registry.get(dto.symbol);
    if (!asset) throw TradingErrors.INSTRUMENT_NOT_ALLOWED(dto.symbol);
    const qty = D(dto.quantity);
    if (!qty.isFinite() || qty.lte(0)) throw TradingErrors.INVALID_QUANTITY();

    const account = await this.getPrimaryAccount(userId);
    if (account.status !== 'ACTIVE') throw TradingErrors.TRADING_SUSPENDED();
    const cfg = await this.resolveConfig(userId);

    const leverage = Math.max(1, dto.leverage ?? 1);
    if (!this.risk.validateLeverage(leverage, cfg.maxLeverage))
      throw TradingErrors.MAX_LEVERAGE_EXCEEDED(cfg.maxLeverage);

    // Determine intended position direction for short-selling guard (opening only).
    const openPos = await this.prisma.position.findFirst({
      where: { accountId: account.id, assetId: asset.id, closedAt: null },
    });
    const isOpeningShort = dto.side === 'SELL' && !openPos;
    if (isOpeningShort && !cfg.shortEnabled) throw TradingErrors.SHORT_DISABLED();

    // Idempotency
    if (dto.clientOrderId) {
      const existing = await this.prisma.order.findUnique({ where: { clientOrderId: dto.clientOrderId } });
      if (existing) return this.orderView(existing.id);
    }

    if (dto.type === 'MARKET') return this.placeMarket(userId, account.id, asset, dto, cfg, leverage, meta);
    return this.placeResting(userId, account.id, asset, dto, leverage);
  }

  // ---- MARKET order: validate freshness, execute immediately & atomically ----
  private async placeMarket(
    userId: string,
    accountId: string,
    asset: { id: string; symbol: string; assetClass: string; pricePrecision: number },
    dto: PlaceOrderDto,
    cfg: TradingConfig,
    leverage: number,
    meta: { ip?: string },
  ) {
    if (!this.md.isFresh(asset.symbol)) {
      const q = await this.md.getQuote(asset.symbol);
      if (!q) throw TradingErrors.MARKET_UNAVAILABLE(asset.symbol);
      if (!this.md.isFresh(asset.symbol)) throw TradingErrors.MARKET_STALE(asset.symbol);
    }
    const quote = await this.md.getQuote(asset.symbol);
    if (!quote) throw TradingErrors.MARKET_UNAVAILABLE(asset.symbol);

    const qty = D(dto.quantity);
    this.validateTpSl(dto, dto.side, D(quote.last));

    const lockKey = `lock:account:${accountId}`;
    const locked = await this.redis.acquireLock(lockKey, 8000);
    try {
      const orderId = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT id FROM "VirtualAccount" WHERE id = ${accountId} FOR UPDATE`;

          const fill = this.exec.fillMarket({
            side: dto.side,
            quantity: qty,
            quote,
            feeBps: cfg.takerBps,
          });

          const order = await tx.order.create({
            data: {
              accountId,
              assetId: asset.id,
              side: dto.side,
              positionSide: dto.side === 'BUY' ? PositionSide.LONG : PositionSide.SHORT,
              type: OrderType.MARKET,
              status: OrderStatus.NEW,
              quantity: qty.toString(),
              requestedPrice: quote.last.toString(),
              takeProfitPrice: dto.takeProfitPrice ?? null,
              stopLossPrice: dto.stopLossPrice ?? null,
              leverage,
              marginMode: dto.marginMode ?? MarginMode.ISOLATED,
              reduceOnly: dto.reduceOnly ?? false,
              clientOrderId: dto.clientOrderId ?? null,
            },
          });
          await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.NEW } });

          const desc: FillDescriptor = {
            fillPrice: fill.fillPrice,
            marketPrice: fill.marketPrice,
            slippage: fill.slippage,
            commission: fill.commission,
            feeBps: cfg.takerBps,
          };
          const result = await this.settleFill(tx, {
            accountId,
            asset,
            side: dto.side,
            qty,
            desc,
            leverage,
            marginMode: dto.marginMode ?? MarginMode.ISOLATED,
            orderId: order.id,
            providerTs: new Date(quote.ts),
          });

          // Attach TP/SL to the resulting (opened) position.
          if (result.positionId && (dto.takeProfitPrice || dto.stopLossPrice)) {
            await tx.position.update({
              where: { id: result.positionId },
              data: {
                takeProfitPrice: dto.takeProfitPrice ?? undefined,
                stopLossPrice: dto.stopLossPrice ?? undefined,
              },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.FILLED,
              filledQuantity: qty.toString(),
              averageFillPrice: fill.fillPrice.toString(),
              fee: fill.commission.toString(),
              slippage: fill.slippage.toString(),
              filledAt: new Date(),
            },
          });
          await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.FILLED } });
          return order.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );

      await this.audit.log({
        actorId: userId,
        action: 'order.market.fill',
        target: orderId,
        newData: { symbol: asset.symbol, side: dto.side, qty: dto.quantity },
        ip: meta.ip,
      });
      await this.afterTrade(userId, accountId, asset.symbol);
      await this.notifications.push(
        userId,
        'ORDER_FILLED',
        'Order Filled',
        `${dto.side} ${dto.quantity} ${asset.symbol} executed`,
        { symbol: asset.symbol },
      );
      return this.orderView(orderId);
    } finally {
      if (locked) await this.redis.releaseLock(lockKey);
    }
  }

  // ---- Resting orders (LIMIT / STOP / STOP_LIMIT / TRAILING_STOP) ----
  private async placeResting(
    userId: string,
    accountId: string,
    asset: { id: string; symbol: string },
    dto: PlaceOrderDto,
    leverage: number,
  ) {
    const order = await this.prisma.order.create({
      data: {
        accountId,
        assetId: asset.id,
        side: dto.side,
        positionSide: dto.side === 'BUY' ? PositionSide.LONG : PositionSide.SHORT,
        type: dto.type,
        status: OrderStatus.OPEN,
        quantity: D(dto.quantity).toString(),
        limitPrice: dto.limitPrice ?? null,
        stopPrice: dto.stopPrice ?? null,
        takeProfitPrice: dto.takeProfitPrice ?? null,
        stopLossPrice: dto.stopLossPrice ?? null,
        trailingDelta: dto.trailingDelta ?? null,
        trailingAnchor: dto.trailingDelta ? (this.md.getLatest(asset.symbol)?.last?.toString() ?? null) : null,
        leverage,
        marginMode: dto.marginMode ?? MarginMode.ISOLATED,
        reduceOnly: dto.reduceOnly ?? false,
        clientOrderId: dto.clientOrderId ?? null,
      },
    });
    await this.prisma.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.OPEN } });
    await this.audit.log({ actorId: userId, action: 'order.resting.create', target: order.id });
    this.gateway.emitToUser(userId, WS_TOPICS.orders(userId), { type: 'created', orderId: order.id });
    return this.orderView(order.id);
  }

  /**
   * Core position + ledger settlement for a single fill. Handles open/increase (weighted
   * average entry), reduce/close (realized P&L + margin release), and flip.
   * Must run inside a transaction holding the account row lock.
   */
  private async settleFill(
    tx: Tx,
    p: {
      accountId: string;
      asset: { id: string; symbol: string };
      side: OrderSide;
      qty: Decimal;
      desc: FillDescriptor;
      leverage: number;
      marginMode: MarginMode;
      orderId: string;
      providerTs?: Date;
    },
  ): Promise<{ positionId: string | null; realizedGross: Decimal; closed: boolean }> {
    const { accountId, asset, side, qty, desc, leverage, marginMode, orderId } = p;
    const fillPrice = desc.fillPrice;

    // Commission always charged.
    await this.ledger.post(tx, accountId, 'COMMISSION', desc.commission.negated(), {
      refOrderId: orderId,
      memo: 'Trading commission',
    });
    await this.ledger.addRealizedPnl(tx, accountId, desc.commission.negated());

    const openPos = await tx.position.findFirst({
      where: { accountId, assetId: asset.id, closedAt: null },
    });

    const orderIsLong = side === 'BUY';
    let realizedGross = D(0);
    let resultingPositionId: string | null = openPos?.id ?? null;
    let closed = false;

    const sameDirection =
      openPos && ((openPos.side === 'LONG' && orderIsLong) || (openPos.side === 'SHORT' && !orderIsLong));

    if (!openPos || sameDirection) {
      // ---- OPEN or INCREASE ----
      const addNotional = fillPrice.mul(qty);
      const addMargin = this.risk.initialMargin(addNotional, leverage);
      // Commission was already deducted above, so only the margin must still fit.
      const account = await tx.virtualAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (D(account.cashBalance.toString()).lt(addMargin)) throw TradingErrors.INSUFFICIENT_BALANCE();

      await this.ledger.post(tx, accountId, 'MARGIN_RESERVE', addMargin.negated(), {
        refOrderId: orderId,
        memo: 'Initial margin reserve',
      });

      if (!openPos) {
        const posSide: PositionSide = orderIsLong ? 'LONG' : 'SHORT';
        const liq = this.risk.liquidationPrice(posSide, fillPrice, leverage, this.mmr);
        const pos = await tx.position.create({
          data: {
            accountId,
            assetId: asset.id,
            side: posSide,
            quantity: qty.toString(),
            avgEntryPrice: fillPrice.toString(),
            usedMargin: addMargin.toString(),
            leverage,
            marginMode,
            liquidationPrice: liq.toString(),
          },
        });
        resultingPositionId = pos.id;
      } else {
        const newQty = D(openPos.quantity.toString()).plus(qty);
        const newAvg = weightedAvg(openPos.quantity.toString(), openPos.avgEntryPrice.toString(), qty, fillPrice);
        const liq = this.risk.liquidationPrice(openPos.side, newAvg, leverage, this.mmr);
        await tx.position.update({
          where: { id: openPos.id },
          data: {
            quantity: newQty.toString(),
            avgEntryPrice: newAvg.toString(),
            usedMargin: D(openPos.usedMargin.toString()).plus(addMargin).toString(),
            liquidationPrice: liq.toString(),
          },
        });
      }
    } else {
      // ---- REDUCE / CLOSE / FLIP ----
      const posQty = D(openPos.quantity.toString());
      const closeQty = Decimal.min(qty, posQty);
      realizedGross =
        openPos.side === 'LONG'
          ? fillPrice.minus(openPos.avgEntryPrice.toString()).mul(closeQty)
          : D(openPos.avgEntryPrice.toString()).minus(fillPrice).mul(closeQty);

      const releasedMargin = D(openPos.usedMargin.toString()).mul(closeQty.div(posQty));
      await this.ledger.post(tx, accountId, 'MARGIN_RELEASE', releasedMargin, {
        refOrderId: orderId,
        memo: 'Margin release on close',
      });
      await this.ledger.post(tx, accountId, 'REALIZED_PNL', realizedGross, {
        refOrderId: orderId,
        memo: 'Realized P&L',
      });
      await this.ledger.addRealizedPnl(tx, accountId, realizedGross);

      const remaining = posQty.minus(closeQty);
      if (remaining.lte(0)) {
        await tx.position.update({
          where: { id: openPos.id },
          data: {
            quantity: '0',
            usedMargin: '0',
            realizedPnl: D(openPos.realizedPnl.toString()).plus(realizedGross).toString(),
            closedAt: new Date(),
          },
        });
        closed = true;
        resultingPositionId = null;

        // FLIP: leftover opens a new opposite position.
        const leftover = qty.minus(posQty);
        if (leftover.gt(0)) {
          const posSide: PositionSide = orderIsLong ? 'LONG' : 'SHORT';
          const notional = fillPrice.mul(leftover);
          const margin = this.risk.initialMargin(notional, leverage);
          const account = await tx.virtualAccount.findUniqueOrThrow({ where: { id: accountId } });
          if (D(account.cashBalance.toString()).lt(margin)) throw TradingErrors.INSUFFICIENT_BALANCE();
          await this.ledger.post(tx, accountId, 'MARGIN_RESERVE', margin.negated(), {
            refOrderId: orderId,
            memo: 'Initial margin reserve (flip)',
          });
          const liq = this.risk.liquidationPrice(posSide, fillPrice, leverage, this.mmr);
          const pos = await tx.position.create({
            data: {
              accountId,
              assetId: asset.id,
              side: posSide,
              quantity: leftover.toString(),
              avgEntryPrice: fillPrice.toString(),
              usedMargin: margin.toString(),
              leverage,
              marginMode,
              liquidationPrice: liq.toString(),
            },
          });
          resultingPositionId = pos.id;
          closed = false;
        }
      } else {
        await tx.position.update({
          where: { id: openPos.id },
          data: {
            quantity: remaining.toString(),
            usedMargin: D(openPos.usedMargin.toString()).minus(releasedMargin).toString(),
            realizedPnl: D(openPos.realizedPnl.toString()).plus(realizedGross).toString(),
          },
        });
      }
    }

    // Immutable trade record.
    await tx.trade.create({
      data: {
        orderId,
        accountId,
        assetId: asset.id,
        side,
        quantity: qty.toString(),
        marketPrice: desc.marketPrice.toString(),
        fillPrice: fillPrice.toString(),
        commission: desc.commission.toString(),
        slippage: desc.slippage.toString(),
        realizedPnl: realizedGross.toString(),
        providerTimestamp: p.providerTs,
      },
    });

    return { positionId: resultingPositionId, realizedGross, closed };
  }

  // ---- close a whole position at market (user action or trigger) ----
  async closePosition(userId: string, positionId: string, reason = 'manual') {
    const account = await this.getPrimaryAccount(userId);
    const pos = await this.prisma.position.findFirst({
      where: { id: positionId, accountId: account.id, closedAt: null },
      include: { asset: true },
    });
    if (!pos) throw TradingErrors.POSITION_NOT_FOUND();
    const cfg = await this.resolveConfig(userId);
    await this.executeClose(userId, account.id, pos, cfg.takerBps, reason);
    return { ok: true };
  }

  /** Shared close routine used by manual close, TP, SL, and liquidation. */
  private async executeClose(
    userId: string,
    accountId: string,
    pos: { id: string; assetId: string; side: PositionSide; quantity: any; asset: { id: string; symbol: string } },
    feeBps: number,
    reason: string,
    forcedPrice?: Decimal,
  ) {
    const quote = await this.md.getQuote(pos.asset.symbol);
    if (!quote && !forcedPrice) throw TradingErrors.MARKET_UNAVAILABLE(pos.asset.symbol);
    const closeSide: OrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const qty = D(pos.quantity.toString());

    const lockKey = `lock:account:${accountId}`;
    const locked = await this.redis.acquireLock(lockKey, 8000);
    try {
      const orderId = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT id FROM "VirtualAccount" WHERE id = ${accountId} FOR UPDATE`;
          let desc: FillDescriptor;
          if (forcedPrice) {
            const notional = forcedPrice.mul(qty);
            desc = {
              fillPrice: forcedPrice,
              marketPrice: forcedPrice,
              slippage: D(0),
              commission: this.fees.commission(notional, feeBps),
              feeBps,
            };
          } else {
            const fill = this.exec.fillMarket({ side: closeSide, quantity: qty, quote: quote!, feeBps });
            desc = {
              fillPrice: fill.fillPrice,
              marketPrice: fill.marketPrice,
              slippage: fill.slippage,
              commission: fill.commission,
              feeBps,
            };
          }
          const order = await tx.order.create({
            data: {
              accountId,
              assetId: pos.assetId,
              side: closeSide,
              positionSide: pos.side,
              type: OrderType.MARKET,
              status: OrderStatus.FILLED,
              quantity: qty.toString(),
              requestedPrice: desc.marketPrice.toString(),
              averageFillPrice: desc.fillPrice.toString(),
              filledQuantity: qty.toString(),
              fee: desc.commission.toString(),
              slippage: desc.slippage.toString(),
              reduceOnly: true,
              filledAt: new Date(),
              rejectReason: reason === 'manual' ? null : `close:${reason}`,
            },
          });
          await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.FILLED, note: reason } });
          await this.settleFill(tx, {
            accountId,
            asset: pos.asset,
            side: closeSide,
            qty,
            desc,
            leverage: 1,
            marginMode: MarginMode.ISOLATED,
            orderId: order.id,
            providerTs: quote ? new Date(quote.ts) : new Date(),
          });
          return order.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );
      await this.audit.log({ actorId: userId, action: `position.close.${reason}`, target: pos.id });
      await this.afterTrade(userId, accountId, pos.asset.symbol);
      return orderId;
    } finally {
      if (locked) await this.redis.releaseLock(lockKey);
    }
  }

  // ---- trigger engine hooks ----
  /** Execute a resting LIMIT/STOP/STOP_LIMIT order that the trigger engine matched. */
  async fillRestingOrder(order: {
    id: string;
    accountId: string;
    assetId: string;
    side: OrderSide;
    type: OrderType;
    quantity: any;
    limitPrice: any;
    leverage: number;
    marginMode: MarginMode;
  }, symbol: string, matchPrice: Decimal) {
    const asset = { id: order.assetId, symbol };
    const quote = await this.md.getQuote(symbol);
    const cfg = { takerBps: this.fees.defaultSchedule().takerBps, makerBps: this.fees.defaultSchedule().makerBps };
    const qty = D(order.quantity.toString());

    const lockKey = `lock:account:${order.accountId}`;
    const locked = await this.redis.acquireLock(lockKey, 8000);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT id FROM "VirtualAccount" WHERE id = ${order.accountId} FOR UPDATE`;
          const current = await tx.order.findUnique({ where: { id: order.id } });
          if (!current || current.status !== 'OPEN') return; // idempotency guard
          let desc: FillDescriptor;
          if ((order.type === 'LIMIT' || order.type === 'STOP_LIMIT') && order.limitPrice) {
            const price = D(order.limitPrice.toString());
            const notional = price.mul(qty);
            desc = { fillPrice: price, marketPrice: D(matchPrice), slippage: D(0), commission: this.fees.commission(notional, cfg.makerBps), feeBps: cfg.makerBps };
          } else {
            const fill = this.exec.fillMarket({ side: order.side, quantity: qty, quote: quote ?? ({ last: matchPrice.toNumber(), bid: matchPrice.toNumber(), ask: matchPrice.toNumber() } as any), feeBps: cfg.takerBps });
            desc = { fillPrice: fill.fillPrice, marketPrice: fill.marketPrice, slippage: fill.slippage, commission: fill.commission, feeBps: cfg.takerBps };
          }
          const result = await this.settleFill(tx, {
            accountId: order.accountId,
            asset,
            side: order.side,
            qty,
            desc,
            leverage: order.leverage,
            marginMode: order.marginMode,
            orderId: order.id,
            providerTs: new Date(),
          });
          if (result.positionId && (current.takeProfitPrice || current.stopLossPrice)) {
            await tx.position.update({
              where: { id: result.positionId },
              data: {
                takeProfitPrice: current.takeProfitPrice ?? undefined,
                stopLossPrice: current.stopLossPrice ?? undefined,
              },
            });
          }
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.FILLED,
              filledQuantity: qty.toString(),
              averageFillPrice: desc.fillPrice.toString(),
              fee: desc.commission.toString(),
              slippage: desc.slippage.toString(),
              triggeredAt: new Date(),
              filledAt: new Date(),
            },
          });
          await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.FILLED, note: 'trigger' } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      );
      const account = await this.prisma.virtualAccount.findUnique({ where: { id: order.accountId } });
      if (account) {
        await this.afterTrade(account.userId, order.accountId, symbol);
        await this.notifications.push(account.userId, 'LIMIT_FILLED', 'Order Filled', `${order.side} ${qty.toString()} ${symbol} filled`, { symbol });
      }
    } finally {
      if (locked) await this.redis.releaseLock(lockKey);
    }
  }

  /** Close a position from a TP/SL trigger at the level price. */
  async triggerClose(positionId: string, reason: 'TP' | 'SL', level: Decimal) {
    const pos = await this.prisma.position.findFirst({
      where: { id: positionId, closedAt: null },
      include: { asset: true, account: true },
    });
    if (!pos) return;
    const cfg = await this.resolveConfig(pos.account.userId);
    await this.executeClose(pos.account.userId, pos.accountId, pos, cfg.takerBps, reason, level);
    const notifType = reason === 'TP' ? 'TAKE_PROFIT_TRIGGERED' : 'STOP_LOSS_TRIGGERED';
    const title = reason === 'TP' ? 'Take Profit Executed' : 'Stop Loss Executed';
    await this.notifications.push(pos.account.userId, notifType, title, `${pos.asset.symbol} ${reason} at ${level.toDecimalPlaces(2).toString()}`, { symbol: pos.asset.symbol });
  }

  /** Liquidate a position (§13). Produces a real virtual trade + ledger event + notice. */
  async liquidate(positionId: string, markPrice: Decimal) {
    const pos = await this.prisma.position.findFirst({
      where: { id: positionId, closedAt: null },
      include: { asset: true, account: true },
    });
    if (!pos) return;
    const cfg = await this.resolveConfig(pos.account.userId);
    await this.executeClose(pos.account.userId, pos.accountId, pos, cfg.takerBps, 'LIQUIDATION', markPrice);
    const loss = unrealizedPnl(pos.side, pos.quantity.toString(), pos.avgEntryPrice.toString(), markPrice);
    await this.notifications.push(
      pos.account.userId,
      'POSITION_LIQUIDATED',
      'Position Liquidated',
      `${pos.asset.symbol} ${pos.side} liquidated at ${markPrice.toDecimalPlaces(2).toString()}`,
      { symbol: pos.asset.symbol, loss: loss.toDecimalPlaces(2).toString() },
    );
  }

  // ---- edit / cancel ----
  async editPositionTpSl(userId: string, positionId: string, dto: EditPositionDto) {
    const account = await this.getPrimaryAccount(userId);
    const pos = await this.prisma.position.findFirst({ where: { id: positionId, accountId: account.id, closedAt: null } });
    if (!pos) throw TradingErrors.POSITION_NOT_FOUND();
    await this.prisma.position.update({
      where: { id: positionId },
      data: {
        takeProfitPrice: dto.takeProfitPrice === undefined ? undefined : dto.takeProfitPrice,
        stopLossPrice: dto.stopLossPrice === undefined ? undefined : dto.stopLossPrice,
      },
    });
    await this.audit.log({ actorId: userId, action: 'position.edit.tpsl', target: positionId, newData: dto });
    await this.afterTrade(userId, account.id, pos.assetId);
    return { ok: true };
  }

  async cancelOrder(userId: string, orderId: string) {
    const account = await this.getPrimaryAccount(userId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, accountId: account.id } });
    if (!order) throw TradingErrors.ORDER_NOT_FOUND();
    if (!['OPEN', 'NEW', 'PARTIALLY_FILLED'].includes(order.status)) throw TradingErrors.ORDER_NOT_FOUND();
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() } });
    await this.prisma.orderEvent.create({ data: { orderId, status: OrderStatus.CANCELLED } });
    await this.audit.log({ actorId: userId, action: 'order.cancel', target: orderId });
    this.gateway.emitToUser(userId, WS_TOPICS.orders(userId), { type: 'cancelled', orderId });
    return { ok: true };
  }

  async cancelAll(userId: string) {
    const account = await this.getPrimaryAccount(userId);
    const open = await this.prisma.order.findMany({ where: { accountId: account.id, status: { in: ['OPEN', 'NEW', 'PARTIALLY_FILLED'] } } });
    for (const o of open) {
      await this.prisma.order.update({ where: { id: o.id }, data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() } });
      await this.prisma.orderEvent.create({ data: { orderId: o.id, status: OrderStatus.CANCELLED } });
    }
    await this.audit.log({ actorId: userId, action: 'order.cancel.all', target: account.id });
    this.gateway.emitToUser(userId, WS_TOPICS.orders(userId), { type: 'cancelledAll' });
    return { cancelled: open.length };
  }

  async closeAll(userId: string) {
    const account = await this.getPrimaryAccount(userId);
    const positions = await this.prisma.position.findMany({ where: { accountId: account.id, closedAt: null }, include: { asset: true } });
    const cfg = await this.resolveConfig(userId);
    for (const p of positions) {
      try {
        await this.executeClose(userId, account.id, p, cfg.takerBps, 'manual');
      } catch (e) {
        this.logger.warn(`closeAll: failed to close ${p.id}: ${(e as Error).message}`);
      }
    }
    return { closed: positions.length };
  }

  // ---- helpers ----
  private validateTpSl(dto: PlaceOrderDto, side: OrderSide, refPrice: Decimal) {
    if (dto.takeProfitPrice) {
      const tp = D(dto.takeProfitPrice);
      if (side === 'BUY' && tp.lte(refPrice)) throw TradingErrors.INVALID_TAKE_PROFIT();
      if (side === 'SELL' && tp.gte(refPrice)) throw TradingErrors.INVALID_TAKE_PROFIT();
    }
    if (dto.stopLossPrice) {
      const sl = D(dto.stopLossPrice);
      if (side === 'BUY' && sl.gte(refPrice)) throw TradingErrors.INVALID_STOP_LOSS();
      if (side === 'SELL' && sl.lte(refPrice)) throw TradingErrors.INVALID_STOP_LOSS();
    }
  }

  private async afterTrade(userId: string, accountId: string, _symbol: string) {
    try {
      const [summary, positions] = await Promise.all([
        this.portfolio.summary(accountId),
        this.portfolio.positionViews(accountId),
      ]);
      await this.portfolio.snapshot(accountId).catch(() => undefined);
      this.gateway.emitToUser(userId, WS_TOPICS.portfolio(userId), { summary, positions });
      this.gateway.emitToUser(userId, WS_TOPICS.orders(userId), { type: 'update' });
    } catch (e) {
      this.logger.warn(`afterTrade emit failed: ${(e as Error).message}`);
    }
  }

  async orderView(orderId: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { asset: true } });
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
