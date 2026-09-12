import { useAuthStore } from './stores/auth';

/** 统一 fetch 封装：自动带 token，401 时回登录页 */
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any } = {},
): Promise<T> {
  const auth = useAuthStore();
  const headers: Record<string, string> = {};
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    auth.forceLogout();
    throw new Error('登录已过期');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data as T;
}

export function fmtDate(s?: string | null): string {
  if (!s) return '';
  return String(s).slice(0, 10);
}

export function fmtDateTime(s?: string | null): string {
  if (!s) return '';
  return String(s).replace('T', ' ').slice(0, 16);
}
