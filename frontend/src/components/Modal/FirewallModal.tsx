import { useState, useEffect, useMemo } from 'react';
import BaseModal from './BaseModal';
import { apiPost } from '../../utils/api';
import { useFirewallStore } from '../../stores/firewallStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FirewallModal({ open, onClose }: Props) {
  const items = useFirewallStore((s) => s.items);
  const refresh = useFirewallStore((s) => s.refresh);
  const [newIp, setNewIp] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      item.ip.toLowerCase().includes(keyword) || item.desc.toLowerCase().includes(keyword),
    );
  }, [items, search]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  async function handleAdd() {
    const ip = newIp.trim();
    if (!ip) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await apiPost<{ status: string; msg: string }>('/api/firewall/add', { ip });
      setMsg(res.msg);
      if (res.status === 'success') {
        setNewIp('');
        void refresh();
      }
    } catch {
      setMsg('网络错误');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(ip: string) {
    const res = await apiPost<{ status: string; msg: string }>('/api/firewall/remove', { ip });
    setMsg(res.msg);
    void refresh();
  }

  return (
    <BaseModal open={open} onClose={onClose} title={`IP 防火墙 · 当前封禁 (${items.length})`} width="max-w-5xl">
      {/* 添加 */}
      <div className="flex gap-2 mb-4">
        <input
          value={newIp}
          onChange={(e) => setNewIp(e.target.value)}
          placeholder="输入 IP 地址"
          className="input-box flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={loading}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50
                     rounded-lg text-xs font-medium whitespace-nowrap"
        >
          封禁
        </button>
      </div>

      {msg && <p className="text-xs text-brand-400 mb-3">{msg}</p>}

      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-900/70 border border-gray-800 rounded-lg">
        <span className="text-gray-600" aria-hidden="true">⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索已封禁 IP 或地理位置…"
          className="bg-transparent outline-none flex-1 text-xs text-gray-200 placeholder:text-gray-600"
        />
        <span className="text-[10px] text-gray-600 whitespace-nowrap">
          {filteredItems.length} / {items.length}
        </span>
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-gray-500 hover:text-gray-300">清除</button>
        )}
      </div>

      {/* 列表 */}
      <div className="max-h-[68vh] overflow-y-auto space-y-1">
        {filteredItems.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-6">
            {items.length === 0 ? '无封禁 IP' : '没有匹配的 IP'}
          </div>
        )}
        {filteredItems.map((item) => (
          <div
            key={item.ip}
            className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg"
          >
            <div>
              <span className="text-xs text-gray-200 font-mono">{item.ip}</span>
              {item.desc && (
                <span className="text-[11px] text-gray-500 ml-2">{item.desc}</span>
              )}
              <div className="text-[10px] text-gray-600 mt-0.5">
                第 {item.strike_count} 次 · {item.permanent ? '永久' : item.banned_until ? `至 ${new Date(item.banned_until * 1000).toLocaleString()}` : '已过期'}
              </div>
            </div>
            <button
              onClick={() => handleRemove(item.ip)}
              className="text-[11px] text-red-400 hover:text-red-300"
            >
              解封
            </button>
          </div>
        ))}
      </div>
    </BaseModal>
  );
}
