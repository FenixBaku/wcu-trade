import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { D, Decimal } from '@wcu/shared';
import type { PositionSide } from '@wcu/shared';

export interface RiskConfig {
  maxLeverage: number;
  marginEnabled: boolean;
  shortEnabled: boolean;
  maintenanceMarginRate: number; // fraction, e.g. 0.005 = 0.5%
}

/**
 * RiskService (§13, §14, §61). Margin, leverage, liquidation and class risk limits.
 * This is simulation only; a liquidation still creates a real virtual trade + ledger event.
 */
@Injectable()
export class RiskService {
  constructor(private readonly config: ConfigService) {}

  defaults(): RiskConfig {
    return {
      maxLeverage: this.config.get<number>('sim.defaultMaxLeverage')!,
      marginEnabled: this.config.get<boolean>('flags.ENABLE_MARGIN') ?? true,
      shortEnabled: this.config.get<boolean>('flags.ENABLE_SHORT_SELLING') ?? true,
      maintenanceMarginRate: 0.005,
    };
  }

  /** Initial margin = notional / leverage. */
  initialMargin(notional: Decimal.Value, leverage: number): Decimal {
    return D(notional).div(Math.max(1, leverage));
  }

  /**
   * Simplified isolated-margin liquidation price (§13).
   *  LONG:  entry * (1 - 1/L + mmr)
   *  SHORT: entry * (1 + 1/L - mmr)
   * At 1x this is ~0 for longs (effectively no liquidation), as expected for spot.
   */
  liquidationPrice(side: PositionSide, entry: Decimal.Value, leverage: number, mmr: number): Decimal {
    const inv = D(1).div(Math.max(1, leverage));
    const factor =
      side === 'LONG' ? D(1).minus(inv).plus(mmr) : D(1).plus(inv).minus(mmr);
    const price = D(entry).mul(factor);
    return price.isNegative() ? D(0) : price;
  }

  /** Validate leverage against the class/system cap. Returns clamped value or throws upstream. */
  validateLeverage(requested: number, cap: number): boolean {
    return requested >= 1 && requested <= cap;
  }

  /**
   * Should this LONG/SHORT position be liquidated at the given mark?
   * LONG liquidates when mark <= liqPrice; SHORT when mark >= liqPrice.
   */
  shouldLiquidate(side: PositionSide, mark: Decimal.Value, liqPrice: Decimal.Value | null): boolean {
    if (liqPrice == null) return false;
    const lp = D(liqPrice);
    if (lp.lte(0)) return false;
    return side === 'LONG' ? D(mark).lte(lp) : D(mark).gte(lp);
  }
}
