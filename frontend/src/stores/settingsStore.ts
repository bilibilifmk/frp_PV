import { create } from 'zustand';
import type { AppConfig, Settings } from '../types';

interface SettingsState {
  config: AppConfig | null;
  setConfig: (cfg: AppConfig) => void;
  patchConfig: (partial: Partial<AppConfig>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  config: null,
  setConfig: (cfg) => set({ config: cfg }),
  patchConfig: (partial) =>
    set((s) => ({
      config: s.config ? { ...s.config, ...partial } : null,
    })),
}));

/** 从后端拉取设置 */
export async function fetchSettings(): Promise<Settings> {
  const res = await fetch('/api/settings', { credentials: 'include' });
  const json = await res.json();
  return json.data;
}

/** 保存设置 */
export async function saveSettings(body: Record<string, unknown>): Promise<{ status: string; msg?: string }> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return res.json();
}
