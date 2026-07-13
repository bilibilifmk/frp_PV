import { useState, useEffect, useRef } from 'react';
import { useAddressFields, setAddressFields, DEFAULT_FIELDS } from '../../hooks/useAddressFields';

const FIELD_LABELS = ['国家', '省/州', '城市', '区/县', '街道/区域', '详细街道', 'ISP'];

/**
 * 右下角浮层工具栏 — 地址字段选择 + 境外高亮开关 + 弧线去重范围滑块
 * 所有配置均存 localStorage, 通过 CustomEvent 通知组件实时生效。
 */
export default function GlobeToolbar() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 地址显示字段
  const addressFields = useAddressFields();

  // 境外高亮
  const [foreign, setForeign] = useState(() => {
    const v = localStorage.getItem('frp_pv_foreign_highlight');
    return v === null ? true : v === '1';
  });

  // 弧线去重范围 (m)
  const [dedupKm, setDedupKm] = useState(() => {
    const v = localStorage.getItem('frp_pv_arc_dedup_km');
    return v ? Number(v) : 500000;
  });

  // 点聚合范围 (m)
  const [clusterM, setClusterM] = useState(() => {
    const v = localStorage.getItem('frp_pv_pt_cluster_m');
    return v ? Number(v) : 5000;
  });

  // 最短弧线距离 (m) — 源 IP 距服务器小于此值不画弧
  const [minArcDistM, setMinArcDistM] = useState(() => {
    const v = localStorage.getItem('frp_pv_min_arc_dist_m');
    return v ? Number(v) : 10000;
  });

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [open]);

  const toggleForeign = () => {
    const next = !foreign;
    setForeign(next);
    localStorage.setItem('frp_pv_foreign_highlight', next ? '1' : '0');
    window.dispatchEvent(new CustomEvent('frp_pv_foreign_hl', { detail: next }));
  };

  const changeDedupKm = (v: number) => {
    setDedupKm(v);
    localStorage.setItem('frp_pv_arc_dedup_km', String(v));
    window.dispatchEvent(new CustomEvent('frp_pv_arc_dedup', { detail: v }));
  };

  const changeClusterM = (v: number) => {
    setClusterM(v);
    localStorage.setItem('frp_pv_pt_cluster_m', String(v));
    window.dispatchEvent(new CustomEvent('frp_pv_pt_cluster', { detail: v }));
  };

  const changeMinArcDist = (v: number) => {
    setMinArcDistM(v);
    localStorage.setItem('frp_pv_min_arc_dist_m', String(v));
    window.dispatchEvent(new CustomEvent('frp_pv_min_arc_dist', { detail: v }));
  };

  const toggleField = (idx: number) => {
    const arr = [...addressFields];
    const pos = arr.indexOf(idx);
    if (pos >= 0) arr.splice(pos, 1);
    else arr.push(idx);
    setAddressFields(arr);
  };

  return (
    <div ref={ref} className="relative">
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-9 h-9 rounded-lg bg-gray-900/80 backdrop-blur border border-gray-700
                   flex items-center justify-center text-gray-400 hover:text-white
                   hover:border-gray-500 transition-colors"
        title="显示设置"
      >
        {/* 调整图标 — sliders */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      </button>

      {/* 弹出面板 */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56
                        bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg
                        shadow-xl p-3 space-y-3 text-xs text-gray-300 select-none">

          {/* 地址显示字段 */}
          <div>
            <span className="text-gray-400 block mb-1.5">地址显示</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {FIELD_LABELS.map((label, i) => (
                <label key={i} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addressFields.has(i)}
                    onChange={() => toggleField(i)}
                    className="accent-brand-500 w-3 h-3"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700/50" />

          {/* 境外高亮 */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400">境外高亮</span>
            <button
              type="button"
              role="switch"
              aria-checked={foreign}
              onClick={toggleForeign}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                foreign ? 'bg-brand-600' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                foreign ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>

          {/* 点聚合范围 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">点聚合</span>
              <span className="text-brand-400 tabular-nums">
                {clusterM === 0 ? '关闭' : clusterM >= 1000 ? `${clusterM / 1000} km` : `${clusterM} m`}
              </span>
            </div>
            <input
              type="range"
              min={0} max={50000} step={1000}
              value={clusterM}
              onChange={(e) => changeClusterM(Number(e.target.value))}
              className="w-full accent-brand-500 h-1.5"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>关闭</span>
              <span>50 km</span>
            </div>
          </div>

          {/* 最短弧线距离 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">就近不画弧</span>
              <span className="text-brand-400 tabular-nums">
                {minArcDistM === 0 ? '关闭' : minArcDistM >= 1000 ? `${minArcDistM / 1000} km` : `${minArcDistM} m`}
              </span>
            </div>
            <input
              type="range"
              min={0} max={500000} step={10000}
              value={minArcDistM}
              onChange={(e) => changeMinArcDist(Number(e.target.value))}
              className="w-full accent-brand-500 h-1.5"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>关闭</span>
              <span>500 km</span>
            </div>
          </div>

          {/* 弧线去重范围 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">弧线去重</span>
              <span className="text-brand-400 tabular-nums">
                {dedupKm === 0 ? '关闭' : dedupKm >= 1000 ? `${dedupKm / 1000} km` : `${dedupKm} m`}
              </span>
            </div>
            <input
              type="range"
              min={0} max={2000000} step={50000}
              value={dedupKm}
              onChange={(e) => changeDedupKm(Number(e.target.value))}
              className="w-full accent-brand-500 h-1.5"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>关闭</span>
              <span>2000 km</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
