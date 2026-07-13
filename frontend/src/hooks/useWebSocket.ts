import { useCallback, useEffect, useRef } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { WSMessage, ConnectionRecord, BlockedRecord, DisconnectRecord, EventEntry, SysLogEntry } from '../types';

/** 建立 WebSocket 连接、分发实时事件并在断线后重连。 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const disposedRef = useRef(false);

  const dispatch = useCallback((msg: WSMessage) => {
    const store = useConnectionStore.getState();
    const data = msg.data as never;
    switch (msg.type) {
      case 'init': store.setInit(data as ConnectionRecord[]); break;
      case 'new_ip':
        store.addNewIp(data as ConnectionRecord);
        store.addEventLog({ kind: 'conn', data });
        break;
      case 'update_ip': store.updateIp(data as ConnectionRecord); break;
      case 'blocked_event': store.addBlockedEvent(data as BlockedRecord); break;
      case 'blocked_geo_update': store.updateBlockedGeo(data as BlockedRecord); break;
      case 'blocked_update': store.setBlockedCount((data as { blocked: number }).blocked); break;
      case 'blocked_init': store.setBlockedInit(data as BlockedRecord[]); break;
      case 'active_init': store.setActiveInit(data as ActiveConnectionArr); break;
      case 'connection_opened': store.openConnection(data as Record<string, unknown>); break;
      case 'connection_closed':
        store.closeConnection(data as DisconnectRecord);
        store.addEventLog({ kind: 'disconn', data });
        break;
      case 'event_log_init': store.setEventLogInit(data as EventEntry[]); break;
      case 'sys_log': store.addEventLog({ kind: 'sys', data: data as SysLogEntry }); break;
      case 'unban_ip': store.unbanIp((data as { ip: string }).ip); break;
    }
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try { dispatch(JSON.parse(event.data) as WSMessage); } catch { /* ignore malformed messages */ }
    };
    ws.onclose = () => {
      if (!disposedRef.current) reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, [dispatch]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}

type ActiveConnectionArr = import('../types').ActiveConnection[];
