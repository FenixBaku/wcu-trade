import { useState } from 'react';
import { api, apiError } from '../lib/api';
import { useAuth } from '../store/auth';
import Logo from '../components/Logo';

const DEMO = [
  { label: 'Student', email: 'student1@wcu.edu' },
  { label: 'Instructor', email: 'instructor@wcu.edu' },
  { label: 'Admin', email: 'admin@wcu.edu' },
];

export default function Login() {
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState('student1@wcu.edu');
  const [password, setPassword] = useState('Passw0rd!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setAuth(res.data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-base relative overflow-hidden">
      {/* Ambient market grid backdrop */}
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#232a34 1px, transparent 1px), linear-gradient(90deg, #232a34 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(45,107,255,0.18), transparent 60%)' }}
      />

      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-14 w-[46%] relative z-10 border-r border-border">
        <Logo size="lg" />
        <div>
          <h1 className="text-5xl font-bold leading-tight text-txt">
            Experience real markets.
            <br />
            <span className="text-wcu-bright">Trade with virtual capital.</span>
          </h1>
          <p className="mt-6 text-txt-muted max-w-md leading-relaxed">
            A professional financial-markets simulation terminal. Live market data, virtual
            money, realistic execution, real risk — built for the WCU Trading & Financial
            Markets Simulation Laboratory.
          </p>
          <div className="mt-8 flex gap-8 num">
            <Stat label="Live data" value="Binance" />
            <Stat label="Virtual capital" value="$100,000" />
            <Stat label="Asset classes" value="7" />
          </div>
        </div>
        <p className="text-2xs text-txt-faint">
          Educational Simulation Environment — no real funds are used.
        </p>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Logo size="md" />
          </div>
          <h2 className="text-xl font-semibold mb-1">Sign in to the Trading Lab</h2>
          <p className="text-sm text-txt-muted mb-6">Western Caspian University</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-txt-muted mb-1 block">University email</label>
              <input className="input !font-sans" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div>
              <label className="text-xs text-txt-muted mb-1 block">Password</label>
              <input className="input !font-sans" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
            {error && <div className="text-sm text-loss bg-loss/10 border border-loss/30 rounded px-3 py-2">{error}</div>}
            <button className="btn-wcu w-full py-2.5 text-[15px]" disabled={loading}>
              {loading ? 'Signing in…' : 'Enter Trading Lab'}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-2xs text-txt-faint mb-2 uppercase tracking-wide">Demo accounts (password: Passw0rd!)</p>
            <div className="flex gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => { setEmail(d.email); setPassword('Passw0rd!'); }}
                  className="btn-ghost border border-border flex-1 !py-1.5 text-xs"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-8 text-2xs text-txt-faint leading-relaxed">
            WCU TRADE is an educational financial-market simulation platform. All funds and
            executions are virtual. Market data may be live, delayed or aggregated depending on
            the provider. Nothing here constitutes investment advice.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-txt">{value}</div>
      <div className="text-2xs text-txt-faint uppercase tracking-wide">{label}</div>
    </div>
  );
}
