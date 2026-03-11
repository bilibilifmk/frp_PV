import { create } from 'zustand';
import type {
  ConnectionRecord,
  BlockedRecord,
  ActiveConnection,
  DisconnectRecord,
  EventEntry,
} from '../types';

interface ConnectionState {
  allIpData: ConnectionRecord[];
  blockedRecords: BlockedRecord[];
  activeConnections: Map<string, ActiveConnection>;
  blockedCount: number;
  eventLog: EventEntry[];
  activeBannedIps: Set<string>;

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
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  allIpData: [],
  blockedRecords: [],
  activeConnections: new Map(),
  blockedCount: 0,
  eventLog: [],
  activeBannedIps: new Set(),

  // ── init ──
  setInit: (data) => set({ allIpData: data }),

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
  setBlockedInit: (list) => set({ blockedRecords: list }),

  // ── active_init ──
  setActiveInit: (list) => {
    const map = new Map<string, ActiveConnection>();
    list.forEach((c) => map.set(c.remote_addr, c));
    set({ activeConnections: map });
  },

  // ── connection_opened ──
  openConnection: (data) =>
    set((s) => {
      const map = new Map(s.activeConnections);
      const addr = data.remote_addr as string;
      if (addr) {
        map.set(addr, {
          ip: data.ip as string,
          module: data.module as string,
          remote_addr: addr,
          since: Math.floor(Date.now() / 1000),
          elapsed: 0,
          desc: (data.desc as string) || '',
          country: (data.country as string) || '',
          geo_parts: data.geo_parts as string[] | undefined,
        });
      }
      return { activeConnections: map };
    }),

  // ── connection_closed ──
  closeConnection: (data) =>
    set((s) => {
      const map = new Map(s.activeConnections);
      if (data.remote_addr) map.delete(data.remote_addr);
      return { activeConnections: map };
    }),

  // ── event_log_init ──
  setEventLogInit: (logs) => set({ eventLog: logs }),

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
}));
