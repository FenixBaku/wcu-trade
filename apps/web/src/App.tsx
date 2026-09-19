import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import { connectSocket } from './lib/socket';
import Login from './pages/Login';
import Shell from './components/Shell';
import Trade from './pages/Trade';
import Portfolio from './pages/Portfolio';
import Orders from './pages/Orders';
import Markets from './pages/Markets';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';

export default function App() {
  const token = useAuth((s) => s.accessToken);

  useEffect(() => {
    if (token) connectSocket();
  }, [token]);

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/trade" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trade" element={<Trade />} />
        <Route path="/trade/:symbol" element={<Trade />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/trade" replace />} />
      </Route>
    </Routes>
  );
}
