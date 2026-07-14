import { create } from 'zustand';
import type { FirewallItem } from '../types';
import { apiGet } from '../utils/api';

interface FirewallState {
  items: FirewallItem[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/** 首页封禁统计和防火墙窗口共享同一份当前有效封禁列表。 */
export const useFirewallStore = create<FirewallState>((set) => ({
  items: [],
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const res = await apiGet<{ data: FirewallItem[] }>('/api/firewall');
      set({ items: Array.isArray(res.data) ? res.data : [] });
    } catch {
      // 保留上一次成功的数据；网络恢复后由下一次刷新自动校正。
    } finally {
      set({ loading: false });
    }
  },
}));
