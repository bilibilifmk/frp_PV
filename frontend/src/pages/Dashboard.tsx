import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useWebSocket } from '../hooks/useWebSocket';
import CesiumGlobe from '../components/Globe/CesiumGlobe';
import ImageryPicker from '../components/Globe/ImageryPicker';
import NavigationHelp from '../components/Globe/NavigationHelp';
import GlobeToolbar from '../components/Globe/GlobeToolbar';
import ErrorBoundary from '../components/ErrorBoundary';
import SidePanel from '../components/Panel/SidePanel';
import SettingsModal from '../components/Modal/SettingsModal';
import FirewallModal from '../components/Modal/FirewallModal';
import ActiveModal from '../components/Modal/ActiveModal';
import IpListModal from '../components/Modal/IpListModal';
import BlockedModal from '../components/Modal/BlockedModal';
import LuaModal from '../components/Modal/LuaModal';

export default function Dashboard() {
  const config = useSettingsStore((s) => s.config);
  useWebSocket();

  const [modal, setModal] = useState<string | null>(null);
  const close = () => setModal(null);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-gray-500">正在加载配置…</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* 3D 地球 */}
      <ErrorBoundary fallback={
        <div className="absolute inset-0 bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
          地球组件加载失败，请检查浏览器控制台
        </div>
      }>
        <CesiumGlobe
          serverLat={config.server_location.lat}
          serverLng={config.server_location.lng}
        />
      </ErrorBoundary>

      {/* 底图工具栏: 底图选择 + 导航帮助 */}
      <div className="absolute bottom-14 right-3 z-20 flex items-end gap-2
                      sm:bottom-10 sm:right-4">
        <GlobeToolbar />
        <ImageryPicker />
        <NavigationHelp />
      </div>

      {/* 侧面板 */}
      <SidePanel
        onOpenSettings={() => setModal('settings')}
        onOpenFirewall={() => setModal('firewall')}
        onOpenActive={() => setModal('active')}
        onOpenIpList={() => setModal('iplist')}
        onOpenBlocked={() => setModal('blocked')}
        onOpenLua={() => setModal('lua')}
      />

      {/* 底部状态栏 */}
      <div className="absolute bottom-0 left-0 right-0 h-7 bg-gray-900/70 backdrop-blur-sm
                      border-t border-gray-800 flex items-center px-4 text-[11px] text-gray-500 z-10
                      pb-[env(safe-area-inset-bottom)]">
        <span>FRP_PV v2.0</span>
        <span className="mx-2">·</span>
        <span>服务器: {config.server_location.name || '未知'}</span>
      </div>

      {/* 模态框 */}
      <SettingsModal open={modal === 'settings'} onClose={close} />
      <FirewallModal open={modal === 'firewall'} onClose={close} />
      <ActiveModal open={modal === 'active'} onClose={close} />
      <IpListModal open={modal === 'iplist'} onClose={close} />
      <BlockedModal open={modal === 'blocked'} onClose={close} />
      <LuaModal open={modal === 'lua'} onClose={close} />
    </div>
  );
}
