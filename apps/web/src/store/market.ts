import { create } from 'zustand';
import type { Quote, TradePrint, ProviderHealth } from '@wcu/shared';

interface MarketState {
  quotes: Record<string, Quote>;
  prevPrice: Record<string, number>;
  trades: Record<string, TradePrint[]>;
  health: ProviderHealth | null;
  setQuote: (q: Quote) => void;
  addTrade: (t: TradePrint) => void;
  setHealth: (h: ProviderHealth) => void;
  seedQuotes: (qs: Record<string, Quote>) => void;
}

export const useMarket = create<MarketState>((set) => ({
  quotes: {},
  prevPrice: {},
  trades: {},
  health: null,
  setQuote: (q) =>
    set((s) => ({
      quotes: { ...s.quotes, [q.symbol]: q },
      prevPrice: { ...s.prevPrice, [q.symbol]: s.quotes[q.symbol]?.last ?? q.last },
    })),
  addTrade: (t) =>
    set((s) => {
      const arr = [t, ...(s.trades[t.symbol] ?? [])].slice(0, 40);
      return { trades: { ...s.trades, [t.symbol]: arr } };
    }),
  setHealth: (h) => set({ health: h }),
  seedQuotes: (qs) => set((s) => ({ quotes: { ...qs, ...s.quotes } })),
}));
