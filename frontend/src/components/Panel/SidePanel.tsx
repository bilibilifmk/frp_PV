import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFirewallStore } from '../../stores/firewallStore';
import { useSettingsStore } from '../../stores/settingsStore';
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
  const firewallMode = useSettingsStore((s) => s.config?.firewall_mode ?? 'plugin');
  const bannedCount = useFirewallStore((s) => s.items.length);
  const refreshFirewall = useFirewallStore((s) => s.refresh);
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

  // iptables 无法从插件请求统计 DROP 次数，展示 SQLite 中当前仍有效的封禁 IP 数量。
  useEffect(() => {
    if (firewallMode !== 'iptables') return;
    void refreshFirewall();
    const timer = window.setInterval(() => void refreshFirewall(), 15_000);
    return () => window.clearInterval(timer);
  }, [firewallMode, refreshFirewall]);

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
              <img src="/img/frppvlogo.png" alt="" className="h-7 w-7 rounded-lg border border-brand-400/20 object-cover" />
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
              <IconBtn title="Lua 脚本" onClick={onOpenLua}><DocumentIcon /></IconBtn>
              <IconBtn title="设置" onClick={onOpenSettings}><SettingsIcon /></IconBtn>
              <IconBtn title="防火墙" onClick={onOpenFirewall}><ShieldIcon /></IconBtn>
              <IconBtn title="登出" onClick={handleLogout}><PowerIcon /></IconBtn>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="p-2 grid grid-cols-2 gap-1.5 md:p-3 md:gap-2">
            <StatCard label="累计连接频次" value={totalConns} onClick={onOpenIpList} />
            <StatCard label="独立来源 (IP)" value={uniqueIps} onClick={onOpenIpList} />
            <StatCard label="活跃连接" value={activeConnections.size} color="green" onClick={onOpenActive} />
            <StatCard
              label={firewallMode === 'iptables' ? '已封禁' : '已拦截'}
              value={firewallMode === 'iptables' ? bannedCount : blockedCount}
              color="red"
              onClick={firewallMode === 'iptables' ? onOpenFirewall : onOpenBlocked}
            />
          </div>

          {/* 日志流 */}
          <div className="px-3 pb-3 md:px-4 md:pb-4">
            <h3 className="text-[11px] font-medium text-gray-500 mb-1.5">实时日志</h3>
            <LogStream />
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 rounded-md bg-gray-800 hover:bg-gray-700 text-sm
                 flex items-center justify-center text-gray-400 hover:text-gray-100 transition-colors"
    >
      {children}
    </button>
  );
}

const iconClass = 'h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round]';

function DocumentIcon() {
  return <svg viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8" aria-hidden="true"><path d="M7 3.75h7l3 3V20.25H7z" /><path d="M14 3.75v3h3M9.5 11h5M9.5 14.5h5" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.93 4.93 7.4 7.4M16.6 16.6l2.47 2.47M19.07 4.93 16.6 7.4M7.4 16.6l-2.47 2.47" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8" aria-hidden="true"><path d="M12 2.75 19 5.5v5.25c0 4.45-2.82 8.28-7 10.5-4.18-2.22-7-6.05-7-10.5V5.5z" /><path d="m8.75 12 2.1 2.1 4.4-4.6" /></svg>;
}

function PowerIcon() {
  return <svg viewBox="0 0 24 24" className={iconClass} strokeWidth="1.8" aria-hidden="true"><path d="M12 2.75v8M6.3 6.7a8 8 0 1 0 11.4 0" /></svg>;
}
