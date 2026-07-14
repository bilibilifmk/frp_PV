import { useState, type FormEvent } from 'react';
import { login, checkAuth } from '../../stores/authStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
        if (!authRes.authenticated || !authRes.config) {
          setError('登录状态确认失败，请重试');
          return;
        }
        // 主界面先取得完整配置，再切换认证状态，避免短暂显示“配置加载中”。
        setConfig(authRes.config);
        setSuccess(true);
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        setAuth(true);
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
    <div className={`login-page ${success ? 'login-page-success' : ''}`}>
      <div className="login-stars" aria-hidden="true" />
      <div className="login-globe-stage" aria-hidden="true">
        <div className="login-orbit login-orbit-a"><i /></div>
        <div className="login-orbit login-orbit-b"><i /></div>
        <div className="login-globe">
          <div className="login-globe-grid" />
          <div className="login-globe-lights" />
        </div>
        <div className="login-globe-shadow" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="login-card w-[min(23rem,calc(100vw-2rem))] p-6 sm:p-7"
      >
        <div className="mb-6 flex flex-col items-center">
          <img
            src="/img/frppvlogo.png"
            alt="FRP_PV"
            className="h-20 w-20 rounded-2xl border border-brand-300/30 object-cover shadow-[0_0_35px_rgba(0,212,255,.28)]"
          />
          <h1 className="mt-4 text-xl font-bold tracking-wide text-gray-100">FRP_PV 态势感知</h1>
          <p className="mt-1 text-[11px] tracking-[0.22em] text-brand-300/70">GLOBAL ACTIVE DEFENSE</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
        )}

        <label className="block text-xs text-gray-500 mb-1">用户名</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="login-input"
          placeholder="请输入管理员用户名"
          autoComplete="username"
          autoFocus
        />

        <label className="block text-xs text-gray-500 mb-1">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input mb-6"
          placeholder="请输入密码"
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading || success}
          className="login-submit"
        >
          {success ? '验证成功 · 正在进入系统' : loading ? '正在验证…' : '安全登录'}
        </button>

        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          加密会话 · 主动防御控制台
        </div>
      </form>
    </div>
  );
}
