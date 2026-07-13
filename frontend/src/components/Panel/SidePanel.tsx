import { useState, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { logout } from '../../stores/authStore';
import { useAuthStore } from '../../stores/authStore';
import StatCard from './StatCard';
import LogStream from '../Log/LogStream';
import FRPLogStream from '../Log/FRPLogStream';

interface Props {
  onOpenSettings: () => void;
  onOpenFirewall: () => void;
  onOpenActive: () => void;
  onOpenIpList: () => void;
  onOpenBlocked: () => void;
  onOpenLua: () => void;
}

export default function SidePanel({
  onOpenSettings,
  onOpenFirewall,
  onOpenActive,
  onOpenIpList,
  onOpenBlocked,
  onOpenLua,
}: Props) {
  const allIpData = useConnectionStore((s) => s.allIpData);
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const blockedCount = useConnectionStore((s) => s.blockedCount);
  const demoMode = useConnectionStore((s) => s.demoMode);
  const setDemoMode = useConnectionStore((s) => s.setDemoMode);
  const setAuth = useAuthStore((s) => s.setAuth);

  const totalConns = useMemo(
    () => allIpData.reduce((s, r) => s + (r.count || 1), 0),
    [allIpData],
  );
  const uniqueIps = useMemo(
    () => new Set(allIpData.map((r) => r.ip)).size,
    [allIpData],
  );

  // 手机端默认折叠, 不遮挡地球
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  async function handleLogout() {
    await logout();
    setAuth(false);
  }

  return (
    <div
      className={`absolute top-4 right-4 z-10 transition-all ${
        collapsed ? 'w-10' : 'w-[calc(100vw-2rem)] md:w-[420px]'
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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-200">系统概览</h2>
              <button
                type="button"
                role="switch"
                aria-checked={demoMode}
                title="新连接建立后自动聚焦来源位置并展示攻击路径"
                onClick={() => setDemoMode(!demoMode)}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] transition-colors ${
                  demoMode
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-300'
                    : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${demoMode ? 'bg-brand-400 animate-pulse' : 'bg-gray-600'}`} />
                演示
              </button>
            </div>
            <div className="flex gap-1">
              <IconBtn title="Lua 脚本" onClick={onOpenLua}>📜</IconBtn>
              <IconBtn title="设置" onClick={onOpenSettings}>⚙</IconBtn>
              <IconBtn title="防火墙" onClick={onOpenFirewall}>🛡</IconBtn>
              <IconBtn title="登出" onClick={handleLogout}>⏻</IconBtn>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="p-2 grid grid-cols-2 gap-1.5 md:p-3 md:gap-2">
            <StatCard label="累计连接频次" value={totalConns} onClick={onOpenIpList} />
            <StatCard label="独立来源 (IP)" value={uniqueIps} onClick={onOpenIpList} />
            <StatCard label="活跃连接" value={activeConnections.size} color="green" onClick={onOpenActive} />
            <StatCard label="已拦截" value={blockedCount} color="red" onClick={onOpenBlocked} />
          </div>

          {/* 日志流 */}
          <div className="px-3 pb-3 md:px-4 md:pb-4">
            <h3 className="text-[11px] font-medium text-gray-500 mb-1.5">实时日志</h3>
            <LogStream />
            <FRPLogStream />
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
