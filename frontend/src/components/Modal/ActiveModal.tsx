import { useMemo, useState, useEffect, useCallback } from 'react';
import BaseModal from './BaseModal';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAddressFields } from '../../hooks/useAddressFields';
import { getDesc } from '../../utils/formatDesc';
import { formatDuration } from '../../utils/time';

interface ConnPort {
  port: string;
  since: number;
}

interface ConnGroup {
  ip: string;
  module: string;
  desc: string;
  conns: ConnPort[];
  earliest: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ActiveModal({ open, onClose }: Props) {
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const addressFields = useAddressFields();

  // 每秒刷新时长
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // 按 IP+Module 分组
  const { groups, totalConns } = useMemo(() => {
    const map = new Map<string, ConnGroup>();
    activeConnections.forEach((c) => {
      const key = `${c.ip}|${c.module}`;
      if (!map.has(key)) {
        map.set(key, {
          ip: c.ip,
          module: c.module,
          desc: getDesc(c, addressFields),
          conns: [],
          earliest: Infinity,
        });
      }
      const g = map.get(key)!;
      const parts = c.remote_addr.split(':');
      const port = parts[parts.length - 1] || '';
      g.conns.push({ port, since: c.since });
      if (c.since < g.earliest) g.earliest = c.since;
    });
    const groups = Array.from(map.values()).sort((a, b) => b.conns.length - a.conns.length);
    return { groups, totalConns: activeConnections.size };
  }, [activeConnections, addressFields]);

  // 端口悬浮提示
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  const handleBadgeEnter = useCallback((e: React.MouseEvent, key: string) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTipPos({ x: rect.left + rect.width / 2, y: rect.top });
    setHoveredGroup(key);
  }, []);

  const handleBadgeLeave = useCallback(() => {
    setHoveredGroup(null);
  }, []);

  const now = Math.floor(Date.now() / 1000);

  const titleText = groups.length > 0
    ? `活跃连接 (${groups.length} 组 / ${totalConns} 连接)`
    : '活跃连接 (0)';

  return (
    <BaseModal open={open} onClose={onClose} title={titleText}>
      <div className="max-h-[500px] overflow-y-auto">
        {groups.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-6">无活跃连接</div>
        )}

        {/* 表头 */}
        {groups.length > 0 && (
          <div className="grid grid-cols-[28px_1fr_auto_48px_56px] gap-x-2 px-3 py-1.5 text-[10px] text-gray-600 border-b border-gray-800 sticky top-0 bg-gray-900/95 z-10">
            <span>#</span>
            <span>IP / 地理位置</span>
            <span>代理</span>
            <span className="text-center">连接</span>
            <span className="text-right">时长</span>
          </div>
        )}

        {groups.map((g, i) => {
          const key = `${g.ip}|${g.module}`;
          const elapsed = g.earliest < Infinity ? now - g.earliest : 0;
          return (
            <div
              key={key}
              className="grid grid-cols-[28px_1fr_auto_48px_56px] gap-x-2 items-center px-3 py-2 text-xs hover:bg-gray-800/40 border-b border-gray-800/40"
            >
              {/* 序号 */}
              <span className="text-gray-600 text-[11px]">{i + 1}</span>

              {/* IP + 描述 */}
              <div className="min-w-0 truncate">
                <span className="text-emerald-400 font-mono">{g.ip}</span>
                {g.desc && (
                  <span className="text-gray-500 ml-1.5 text-[11px]">{g.desc}</span>
                )}
              </div>

              {/* Module */}
              <span className="text-gray-400 text-[11px] font-mono">{g.module || '—'}</span>

              {/* 连接数 badge */}
              <div className="text-center">
                <span
                  className="inline-block bg-emerald-500/20 text-emerald-400 rounded px-1.5 py-0.5 text-[11px] font-mono cursor-default"
                  onMouseEnter={(e) => handleBadgeEnter(e, key)}
                  onMouseLeave={handleBadgeLeave}
                >
                  {g.conns.length}
                </span>
              </div>

              {/* 时长 */}
              <span className="text-right text-emerald-500 font-mono text-[11px] tabular-nums">
                {formatDuration(elapsed)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 端口悬浮提示 */}
      {hoveredGroup && (() => {
        const g = groups.find((g) => `${g.ip}|${g.module}` === hoveredGroup);
        if (!g) return null;
        const sorted = [...g.conns].sort((a, b) => a.since - b.since);
        return (
          <div
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl px-3 py-2 text-[11px] pointer-events-none"
            style={{
              left: tipPos.x - 100,
              top: tipPos.y - (sorted.length * 22 + 36),
            }}
          >
            <div className="text-gray-500 mb-1 text-[10px]">源端口 / 连接时长</div>
            {sorted.map((p, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span className="text-blue-400 font-mono">:{p.port}</span>
                <span className="text-emerald-400 font-mono">{formatDuration(now - p.since)}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </BaseModal>
  );
}
