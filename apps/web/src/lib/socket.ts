import { io, Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';
import { useMarket } from '../store/market';
import { usePortfolio } from '../store/portfolio';
import { WS_TOPICS } from '@wcu/shared';

let socket: Socket | null = null;
const subscribed = new Set<string>();
const toastListeners: ((n: any) => void)[] = [];

export function onToast(fn: (n: any) => void) {
  toastListeners.push(fn);
  return () => {
    const i = toastListeners.indexOf(fn);
    if (i >= 0) toastListeners.splice(i, 1);
  };
}

export function connectSocket() {
  const token = useAuth.getState().accessToken;
  const userId = useAuth.getState().user?.id;
  if (!token || socket) return;

  socket = io('/', { auth: { token }, transports: ['websocket'], reconnection: true });

  socket.on('market.status', (h) => useMarket.getState().setHealth(h));

  socket.onAny((event: string, payload: any) => {
    if (event.startsWith('market.quote.')) useMarket.getState().setQuote(payload);
    else if (event.startsWith('market.trade.')) useMarket.getState().addTrade(payload);
  });

  if (userId) {
    socket.on(WS_TOPICS.portfolio(userId), (data: any) => {
      usePortfolio.getState().set({ summary: data.summary, positions: data.positions });
    });
    socket.on(WS_TOPICS.orders(userId), () => usePortfolio.getState().bumpOrders());
    socket.on(WS_TOPICS.notifications(userId), (n: any) => toastListeners.forEach((f) => f(n)));
  }

  // Re-subscribe on reconnect
  socket.on('connect', () => {
    if (subscribed.size) socket!.emit('subscribe', { symbols: [...subscribed] });
  });
}

export function subscribeSymbols(symbols: string[]) {
  symbols.forEach((s) => subscribed.add(s));
  socket?.emit('subscribe', { symbols });
}

export function unsubscribeSymbols(symbols: string[]) {
  symbols.forEach((s) => subscribed.delete(s));
  socket?.emit('unsubscribe', { symbols });
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  subscribed.clear();
}
