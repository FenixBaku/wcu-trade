import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { D, Decimal, bps } from '@wcu/shared';

export interface FeeSchedule {
  makerBps: number;
  takerBps: number;
}

/** FeeService (§15) — fees are config/class-driven, never hardcoded into execution. */
@Injectable()
export class FeeService {
  constructor(private readonly config: ConfigService) {}

  defaultSchedule(): FeeSchedule {
    return {
      makerBps: this.config.get<number>('sim.makerFeeBps')!,
      takerBps: this.config.get<number>('sim.takerFeeBps')!,
    };
  }

  commission(notional: Decimal.Value, feeBps: number): Decimal {
    return bps(notional, feeBps);
  }
}

/** SpreadService (§16) — use provider bid/ask when available; otherwise simulate. */
@Injectable()
export class SpreadService {
  constructor(private readonly config: ConfigService) {}

  /** Returns {bid, ask}. If provider spread looks valid, keep it; else derive from last. */
  resolve(last: Decimal.Value, providerBid?: number, providerAsk?: number): { bid: Decimal; ask: Decimal; simulated: boolean } {
    if (providerBid && providerAsk && providerAsk >= providerBid && providerBid > 0) {
      return { bid: D(providerBid), ask: D(providerAsk), simulated: false };
    }
    const half = bps(last, this.config.get<number>('sim.defaultSpreadBps')! / 2);
    return { bid: D(last).minus(half), ask: D(last).plus(half), simulated: true };
  }
}

/** SlippageService (§17) — configurable model; applied slippage is returned & stored. */
@Injectable()
export class SlippageService {
  constructor(private readonly config: ConfigService) {}

  /** Returns slippage as a signed price delta to apply against the fill base price. */
  compute(basePrice: Decimal.Value, side: 'BUY' | 'SELL'): Decimal {
    const model = this.config.get<string>('sim.slippageModel')!;
    const cfgBps = this.config.get<number>('sim.slippageBps')!;
    let slipBps = 0;
    switch (model) {
      case 'NONE':
        slipBps = 0;
        break;
      case 'RANDOM_BPS':
        slipBps = Math.random() * cfgBps;
        break;
      case 'VOLUME_BASED': // foundation: constant here; hook for depth-aware later
      case 'FIXED_BPS':
      default:
        slipBps = cfgBps;
    }
    const delta = bps(basePrice, slipBps);
    // Buys slip up (worse), sells slip down (worse).
    return side === 'BUY' ? delta : delta.negated();
  }
}
