import { useState, type FormEvent } from 'react';
import { login, checkAuth } from '../../stores/authStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const setConfig = useSettingsStore((s) => s.setConfig);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      if (res.status === 'success') {
        const authRes = await checkAuth();
        setAuth(true);
        if (authRes.config) setConfig(authRes.config);
      } else {
        setError(res.msg || '登录失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <form
        onSubmit={handleSubmit}
        className="w-[min(20rem,calc(100vw-2rem))] p-5 sm:p-6 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl"
      >
        <h1 className="text-xl font-bold text-center text-brand-400 mb-6">
          FRP_PV 态势感知
        </h1>

        {error && (
          <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
        )}

        <label className="block text-xs text-gray-500 mb-1">用户名</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                     text-sm text-gray-200 focus:outline-none focus:border-brand-500"
          autoFocus
        />

        <label className="block text-xs text-gray-500 mb-1">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                     text-sm text-gray-200 focus:outline-none focus:border-brand-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50
                     rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
