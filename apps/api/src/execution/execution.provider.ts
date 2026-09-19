import { Injectable } from '@nestjs/common';
import { D, Decimal } from '@wcu/shared';
import type { Quote } from '@wcu/shared';
import { FeeService, SlippageService, SpreadService } from './pricing.services';

export interface FillRequest {
  side: 'BUY' | 'SELL';
  quantity: Decimal.Value;
  quote: Quote;
  feeBps: number; // taker/maker bps to apply
}

export interface FillResult {
  marketPrice: Decimal; // reference (mid/last)
  bid: Decimal;
  ask: Decimal;
  basePrice: Decimal; // side base before slippage (ask for buy, bid for sell)
  slippage: Decimal; // signed price delta applied
  fillPrice: Decimal; // final executed price per unit
  notional: Decimal; // fillPrice * qty
  commission: Decimal;
  spreadSimulated: boolean;
}

/**
 * IExecutionProvider abstraction (§35). Phase 1 = SimulationExecutionProvider.
 * The trading engine depends on this interface only, so a future regulated
 * BrokerExecutionProvider can replace it without touching the engine.
 */
export interface IExecutionProvider {
  readonly kind: string;
  fillMarket(req: FillRequest): FillResult;
}

@Injectable()
export class SimulationExecutionProvider implements IExecutionProvider {
  readonly kind = 'SIMULATION';

  constructor(
    private readonly fees: FeeService,
    private readonly spreads: SpreadService,
    private readonly slippage: SlippageService,
  ) {}

  fillMarket(req: FillRequest): FillResult {
    const { side, quote } = req;
    const qty = D(req.quantity);
    const { bid, ask, simulated } = this.spreads.resolve(quote.last, quote.bid, quote.ask);
    const marketPrice = bid.plus(ask).div(2);
    const basePrice = side === 'BUY' ? ask : bid;
    const slip = this.slippage.compute(basePrice, side);
    const fillPrice = basePrice.plus(slip);
    const notional = fillPrice.mul(qty);
    const commission = this.fees.commission(notional, req.feeBps);
    return {
      marketPrice,
      bid,
      ask,
      basePrice,
      slippage: slip,
      fillPrice,
      notional,
      commission,
      spreadSimulated: simulated,
    };
  }
}
