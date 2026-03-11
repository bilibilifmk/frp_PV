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
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="animate-pulse text-brand-400 text-lg">加载中…</div>
      </div>
    );
  }

  return authenticated ? <Dashboard /> : <LoginPage />;
}
