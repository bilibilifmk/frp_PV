// ── 基础数据类型 ──

export interface ServerLocation {
  lat: number;
  lng: number;
  name: string;
}

export interface AutoBan {
  enabled: boolean;
  foreign_only: boolean;
  ban_unknown_country: boolean;
  ban_unknown_location: boolean;
  threshold_seconds: number;
  threshold_count: number;
  initial_ban_minutes: number;
  max_ban_minutes: number;
  permanent_ban: boolean;
  whitelist_modules: string[];
  whitelist_ips: string[];
}

/** 底图影像类型 */
export type ImageryType =
  // 纯黑
  | 'dark'
  // Cesium Ion (需要 Ion Token)
  | 'bing_aerial'
  | 'bing_aerial_labels'
  | 'bing_roads'
  | 'sentinel2'
  | 'blue_marble'
  | 'earth_at_night'
  | 'natural_earth'
  // Google Maps (直连瓦片)
  | 'google_maps'
  | 'google_satellite'
  | 'google_roadmap'
  | 'google_contour'
  // Esri / ArcGIS
  | 'arcgis'
  | 'arcgis_hillshade'
  | 'esri_ocean'
  | 'esri_street'
  | 'esri_topo'
  | 'esri_dark_gray'
  | 'esri_light_gray'
  | 'esri_natgeo'
  // OpenStreetMap
  | 'osm'
  | 'open_topo'
  // CartoDB
  | 'carto_dark'
  | 'carto_dark_nolabels'
  | 'carto_light'
  | 'carto_light_nolabels'
  | 'carto_voyager'
;

/** 后端在登录成功后返回的前端运行时配置 */
export interface AppConfig {
  server_location: ServerLocation;
  home_country: string;
  cesium_ion_token: string;
}

/** 前端设置面板用 */
export interface Settings {
  home_country: string;
  admin_username: string;
  server_location: ServerLocation;
  geo_cache: {
    normal_ttl_days: number;
    active_window_hrs: number;
    active_ttl_days: number;
    persist_every: number;
  };
  firewall_mode: 'plugin' | 'iptables';
  auto_ban: AutoBan;
  cesium_ion_token: string;
}

// ── WebSocket 数据模型 ──

export interface ConnectionRecord {
  ip: string;
  module: string;
  lat: number | null;
  lon: number | null;
  country: string;
  desc: string;
  geo_parts: string[] | null;
  time: string;
  count: number;
}

export interface BlockedRecord {
  ip: string;
  proxy: string;
  reason: string;
  desc: string;
  country: string;
  geo_parts?: string[];
  lat?: number | null;
  lon?: number | null;
  time: number;
}

export interface ActiveConnection {
  ip: string;
  module: string;
  remote_addr: string;
  since: number;
  elapsed: number;
  desc: string;
  country: string;
  geo_parts?: string[];
}

export interface DisconnectRecord {
  ip: string;
  module: string;
  remote_addr: string;
  duration: number | null;
  time: string;
  desc: string;
  country: string;
  geo_parts?: string[];
  active: number;
}

export interface SysLogEntry {
  msg: string;
  type: string;
  desc: string;
  ip: string;
  proxy: string;
  reason: string;
  time: string;
}

export interface EventEntry {
  kind: 'conn' | 'disconn' | 'sys' | 'blocked';
  data: unknown;
}

export interface WSMessage {
  type: string;
  data: unknown;
}

/** 防火墙列表条目 */
export interface FirewallItem {
  num: number;
  ip: string;
  desc: string;
  strike_count: number;
  banned_until: number | null;
  permanent: boolean;
}
