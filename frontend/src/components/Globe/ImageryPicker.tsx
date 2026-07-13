import { useState, useRef, useEffect } from 'react';
import type { ImageryType } from '../../types';

const STORAGE_KEY = 'frp_pv_imagery_type';
const EVENT_NAME  = 'frp_pv_imagery_type';

interface ImageryOption {
  value: ImageryType;
  label: string;
  /** CSS fallback color for items without tile preview */
  fallback?: string;
}

interface ImageryGroup {
  title: string;
  items: ImageryOption[];
}

// ── 通过实际瓦片 URL 生成缩略图 ──
// z=1, x=1, y=0 → 显示亚欧大陆区域
function getPreviewUrl(type: ImageryType): string | null {
  const esri = (svc: string) =>
    `https://services.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/1/0/1`;
  const carto = (style: string) =>
    `https://a.basemaps.cartocdn.com/${style}/1/1/0.png`;
  const google = (lyrs: string) =>
    `https://mt0.google.com/vt/lyrs=${lyrs}&x=1&y=0&z=1`;


  switch (type) {
    case 'dark': return null;
    // Ion — 用视觉近似的公开瓦片做缩略图
    case 'bing_aerial': return esri('World_Imagery');
    case 'bing_aerial_labels': return esri('World_Imagery');
    case 'bing_roads': return esri('World_Street_Map');
    case 'sentinel2': return esri('World_Imagery');
    case 'blue_marble': return esri('World_Physical_Map');
    case 'earth_at_night': return carto('dark_nolabels');
    case 'natural_earth': return esri('NatGeo_World_Map');
    // Google
    case 'google_maps': return google('s');
    case 'google_satellite': return google('y');
    case 'google_roadmap': return google('m');
    case 'google_contour': return google('p');
    // Esri
    case 'arcgis': return esri('World_Imagery');
    case 'arcgis_hillshade': return esri('Elevation/World_Hillshade');
    case 'esri_ocean': return esri('Ocean/World_Ocean_Base');
    case 'esri_street': return esri('World_Street_Map');
    case 'esri_topo': return esri('World_Topo_Map');
    case 'esri_dark_gray': return esri('Canvas/World_Dark_Gray_Base');
    case 'esri_light_gray': return esri('Canvas/World_Light_Gray_Base');
    case 'esri_natgeo': return esri('NatGeo_World_Map');
    // OSM
    case 'osm': return 'https://a.tile.openstreetmap.org/1/1/0.png';
    case 'open_topo': return 'https://a.tile.opentopomap.org/1/1/0.png';
    // CartoDB
    case 'carto_dark': return carto('dark_all');
    case 'carto_dark_nolabels': return carto('dark_nolabels');
    case 'carto_light': return carto('light_all');
    case 'carto_light_nolabels': return carto('light_nolabels');
    case 'carto_voyager': return carto('rastertiles/voyager');
    default: return null;
  }
}

const GROUPS: ImageryGroup[] = [
  {
    title: '特殊',
    items: [
      { value: 'dark', label: '纯黑', fallback: '#0a0a1a' },
    ],
  },
  {
    title: 'Cesium Ion',
    items: [
      { value: 'bing_aerial', label: 'Bing Aerial', fallback: '#1a3a2a' },
      { value: 'bing_aerial_labels', label: 'Bing 带标注', fallback: '#1a3a2e' },
      { value: 'bing_roads', label: 'Bing Roads', fallback: '#e8e4d8' },
      { value: 'sentinel2', label: 'Sentinel-2', fallback: '#2a4a3a' },
      { value: 'blue_marble', label: 'Blue Marble', fallback: '#1a3050' },
      { value: 'earth_at_night', label: '夜间地球', fallback: '#050510' },
      { value: 'natural_earth', label: 'Natural Earth', fallback: '#c4b99a' },
    ],
  },
  {
    title: 'Google Maps',
    items: [
      { value: 'google_maps', label: '卫星' },
      { value: 'google_satellite', label: '卫星+标注' },
      { value: 'google_roadmap', label: '路线图' },
      { value: 'google_contour', label: '等高线' },
    ],
  },
  {
    title: 'Esri / ArcGIS',
    items: [
      { value: 'arcgis', label: '卫星影像' },
      { value: 'arcgis_hillshade', label: '山体阴影' },
      { value: 'esri_ocean', label: '海洋底图' },
      { value: 'esri_street', label: '街道' },
      { value: 'esri_topo', label: '地形' },
      { value: 'esri_dark_gray', label: '深灰' },
      { value: 'esri_light_gray', label: '浅灰' },
      { value: 'esri_natgeo', label: '国家地理' },
    ],
  },
  {
    title: 'OpenStreetMap',
    items: [
      { value: 'osm', label: 'OSM' },
      { value: 'open_topo', label: 'OpenTopo' },
    ],
  },
  {
    title: 'CartoDB',
    items: [
      { value: 'carto_dark', label: '暗色' },
      { value: 'carto_dark_nolabels', label: '暗色无标注' },
      { value: 'carto_light', label: '亮色' },
      { value: 'carto_light_nolabels', label: '亮色无标注' },
      { value: 'carto_voyager', label: 'Voyager' },
    ],
  },

];

const ALL_OPTIONS = GROUPS.flatMap((g) => g.items);

/** 缩略图组件: 优先加载真实瓦片, 失败时用 fallback 颜色 */
function Thumb({ type, fallback, size = 48 }: { type: ImageryType; fallback?: string; size?: number }) {
  const url = getPreviewUrl(type);
  const [err, setErr] = useState(false);

  if (!url || err) {
    return (
      <div
        className="rounded shrink-0"
        style={{ width: size, height: size, background: fallback ?? '#222' }}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setErr(true)}
      className="rounded shrink-0 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default function ImageryPicker() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [current, setCurrent] = useState<ImageryType>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ImageryType) ?? 'dark';
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function select(value: ImageryType) {
    if (value === current) { setOpen(false); return; }
    setCurrent(value);
    localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value }));
    setOpen(false);
  }

  const currentOption = ALL_OPTIONS.find((o) => o.value === current);

  return (
    <div ref={panelRef} className="relative z-20">
      {/* 展开面板 */}
      {open && (
        <div className="mb-2 w-[calc(100vw-3rem)] sm:w-[340px] max-h-[75vh] overflow-y-auto bg-gray-900/90 backdrop-blur-md
                        border border-gray-700 rounded-lg shadow-xl
                        scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <div className="sticky top-0 px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider
                          border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm z-10">
            底图选择
          </div>
          {GROUPS.map((group) => (
            <div key={group.title} className="px-2 pb-1">
              <div className="px-1 pt-2 pb-1 text-[10px] text-gray-600 font-medium">
                {group.title}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                {group.items.map((opt) => {
                  const active = opt.value === current;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => select(opt.value)}
                      className={`flex flex-col items-center p-1 rounded-md transition-all
                        ${active
                          ? 'ring-2 ring-brand-500 bg-brand-600/10'
                          : 'hover:bg-gray-800/60'
                        }`}
                      title={opt.label}
                    >
                      <Thumb type={opt.value} fallback={opt.fallback} size={56} />
                      <span className={`text-[9px] mt-0.5 w-full text-center leading-tight truncate
                        ${active ? 'text-brand-400' : 'text-gray-400'}`}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 触发按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/80 backdrop-blur-sm
                   border border-gray-700 rounded-lg text-xs text-gray-300
                   hover:bg-gray-800 hover:text-white transition-colors shadow-lg"
        title="切换底图"
      >
        <Thumb type={current} fallback={currentOption?.fallback} size={24} />
        <span>{currentOption?.label ?? '纯黑'}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
