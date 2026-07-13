import { create } from 'zustand';
import { apiFetch, apiGet } from '../utils/api';

export type ScriptType = 'providers' | 'geocoders' | 'lib';

interface ScriptFile {
  type: ScriptType;
  name: string;
}

interface LuaState {
  /** 各类型下的脚本文件名列表 */
  scripts: Record<ScriptType, string[]>;
  /** 当前选中的文件 */
  current: ScriptFile | null;
  /** 编辑器内容 */
  content: string;
  /** 原始内容 (用于脏检测) */
  originalContent: string;
  /** 加载中 */
  loading: boolean;
  /** 操作反馈消息 */
  message: string;

  fetchList: () => Promise<void>;
  openFile: (type: ScriptType, name: string) => Promise<void>;
  setContent: (content: string) => void;
  saveFile: () => Promise<void>;
  deleteFile: (type: ScriptType, name: string) => Promise<void>;
  reload: () => Promise<void>;
  clear: () => void;
}

export const useLuaStore = create<LuaState>((set, get) => ({
  scripts: { providers: [], geocoders: [], lib: [] },
  current: null,
  content: '',
  originalContent: '',
  loading: false,
  message: '',

  fetchList: async () => {
    try {
      const data = await apiGet<Record<ScriptType, string[]>>('/api/scripts');
      set({ scripts: { providers: data.providers || [], geocoders: data.geocoders || [], lib: data.lib || [] } });
    } catch (e) {
      console.error('fetchList', e);
    }
  },

  openFile: async (type, name) => {
    set({ loading: true, message: '' });
    try {
      const data = await apiGet<{ content: string }>(`/api/scripts/${type}/${name}`);
      set({ current: { type, name }, content: data.content, originalContent: data.content, loading: false });
    } catch (e) {
      set({ loading: false, message: '读取失败' });
    }
  },

  setContent: (content) => set({ content }),

  saveFile: async () => {
    const { current, content } = get();
    if (!current) return;
    set({ loading: true, message: '' });
    try {
      await apiFetch(`/api/scripts/${current.type}/${current.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      set({ originalContent: content, loading: false, message: '已保存 ✓' });
      setTimeout(() => set({ message: '' }), 2000);
    } catch (e) {
      set({ loading: false, message: '保存失败' });
    }
  },

  deleteFile: async (type, name) => {
    set({ loading: true, message: '' });
    try {
      await apiFetch(`/api/scripts/${type}/${name}`, { method: 'DELETE' });
      const { current } = get();
      if (current?.type === type && current?.name === name) {
        set({ current: null, content: '', originalContent: '' });
      }
      set({ loading: false, message: '已删除' });
      setTimeout(() => set({ message: '' }), 2000);
      get().fetchList();
    } catch (e) {
      set({ loading: false, message: '删除失败' });
    }
  },

  reload: async () => {
    set({ loading: true, message: '' });
    try {
      const data = await apiFetch<{ message: string }>('/api/providers/reload', { method: 'POST' });
      set({ loading: false, message: data.message || '重载完成' });
      setTimeout(() => set({ message: '' }), 3000);
    } catch (e) {
      set({ loading: false, message: '重载失败' });
    }
  },

  clear: () => set({ current: null, content: '', originalContent: '', message: '' }),
}));
