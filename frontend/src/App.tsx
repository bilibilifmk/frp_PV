import { useEffect } from 'react';
import { useAuthStore, checkAuth } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';
import LoginPage from './components/Auth/LoginPage';
import Dashboard from './pages/Dashboard';

export default function App() {
  const { authenticated, checking, setAuth } = useAuthStore();
  const setConfig = useSettingsStore((s) => s.setConfig);

  useEffect(() => {
    checkAuth().then((res) => {
      setAuth(res.authenticated);
      if (res.authenticated && res.config) {
        setConfig(res.config);
      }
    });
  }, [setAuth, setConfig]);

  if (checking) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-950">
        <img src="/img/frppvlogo.png" alt="FRP_PV" className="h-16 w-16 animate-pulse rounded-2xl object-cover" />
        <div className="text-xs tracking-[0.2em] text-brand-400">正在建立安全会话…</div>
      </div>
    );
  }

  return authenticated ? <Dashboard /> : <LoginPage />;
}
