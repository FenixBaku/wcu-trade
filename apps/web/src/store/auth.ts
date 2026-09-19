import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  avatarUrl?: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (t: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
}

const load = () => {
  try {
    const raw = localStorage.getItem('wcu.auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persisted = load();

export const useAuth = create<AuthState>((set, get) => ({
  accessToken: persisted?.accessToken ?? null,
  refreshToken: persisted?.refreshToken ?? null,
  user: persisted?.user ?? null,
  setAuth: (t) => {
    set(t);
    localStorage.setItem('wcu.auth', JSON.stringify({ ...t }));
  },
  setTokens: (t) => {
    const next = { ...get(), ...t };
    set(t);
    localStorage.setItem('wcu.auth', JSON.stringify({ accessToken: next.accessToken, refreshToken: next.refreshToken, user: next.user }));
  },
  logout: () => {
    set({ accessToken: null, refreshToken: null, user: null });
    localStorage.removeItem('wcu.auth');
  },
}));
