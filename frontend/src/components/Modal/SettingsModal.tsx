import { useState, useEffect } from 'react';
import BaseModal from './BaseModal';
import { fetchSettings, saveSettings } from '../../stores/settingsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Settings } from '../../types';

const FIELD_LABELS = ['国家', '省/州', '城市', '区/县', '街道/区域', '详细街道', 'ISP'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [changePwd, setChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const patchConfig = useSettingsStore((s) => s.patchConfig);

  useEffect(() => {
    if (!open) return;
    fetchSettings().then(setSettings).catch(() => setMsg('加载失败'));
  }, [open]);

  function updateField<K extends keyof Settings>(key: K, val: Settings[K]) {
    if (settings) setSettings({ ...settings, [key]: val });
  }

  function toggleAddressField(idx: number) {
    if (!settings) return;
    const fields = [...settings.address_fields];
    const pos = fields.indexOf(idx);
    if (pos >= 0) fields.splice(pos, 1);
    else fields.push(idx);
    updateField('address_fields', fields.sort());
  }

  async function handleSave() {
    if (!settings) return;
    setLoading(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        home_country: settings.home_country,
        frequent_threshold: settings.frequent_threshold,
        foreign_highlight: settings.foreign_highlight,
        admin_username: settings.admin_username,
        auto_ban: settings.auto_ban,
        address_fields: settings.address_fields,
      };
      if (changePwd) {
        body.change_pwd = true;
        body.old_password = oldPwd;
        body.new_password = newPwd;
      }
      const res = await saveSettings(body);
      setMsg(res.msg || (res.status === 'success' ? '已保存' : '保存失败'));
      if (res.status === 'success') {
        patchConfig({
          home_country: settings.home_country,
          frequent_threshold: settings.frequent_threshold,
          foreign_highlight: settings.foreign_highlight,
          address_fields: settings.address_fields,
        });
      }
    } catch {
      setMsg('网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BaseModal open={open} onClose={onClose} title="系统设置" width="max-w-xl">
      {!settings ? (
        <div className="text-center text-gray-500 py-8">加载中…</div>
      ) : (
        <div className="space-y-4 text-sm">
          {/* 基本 */}
          <Field label="家国标识">
            <input
              value={settings.home_country}
              onChange={(e) => updateField('home_country', e.target.value)}
              className="input-box"
            />
          </Field>
          <Field label="频繁连接阈值">
            <input
              type="number"
              min={1}
              value={settings.frequent_threshold}
              onChange={(e) => updateField('frequent_threshold', +e.target.value)}
              className="input-box w-24"
            />
          </Field>
          <Field label="境外高亮">
            <Toggle
              checked={settings.foreign_highlight}
              onChange={(v) => updateField('foreign_highlight', v)}
            />
          </Field>

          {/* 地址字段选择 */}
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">地址显示字段</label>
            <div className="flex flex-wrap gap-2">
              {FIELD_LABELS.map((label, i) => (
                <label key={i} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.address_fields.includes(i)}
                    onChange={() => toggleAddressField(i)}
                    className="accent-brand-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* 自动封禁 */}
          <div className="border-t border-gray-800 pt-3">
            <h4 className="text-xs text-gray-500 mb-2">自动封禁</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="启用">
                <Toggle
                  checked={settings.auto_ban.enabled}
                  onChange={(v) => updateField('auto_ban', { ...settings.auto_ban, enabled: v })}
                />
              </Field>
              <Field label="仅境外">
                <Toggle
                  checked={settings.auto_ban.foreign_only}
                  onChange={(v) => updateField('auto_ban', { ...settings.auto_ban, foreign_only: v })}
                />
              </Field>
              <Field label="时间窗口 (秒)">
                <input
                  type="number"
                  min={1}
                  value={settings.auto_ban.threshold_seconds}
                  onChange={(e) =>
                    updateField('auto_ban', { ...settings.auto_ban, threshold_seconds: +e.target.value })
                  }
                  className="input-box w-20"
                />
              </Field>
              <Field label="触发次数">
                <input
                  type="number"
                  min={1}
                  value={settings.auto_ban.threshold_count}
                  onChange={(e) =>
                    updateField('auto_ban', { ...settings.auto_ban, threshold_count: +e.target.value })
                  }
                  className="input-box w-20"
                />
              </Field>
            </div>
          </div>

          {/* 密码 */}
          <div className="border-t border-gray-800 pt-3">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={changePwd}
                onChange={(e) => setChangePwd(e.target.checked)}
                className="accent-brand-500"
              />
              修改密码
            </label>
            {changePwd && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  placeholder="旧密码"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  className="input-box"
                />
                <input
                  type="password"
                  placeholder="新密码"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="input-box"
                />
              </div>
            )}
          </div>

          {/* 动作 */}
          <div className="flex items-center justify-between pt-2">
            {msg && <span className="text-xs text-brand-400">{msg}</span>}
            <button
              onClick={handleSave}
              disabled={loading}
              className="ml-auto px-4 py-1.5 bg-brand-600 hover:bg-brand-500
                         disabled:opacity-50 rounded-lg text-xs font-medium"
            >
              {loading ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </BaseModal>
  );
}

// ── 小组件 ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
