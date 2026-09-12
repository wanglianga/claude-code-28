import { defineStore } from 'pinia';
import type { User, Meta } from '../types';

const TOKEN_KEY = 'artclass_token';
const USER_KEY = 'artclass_user';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null,
    meta: null as Meta | null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token && !!s.user,
    homePath: (s): string => {
      if (!s.user) return '/login';
      if (s.user.role === 'teacher') return '/teacher';
      if (s.user.role === 'supervisor') return '/supervisor';
      return '/parent';
    },
  },
  actions: {
    async login(username: string, password: string) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '登录失败');
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem(TOKEN_KEY, this.token);
      localStorage.setItem(USER_KEY, JSON.stringify(this.user));
    },
    async logout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        });
      } finally {
        this.forceLogout();
      }
    },
    forceLogout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (location.pathname !== '/login') location.href = '/login';
    },
    async loadMeta() {
      if (this.meta) return;
      try {
        const { api } = await import('../api');
        this.meta = await api<Meta>('/api/meta');
      } catch {
        /* 元数据加载失败不阻塞导航，页面以空态兜底 */
      }
    },
  },
});
