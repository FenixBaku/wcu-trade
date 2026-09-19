import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSymbols } from '../hooks/useSymbols';
import { useFavorites } from '../hooks/useFavorites';
import { subscribeSymbols } from '../lib/socket';
import MarketList from '../components/MarketList';
import SymbolHeader from '../components/SymbolHeader';
import Chart from '../components/Chart';
import OrderBook from '../components/OrderBook';
import RecentTrades from '../components/RecentTrades';
import OrderEntry from '../components/OrderEntry';
import BottomPanel from '../components/BottomPanel';

export default function Trade() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { data } = useSymbols();
  const { favorites, toggle } = useFavorites();

  const active = symbol ?? 'BTC-USDT';
  const row = useMemo(() => data?.find((r) => r.symbol === active), [data, active]);

  // Subscribe to all known symbols (so the market list is live) + the active symbol.
  useEffect(() => {
    if (data) subscribeSymbols(data.map((r) => r.symbol));
  }, [data]);
  useEffect(() => {
    subscribeSymbols([active]);
  }, [active]);

  return (
    <div className="flex h-full">
      <div className="w-60 shrink-0 border-r border-border">
        <MarketList active={active} favorites={favorites} onSelect={(s) => navigate(`/trade/${s}`)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {row ? <SymbolHeader row={row} fav={favorites.has(active)} toggleFav={() => toggle(active)} /> : <div className="p-4 text-txt-faint">Loading…</div>}

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 min-w-0 border-r border-border">
                {row && <Chart symbol={active} pricePrecision={row.pricePrecision} />}
              </div>
              <div className="w-56 shrink-0 border-r border-border hidden xl:block">
                {row && <OrderBook symbol={active} pricePrecision={row.pricePrecision} />}
              </div>
              <div className="w-48 shrink-0 border-r border-border hidden 2xl:block">
                {row && <RecentTrades symbol={active} pricePrecision={row.pricePrecision} />}
              </div>
            </div>
            <div className="h-56 shrink-0 border-t border-border">
              <BottomPanel />
            </div>
          </div>

          <div className="w-80 shrink-0">
            {row && <OrderEntry row={row} />}
          </div>
        </div>
      </div>
    </div>
  );
}
