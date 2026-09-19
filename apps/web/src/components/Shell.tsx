import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { usePortfolio } from '../store/portfolio';
import Logo from './Logo';
import ConnectionStatus from './ConnectionStatus';
import Toasts from './Toasts';
import { fmtUsd } from '../lib/format';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/markets', label: 'Markets' },
  { to: '/trade', label: 'Trade' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/orders', label: 'Orders' },
  { to: '/analytics', label: 'Analytics' },
];

export default function Shell() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const setP = usePortfolio((s) => s.set);
  const summary = usePortfolio((s) => s.summary);

  const { data } = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: async () => (await api.get('/portfolio/summary')).data,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (data) setP({ summary: data });
  }, [data, setP]);

  const equity = summary?.equity ?? data?.equity;

  const initials = (user?.fullName ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="h-screen flex flex-col bg-base text-txt">
      <header className="h-14 shrink-0 border-b border-border flex items-center px-4 gap-6 bg-panel/60 backdrop-blur">
        <Logo size="sm" />
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium ${isActive ? 'text-txt bg-elevated' : 'text-txt-muted hover:text-txt'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <ConnectionStatus />
          <div className="text-right">
            <div className="text-2xs text-txt-faint uppercase tracking-wide">Virtual Equity</div>
            <div className="num text-sm font-semibold text-txt">{fmtUsd(equity)}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-wcu/20 border border-wcu/40 grid place-items-center text-xs font-semibold text-wcu-bright">
              {initials}
            </div>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}
