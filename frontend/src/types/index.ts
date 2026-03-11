// ── 基础数据类型 ──

export interface ServerLocation {
  lat: number;
  lng: number;
  name: string;
}

export interface AutoBan {
  enabled: boolean;
  foreign_only: boolean;
  threshold_seconds: number;
  threshold_count: number;
  whitelist_modules: string[];
  whitelist_ips: string[];
}

/** 后端在登录成功后返回的前端运行时配置 */
export interface AppConfig {
  server_location: ServerLocation;
  arc_lifetime_seconds: number;
  home_country: string;
  frequent_threshold: number;
  foreign_highlight: boolean;
  address_fields: number[];
}

/** 前端设置面板用 */
export interface Settings {
  home_country: string;
  frequent_threshold: number;
  foreign_highlight: boolean;
  admin_username: string;
  auto_ban: AutoBan;
  address_fields: number[];
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
}
