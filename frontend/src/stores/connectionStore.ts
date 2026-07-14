import { create } from 'zustand';
import type {
  ConnectionRecord,
  BlockedRecord,
  ActiveConnection,
  DisconnectRecord,
  EventEntry,
  DemoConnectionEvent,
} from '../types';

const recentDemoIPs = new Map<string, number>();

interface ConnectionState {
  allIpData: ConnectionRecord[];
  blockedRecords: BlockedRecord[];
  activeConnections: Map<string, ActiveConnection>;
  blockedCount: number;
  eventLog: EventEntry[];
  activeBannedIps: Set<string>;
  demoMode: boolean;
  demoQueue: DemoConnectionEvent[];
  connectionOpenSequence: number;

  setInit: (data: ConnectionRecord[]) => void;
  addNewIp: (rec: ConnectionRecord) => void;
  updateIp: (rec: ConnectionRecord) => void;
  addBlockedEvent: (rec: BlockedRecord) => void;
  updateBlockedGeo: (rec: BlockedRecord) => void;
  setBlockedCount: (n: number) => void;
  setBlockedInit: (list: BlockedRecord[]) => void;
  setActiveInit: (list: ActiveConnection[]) => void;
  openConnection: (data: Record<string, unknown>) => void;
  closeConnection: (data: DisconnectRecord) => void;
  setEventLogInit: (logs: EventEntry[]) => void;
  addEventLog: (entry: EventEntry) => void;
  unbanIp: (ip: string) => void;
  setDemoMode: (enabled: boolean) => void;
  shiftDemoEvent: (id: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  allIpData: [],
  blockedRecords: [],
  activeConnections: new Map(),
  blockedCount: 0,
  eventLog: [],
  activeBannedIps: new Set(),
  // 演示会主动控制镜头，每次打开页面均保持关闭，由用户手动开启。
  demoMode: false,
  demoQueue: [],
  connectionOpenSequence: 0,

  // ── init ──
  setInit: (data) => set({ allIpData: Array.isArray(data) ? data : [] }),

  // ── new_ip ──
  addNewIp: (rec) =>
    set((s) => ({ allIpData: [...s.allIpData, rec] })),

  // ── update_ip ──
  updateIp: (rec) =>
    set((s) => ({
      allIpData: s.allIpData.map((r) =>
        r.ip === rec.ip && r.module === rec.module
          ? { ...r, count: rec.count, time: rec.time }
          : r,
      ),
    })),

  // ── blocked_event ──
  addBlockedEvent: (rec) =>
    set((s) => {
      const records = [...s.blockedRecords, rec].slice(-200);
      const banned = new Set(s.activeBannedIps);
      if (rec.ip) banned.add(rec.ip);
      return { blockedRecords: records, activeBannedIps: banned };
    }),

  // ── blocked_geo_update ──
  updateBlockedGeo: (rec) =>
    set((s) => ({
      blockedRecords: s.blockedRecords.map((r) =>
        r.ip === rec.ip && r.time === rec.time
          ? { ...r, desc: rec.desc, country: rec.country, geo_parts: rec.geo_parts }
          : r,
      ),
    })),

  // ── blocked_update ──
  setBlockedCount: (n) => set({ blockedCount: n }),

  // ── blocked_init ──
  setBlockedInit: (list) => set({ blockedRecords: Array.isArray(list) ? list : [] }),

  // ── active_init ──
  setActiveInit: (list) => {
    const map = new Map<string, ActiveConnection>();
    if (Array.isArray(list)) list.forEach((c) => map.set(c.remote_addr, c));
    set({ activeConnections: map });
  },

  // ── connection_opened ──
  openConnection: (data) =>
    set((s) => {
      const map = new Map(s.activeConnections);
      const addr = data.remote_addr as string;
      const ip = data.ip as string;
      if (addr) {
        map.set(addr, {
          ip,
          module: data.module as string,
          remote_addr: addr,
          since: Math.floor(Date.now() / 1000),
          elapsed: 0,
          desc: (data.desc as string) || '',
          country: (data.country as string) || '',
          geo_parts: data.geo_parts as string[] | undefined,
        });
      }

      let demoQueue = s.demoQueue;
      if (s.demoMode && ip && addr) {
        const fallback = s.allIpData.find(
          (record) => record.ip === ip && record.lat != null && record.lon != null,
        );
        const lat = typeof data.lat === 'number' ? data.lat : fallback?.lat;
        const lon = typeof data.lon === 'number' ? data.lon : fallback?.lon;
        const now = Date.now();
        const lastSeen = recentDemoIPs.get(ip) ?? 0;
        // 同一 IP 短时间内只演示一次，防止扫描流量反复抢占相机。
        if (
          lat != null && lon != null &&
          Number.isFinite(lat) && Number.isFinite(lon) &&
          now - lastSeen >= 8_000
        ) {
          recentDemoIPs.set(ip, now);
          if (recentDemoIPs.size > 500) {
            for (const [key, timestamp] of recentDemoIPs) {
              if (now - timestamp > 60_000) recentDemoIPs.delete(key);
            }
          }
          const event: DemoConnectionEvent = {
            id: `${now}-${ip}-${Math.random().toString(36).slice(2, 7)}`,
            ip,
            module: (data.module as string) || '',
            lat,
            lon,
            time: now,
          };
          // 高并发时只保留最近 8 个待播放事件。
          demoQueue = [...demoQueue, event].slice(-8);
        }
      }
      return {
        activeConnections: map,
        demoQueue,
        connectionOpenSequence: s.connectionOpenSequence + 1,
      };
    }),

  // ── connection_closed ──
  closeConnection: (data) =>
    set((s) => {
      const map = new Map(s.activeConnections);
      if (data.remote_addr) map.delete(data.remote_addr);
      return { activeConnections: map };
    }),

  // ── event_log_init ──
  setEventLogInit: (logs) => set({ eventLog: Array.isArray(logs) ? logs : [] }),

  // ── append single event ──
  addEventLog: (entry) =>
    set((s) => ({ eventLog: [...s.eventLog, entry].slice(-500) })),

  // ── unban_ip ──
  unbanIp: (ip) =>
    set((s) => {
      const banned = new Set(s.activeBannedIps);
      banned.delete(ip);
      return { activeBannedIps: banned };
    }),

  setDemoMode: (enabled) => {
    // 保留浏览器内的同 IP 去重缓存，避免短时间来回切换后重复播放相同连接。
    set({ demoMode: enabled, demoQueue: [] });
  },

  shiftDemoEvent: (id) =>
    set((s) => ({ demoQueue: s.demoQueue.filter((event) => event.id !== id) })),
}));
