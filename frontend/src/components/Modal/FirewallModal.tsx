import { useState, useEffect } from 'react';
import BaseModal from './BaseModal';
import { apiGet, apiPost } from '../../utils/api';
import type { FirewallItem } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FirewallModal({ open, onClose }: Props) {
  const [items, setItems] = useState<FirewallItem[]>([]);
  const [newIp, setNewIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open]);

  async function refresh() {
    const res = await apiGet<{ data: FirewallItem[] }>('/api/firewall');
    setItems(res.data);
  }

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
        refresh();
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
    refresh();
  }

  return (
    <BaseModal open={open} onClose={onClose} title="IP 防火墙" width="max-w-md">
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

      {/* 列表 */}
      <div className="max-h-[400px] overflow-y-auto space-y-1">
        {items.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-6">无封禁 IP</div>
        )}
        {items.map((item) => (
          <div
            key={item.ip}
            className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg"
          >
            <div>
              <span className="text-xs text-gray-200 font-mono">{item.ip}</span>
              {item.desc && (
                <span className="text-[11px] text-gray-500 ml-2">{item.desc}</span>
              )}
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
