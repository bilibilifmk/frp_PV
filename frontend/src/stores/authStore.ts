import { create } from 'zustand';
import type { AppConfig } from '../types';

interface AuthState {
  authenticated: boolean;
  checking: boolean;
  setAuth: (ok: boolean) => void;
  setChecking: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  authenticated: false,
  checking: true,
  setAuth: (ok) => set({ authenticated: ok, checking: false }),
  setChecking: (v) => set({ checking: v }),
}));

/** 检查当前 session 是否有效，同时获取运行时配置 */
export async function checkAuth(): Promise<{ authenticated: boolean; config?: AppConfig }> {
  const res = await fetch('/api/auth/check', { credentials: 'include' });
  return res.json();
}

/** 登录 */
export async function login(username: string, password: string): Promise<{ status: string; msg?: string }> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

/** 登出 */
export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}
