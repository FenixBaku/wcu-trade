// Resolve the API/WebSocket base. In dev this is empty (Vite proxies /api and /socket.io).
// In production (e.g. Render), set VITE_API_URL to the API service URL. Render's
// `fromService` provides a bare host, so we prefix https:// when the scheme is missing.
function resolveBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

export const apiBase = resolveBase();
