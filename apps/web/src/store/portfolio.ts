import { create } from 'zustand';
import type { AccountSummary, PositionView } from '@wcu/shared';

interface PortfolioState {
  summary: AccountSummary | null;
  positions: PositionView[];
  ordersDirty: number; // bump to trigger refetch
  set: (p: { summary?: AccountSummary; positions?: PositionView[] }) => void;
  bumpOrders: () => void;
}

export const usePortfolio = create<PortfolioState>((set) => ({
  summary: null,
  positions: [],
  ordersDirty: 0,
  set: (p) => set((s) => ({ summary: p.summary ?? s.summary, positions: p.positions ?? s.positions })),
  bumpOrders: () => set((s) => ({ ordersDirty: s.ordersDirty + 1 })),
}));
