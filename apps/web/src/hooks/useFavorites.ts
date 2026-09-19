import { useCallback, useState } from 'react';

const KEY = 'wcu.favorites';
const load = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '["BTC-USDT","ETH-USDT","SOL-USDT"]');
  } catch {
    return ['BTC-USDT'];
  }
};

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(load()));
  const toggle = useCallback((symbol: string) => {
    setFavorites((cur) => {
      const next = new Set(cur);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      localStorage.setItem(KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);
  return { favorites, toggle };
}
