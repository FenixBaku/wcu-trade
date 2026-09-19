import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MarketSymbol, Quote } from '@wcu/shared';
import { useEffect } from 'react';
import { useMarket } from '../store/market';

export interface MarketRow extends MarketSymbol {
  id: string;
  liveQuote: Quote | null;
}

export function useSymbols() {
  const seed = useMarket((s) => s.seedQuotes);
  const q = useQuery({
    queryKey: ['markets'],
    queryFn: async () => (await api.get<MarketRow[]>('/markets')).data,
    staleTime: 60000,
  });
  useEffect(() => {
    if (q.data) {
      const quotes: Record<string, Quote> = {};
      for (const r of q.data) if (r.liveQuote) quotes[r.symbol] = r.liveQuote;
      seed(quotes);
    }
  }, [q.data, seed]);
  return q;
}
