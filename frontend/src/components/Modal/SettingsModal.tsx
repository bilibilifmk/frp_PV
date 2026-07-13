import { useEffect, useState, type ReactNode } from 'react';
import BaseModal from './BaseModal';
import { fetchSettings, saveSettings, useSettingsStore } from '../../stores/settingsStore';
import { apiPost } from '../../utils/api';
import type { ServerLocation, Settings } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DetectLocationResponse {
  status: string;
  msg: string;
  ip?: string;
  location?: ServerLocation;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedIP, setDetectedIP] = useState('');
  const [msg, setMsg] = useState('');
  const [changePwd, setChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const patchConfig = useSettingsStore((s) => s.patchConfig);

  useEffect(() => {
    if (!open) return;
    setMsg('');
    fetchSettings().then(setSettings).catch(() => setMsg('设置加载失败'));
  }, [open]);

  function updateField<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  function updateAutoBan(patch: Partial<Settings['auto_ban']>) {
    if (settings) updateField('auto_ban', { ...settings.auto_ban, ...patch });
  }

  async function detectLocation() {
    setDetecting(true);
    setMsg('正在通过服务器公网 IP 识别位置…');
    try {
      const result = await apiPost<DetectLocationResponse>('/api/settings/detect-location', {});
      if (result.status !== 'success' || !result.location) {
        setMsg(result.msg || '自动识别失败');
        return;
      }
      updateField('server_location', result.location);
      patchConfig({ server_location: result.location });
      setDetectedIP(result.ip || '');
      setMsg(result.ip ? `识别成功，服务器公网 IP：${result.ip}` : '服务器位置识别成功');
    } catch {
      setMsg('自动识别失败，请检查地理位置数据源');
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave(closeAfter = false) {
    if (!settings) return;
    setLoading(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        home_country: settings.home_country,
        admin_username: settings.admin_username,
        server_location: settings.server_location,
        geo_cache: settings.geo_cache,
        firewall_mode: settings.firewall_mode,
        auto_ban: settings.auto_ban,
        cesium_ion_token: settings.cesium_ion_token,
      };
      if (changePwd) {
        body.change_pwd = true;
        body.old_password = oldPwd;
        body.new_password = newPwd;
      }
      const result = await saveSettings(body);
      if (result.status !== 'success') {
        setMsg(result.msg || '保存失败');
        return;
      }
      patchConfig({
        home_country: settings.home_country,
        cesium_ion_token: settings.cesium_ion_token,
        server_location: settings.server_location,
      });
      if (closeAfter) onClose();
      else setMsg('设置已保存');
    } catch {
      setMsg('网络错误，设置未保存');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BaseModal open={open} onClose={onClose} title="系统设置" width="max-w-3xl">
      {!settings ? (
        <div className="text-center text-gray-500 py-10">加载中…</div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-gray-200">FRP 主动防御配置</div>
              <div className="mt-0.5 text-[11px] text-gray-500">配置保存到 SQLite；监听 IP 和端口仍由启动参数控制</div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] ${settings.firewall_mode === 'iptables' ? 'bg-red-500/15 text-red-300' : 'bg-brand-500/15 text-brand-300'}`}>
              {settings.firewall_mode === 'iptables' ? 'iptables 内核拦截' : 'frp plugin 拦截'}
            </span>
          </div>

          <Section title="基础与地图" description="登录账号、境内判断标准和地图服务配置">
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField label="管理员用户名" hint="用于登录管理页面">
                <input value={settings.admin_username} onChange={(e) => updateField('admin_username', e.target.value)} className="input-box w-full" />
              </InputField>
              <InputField label="本国/地区名称" hint="用于判断访问 IP 是否属于境内">
                <input value={settings.home_country} onChange={(e) => updateField('home_country', e.target.value)} className="input-box w-full" />
              </InputField>
            </div>
            <InputField label="Cesium Ion Token" hint="Bing、Sentinel、Blue Marble 等地图图层需要；留空可使用无需 Token 的图层">
              <input type="text" placeholder="粘贴 Ion Access Token" value={settings.cesium_ion_token ?? ''}
                onChange={(e) => updateField('cesium_ion_token', e.target.value)} className="input-box w-full font-mono text-[11px]" />
            </InputField>
          </Section>

          <Section title="服务器位置" description="3D 地球连线的目标位置，可自动识别或手动修正">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-950/60 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-xs text-gray-300">{settings.server_location.name || '尚未设置位置'}</div>
                <div className="mt-0.5 text-[10px] text-gray-600">
                  {settings.server_location.lat.toFixed(5)}, {settings.server_location.lng.toFixed(5)}
                  {detectedIP && ` · 公网 IP ${detectedIP}`}
                </div>
              </div>
              <button onClick={detectLocation} disabled={detecting}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium hover:bg-brand-500 disabled:opacity-50">
                {detecting ? '识别中…' : '自动识别本机 IP 位置'}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <InputField label="纬度">
                <input type="number" step="any" value={settings.server_location.lat}
                  onChange={(e) => updateField('server_location', { ...settings.server_location, lat: +e.target.value })} className="input-box w-full" />
              </InputField>
              <InputField label="经度">
                <input type="number" step="any" value={settings.server_location.lng}
                  onChange={(e) => updateField('server_location', { ...settings.server_location, lng: +e.target.value })} className="input-box w-full" />
              </InputField>
              <InputField label="位置名称">
                <input value={settings.server_location.name}
                  onChange={(e) => updateField('server_location', { ...settings.server_location, name: e.target.value })} className="input-box w-full" />
              </InputField>
            </div>
          </Section>

          <Section title="拦截与封禁策略" description="控制由 frp plugin 拒绝连接，或交给 Linux iptables 在内核层拦截">
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField label="拦截模式" hint={settings.firewall_mode === 'iptables' ? '插件快速返回允许，iptables 负责实际拦截，需要系统权限' : '由 frp plugin 同步检查并拒绝已封禁 IP'}>
                <select value={settings.firewall_mode} onChange={(e) => updateField('firewall_mode', e.target.value as Settings['firewall_mode'])} className="input-box w-full">
                  <option value="plugin">frp plugin 模式</option>
                  <option value="iptables">iptables 模式</option>
                </select>
              </InputField>
              <ToggleRow label="启用自动封禁" hint="关闭后仍保留手动封禁和已有封禁记录"
                checked={settings.auto_ban.enabled} onChange={(enabled) => updateAutoBan({ enabled })} />
              <NumberField label="统计窗口" unit="秒" value={settings.auto_ban.threshold_seconds} onChange={(threshold_seconds) => updateAutoBan({ threshold_seconds })} />
              <NumberField label="窗口内触发次数" unit="次" value={settings.auto_ban.threshold_count} onChange={(threshold_count) => updateAutoBan({ threshold_count })} />
              <NumberField label="首次封禁时长" unit="分钟" value={settings.auto_ban.initial_ban_minutes} onChange={(initial_ban_minutes) => updateAutoBan({ initial_ban_minutes })} />
              <NumberField label="最长封禁时长" unit="分钟" value={settings.auto_ban.max_ban_minutes} onChange={(max_ban_minutes) => updateAutoBan({ max_ban_minutes })} />
              <ToggleRow label="永久封禁" hint="启用后新触发的封禁不再自动过期"
                checked={settings.auto_ban.permanent_ban} onChange={(permanent_ban) => updateAutoBan({ permanent_ban })} />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-[10px] leading-5 text-gray-500">
              临时封禁会按历史次数翻倍，直到最长封禁时长。手动解封不会清除该 IP 的历史违规次数。
            </div>
          </Section>

          <Section title="地理位置判定" description="这些开关只影响自动封禁，避免地理数据源异常时误封">
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label="仅封禁境外 IP" hint="境内 IP 超过频率阈值也不会自动封禁"
                checked={settings.auto_ban.foreign_only} onChange={(foreign_only) => updateAutoBan({ foreign_only })} />
              <ToggleRow label="国家未知时封禁" hint="已有省市或坐标，但无法判断国家时仍允许触发封禁"
                checked={settings.auto_ban.ban_unknown_country} onChange={(ban_unknown_country) => updateAutoBan({ ban_unknown_country })} />
              <ToggleRow label="位置完全未知时封禁" hint="任何地理信息都无法取得时仍允许触发封禁"
                checked={settings.auto_ban.ban_unknown_location} onChange={(ban_unknown_location) => updateAutoBan({ ban_unknown_location })} />
            </div>
          </Section>

          <Section title="白名单" description="白名单 IP 和服务不参与频率、地域及自动封禁规则，每行填写一个值">
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField label="FRP 服务白名单" hint="填写 proxy_name">
                <textarea value={(settings.auto_ban.whitelist_modules ?? []).join('\n')} placeholder="例如：web_https"
                  onChange={(e) => updateAutoBan({ whitelist_modules: splitList(e.target.value) })} className="input-box min-h-24 w-full font-mono text-xs" />
              </InputField>
              <InputField label="IP 白名单" hint="白名单 IP 无法被手动或自动封禁">
                <textarea value={(settings.auto_ban.whitelist_ips ?? []).join('\n')} placeholder="例如：127.0.0.1"
                  onChange={(e) => updateAutoBan({ whitelist_ips: splitList(e.target.value) })} className="input-box min-h-24 w-full font-mono text-xs" />
              </InputField>
            </div>
          </Section>

          <Section title="地理缓存" description="通常保持默认即可；修改后重启服务生效">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="普通缓存" unit="天" value={settings.geo_cache.normal_ttl_days}
                onChange={(normal_ttl_days) => updateField('geo_cache', { ...settings.geo_cache, normal_ttl_days })} />
              <NumberField label="活跃缓存" unit="天" value={settings.geo_cache.active_ttl_days}
                onChange={(active_ttl_days) => updateField('geo_cache', { ...settings.geo_cache, active_ttl_days })} />
              <NumberField label="活跃判断窗口" unit="小时" value={settings.geo_cache.active_window_hrs}
                onChange={(active_window_hrs) => updateField('geo_cache', { ...settings.geo_cache, active_window_hrs })} />
              <NumberField label="写入缓存批次" unit="条" value={settings.geo_cache.persist_every}
                onChange={(persist_every) => updateField('geo_cache', { ...settings.geo_cache, persist_every })} />
            </div>
          </Section>

          <Section title="账户安全" description="不修改密码时无需填写">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={changePwd} onChange={(e) => setChangePwd(e.target.checked)} className="accent-brand-500" />
              修改管理员密码
            </label>
            {changePwd && (
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="当前密码"><input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} className="input-box w-full" /></InputField>
                <InputField label="新密码"><input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="input-box w-full" /></InputField>
              </div>
            )}
          </Section>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-800 bg-gray-900/95 py-3 backdrop-blur">
            <span className="min-h-4 text-xs text-brand-400">{msg}</span>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => handleSave(false)} disabled={loading || detecting}
                className="rounded-lg bg-gray-700 px-4 py-1.5 text-xs font-medium hover:bg-gray-600 disabled:opacity-50">
                {loading ? '保存中…' : '保存'}
              </button>
              <button onClick={() => handleSave(true)} disabled={loading || detecting}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium hover:bg-brand-500 disabled:opacity-50">
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div>
        <h4 className="text-xs font-semibold text-gray-200">{title}</h4>
        <p className="mt-1 text-[10px] leading-4 text-gray-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function InputField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-gray-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] leading-4 text-gray-600">{hint}</span>}
    </label>
  );
}

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (value: number) => void }) {
  return (
    <InputField label={label}>
      <div className="flex items-center rounded-lg bg-gray-800 focus-within:ring-1 focus-within:ring-brand-500">
        <input type="number" min={1} value={value} onChange={(e) => onChange(+e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-gray-200 outline-none" />
        <span className="pr-3 text-[10px] text-gray-600">{unit}</span>
      </div>
    </InputField>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-gray-950/50 px-3 py-2">
      <div>
        <div className="text-[11px] font-medium text-gray-300">{label}</div>
        <div className="mt-0.5 text-[10px] leading-4 text-gray-600">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-700'}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function splitList(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}
