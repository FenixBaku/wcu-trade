import { FeeService, SlippageService, SpreadService } from './pricing.services';
import { SimulationExecutionProvider } from './execution.provider';
import { D, weightedAvg, unrealizedPnl } from '@wcu/shared';
import type { Quote } from '@wcu/shared';

// Minimal ConfigService stub.
function cfg(overrides: Record<string, any> = {}) {
  const base: Record<string, any> = {
    'sim.makerFeeBps': 10,
    'sim.takerFeeBps': 10,
    'sim.slippageModel': 'NONE',
    'sim.slippageBps': 2,
    'sim.defaultSpreadBps': 4,
    ...overrides,
  };
  return { get: (k: string) => base[k] } as any;
}

function quote(partial: Partial<Quote>): Quote {
  return {
    symbol: 'BTC-USDT', bid: 0, ask: 0, last: 0, changePct24h: 0, high24h: 0, low24h: 0,
    volume24h: 0, provider: 'test', ts: Date.now(), ...partial,
  };
}

describe('SimulationExecutionProvider — fill pricing', () => {
  const build = (o: Record<string, any> = {}) => {
    const c = cfg(o);
    return new SimulationExecutionProvider(new FeeService(c), new SpreadService(c), new SlippageService(c));
  };

  it('BUY market fills at the ask (no slippage) and applies taker fee', () => {
    const exec = build();
    const r = exec.fillMarket({ side: 'BUY', quantity: '1', quote: quote({ bid: 64990, ask: 65010, last: 65000 }), feeBps: 10 });
    expect(r.fillPrice.toNumber()).toBe(65010);
    expect(r.commission.toNumber()).toBeCloseTo(65.01, 6); // 65010 * 0.001
    expect(r.slippage.toNumber()).toBe(0);
  });

  it('SELL market fills at the bid (no slippage)', () => {
    const exec = build();
    const r = exec.fillMarket({ side: 'SELL', quantity: '1', quote: quote({ bid: 64990, ask: 65010, last: 65000 }), feeBps: 10 });
    expect(r.fillPrice.toNumber()).toBe(64990);
  });

  it('applies fixed-bps slippage against the trader on BUY', () => {
    const exec = build({ 'sim.slippageModel': 'FIXED_BPS', 'sim.slippageBps': 2 });
    const r = exec.fillMarket({ side: 'BUY', quantity: '1', quote: quote({ bid: 100, ask: 100, last: 100 }), feeBps: 10 });
    // 2 bps of 100 = 0.02 added to the ask
    expect(r.slippage.toNumber()).toBeCloseTo(0.02, 9);
    expect(r.fillPrice.toNumber()).toBeCloseTo(100.02, 9);
  });

  it('simulates a spread when the provider gives no bid/ask', () => {
    const exec = build({ 'sim.defaultSpreadBps': 4 });
    const r = exec.fillMarket({ side: 'BUY', quantity: '1', quote: quote({ bid: 0, ask: 0, last: 100 }), feeBps: 10 });
    expect(r.spreadSimulated).toBe(true);
    // half-spread of 2 bps => ask = 100.02
    expect(r.ask.toNumber()).toBeCloseTo(100.02, 9);
  });

  // §70 CRITICAL FINANCIAL TEST
  it('reproduces the §70 worked example (buy 1 BTC @ 60,000, 0.1% fee)', () => {
    const exec = build();
    const r = exec.fillMarket({ side: 'BUY', quantity: '1', quote: quote({ bid: 60000, ask: 60000, last: 60000 }), feeBps: 10 });
    expect(r.fillPrice.toNumber()).toBe(60000);
    expect(r.commission.toNumber()).toBeCloseTo(60, 6);

    // Cash accounting at leverage 1: reserve margin (=notional) + commission.
    const margin = r.notional; // /1
    const cashReduction = margin.plus(r.commission);
    expect(cashReduction.toNumber()).toBeCloseTo(60060, 6);
    const remaining = D(100000).minus(cashReduction);
    expect(remaining.toNumber()).toBeCloseTo(39940, 6);

    // Mark to 62,000 => unrealized +2,000
    const upnl = unrealizedPnl('LONG', '1', '60000', '62000');
    expect(upnl.toNumber()).toBeCloseTo(2000, 6);

    // Close at 62,000: exit fee 62, realized gross 2,000 => net +1,938 on the round trip after both fees
    const exit = exec.fillMarket({ side: 'SELL', quantity: '1', quote: quote({ bid: 62000, ask: 62000, last: 62000 }), feeBps: 10 });
    expect(exit.commission.toNumber()).toBeCloseTo(62, 6);
    const netRoundTrip = upnl.minus(r.commission).minus(exit.commission);
    expect(netRoundTrip.toNumber()).toBeCloseTo(1878, 6); // 2000 - 60 - 62
  });
});

describe('position math', () => {
  it('weighted average entry (1@60000 + 1@62000 => 61000)', () => {
    expect(weightedAvg('1', '60000', '1', '62000').toNumber()).toBe(61000);
  });

  it('SHORT unrealized P&L is positive when price falls', () => {
    expect(unrealizedPnl('SHORT', '2', '100', '90').toNumber()).toBe(20);
    expect(unrealizedPnl('SHORT', '2', '100', '110').toNumber()).toBe(-20);
  });

  it('LONG unrealized P&L is positive when price rises', () => {
    expect(unrealizedPnl('LONG', '0.5', '100', '120').toNumber()).toBe(10);
  });
});
