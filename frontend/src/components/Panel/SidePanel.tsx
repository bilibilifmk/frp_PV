import { useState, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { logout } from '../../stores/authStore';
import { useAuthStore } from '../../stores/authStore';
import StatCard from './StatCard';
import LogStream from '../Log/LogStream';

interface Props {
  onOpenSettings: () => void;
  onOpenFirewall: () => void;
  onOpenActive: () => void;
  onOpenIpList: () => void;
  onOpenBlocked: () => void;
}

export default function SidePanel({
  onOpenSettings,
  onOpenFirewall,
  onOpenActive,
  onOpenIpList,
  onOpenBlocked,
}: Props) {
  const allIpData = useConnectionStore((s) => s.allIpData);
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const blockedCount = useConnectionStore((s) => s.blockedCount);
  const setAuth = useAuthStore((s) => s.setAuth);

  const totalConns = useMemo(
    () => allIpData.reduce((s, r) => s + (r.count || 1), 0),
    [allIpData],
  );
  const uniqueIps = useMemo(
    () => new Set(allIpData.map((r) => r.ip)).size,
    [allIpData],
  );

  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    await logout();
    setAuth(false);
  }

  return (
    <div
      className={`absolute top-4 right-4 z-10 transition-all ${
        collapsed ? 'w-10' : 'w-[420px]'
      }`}
    >
      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -left-3 top-2 w-6 h-6 bg-gray-800 border border-gray-700
                   rounded-full text-[10px] text-gray-400 hover:text-gray-200 z-20
                   flex items-center justify-center"
        title={collapsed ? '展开' : '折叠'}
      >
        {collapsed ? '◀' : '▶'}
      </button>

      {!collapsed && (
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-800 overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-200">系统概览</h2>
            <div className="flex gap-1">
              <IconBtn title="设置" onClick={onOpenSettings}>⚙</IconBtn>
              <IconBtn title="防火墙" onClick={onOpenFirewall}>🛡</IconBtn>
              <IconBtn title="登出" onClick={handleLogout}>⏻</IconBtn>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="p-3 grid grid-cols-2 gap-2">
            <StatCard label="累计连接频次" value={totalConns} onClick={onOpenIpList} />
            <StatCard label="独立来源 (IP)" value={uniqueIps} onClick={onOpenIpList} />
            <StatCard label="活跃连接" value={activeConnections.size} color="green" onClick={onOpenActive} />
            <StatCard label="已拦截" value={blockedCount} color="red" onClick={onOpenBlocked} />
          </div>

          {/* 日志流 */}
          <div className="px-4 pb-4">
            <h3 className="text-[11px] font-medium text-gray-500 mb-1.5">实时日志</h3>
            <LogStream />
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 rounded-md bg-gray-800 hover:bg-gray-700 text-sm
                 flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  );
}
