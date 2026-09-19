import { RiskService } from './risk.service';

const cfg = { get: (k: string) => ({ 'sim.defaultMaxLeverage': 10, 'flags.ENABLE_MARGIN': true, 'flags.ENABLE_SHORT_SELLING': true }[k]) } as any;

describe('RiskService', () => {
  const risk = new RiskService(cfg);

  it('initial margin = notional / leverage', () => {
    expect(risk.initialMargin('10000', 10).toNumber()).toBe(1000);
    expect(risk.initialMargin('10000', 1).toNumber()).toBe(10000);
  });

  it('LONG liquidation is below entry and scales with leverage', () => {
    const liq10 = risk.liquidationPrice('LONG', '100', 10, 0.005).toNumber();
    const liq2 = risk.liquidationPrice('LONG', '100', 2, 0.005).toNumber();
    expect(liq10).toBeGreaterThan(liq2); // higher leverage => closer to entry
    expect(liq10).toBeLessThan(100);
  });

  it('SHORT liquidation is above entry', () => {
    expect(risk.liquidationPrice('SHORT', '100', 10, 0.005).toNumber()).toBeGreaterThan(100);
  });

  it('liquidation direction: LONG liquidates when mark <= liq price', () => {
    expect(risk.shouldLiquidate('LONG', '90', '91')).toBe(true);
    expect(risk.shouldLiquidate('LONG', '92', '91')).toBe(false);
    expect(risk.shouldLiquidate('SHORT', '110', '109')).toBe(true);
  });

  it('validates leverage against the cap', () => {
    expect(risk.validateLeverage(5, 10)).toBe(true);
    expect(risk.validateLeverage(11, 10)).toBe(false);
    expect(risk.validateLeverage(0, 10)).toBe(false);
  });
});
