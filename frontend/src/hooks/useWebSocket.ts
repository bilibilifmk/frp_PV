import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { WSMessage, ConnectionRecord, BlockedRecord, DisconnectRecord, EventEntry, SysLogEntry } from '../types';

/**
 * 建立到后端的 WebSocket 连接，自动重连，并把消息分发到 Zustand store。
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    setInit,
    addNewIp,
    updateIp,
    addBlockedEvent,
    updateBlockedGeo,
    setBlockedCount,
    setBlockedInit,
    setActiveInit,
    openConnection,
    closeConnection,
    setEventLogInit,
    addEventLog,
    unbanIp,
  } = useConnectionStore();

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        dispatch(msg);
      } catch {
        // 无效消息
      }
    };

    ws.onclose = () => {
      timerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dispatch(msg: WSMessage) {
    const d = msg.data as never;
    switch (msg.type) {
      case 'init':
        setInit(d as ConnectionRecord[]);
        break;
      case 'new_ip':
        addNewIp(d as ConnectionRecord);
        addEventLog({ kind: 'conn', data: d });
        break;
      case 'update_ip':
        updateIp(d as ConnectionRecord);
        break;
      case 'blocked_event':
        addBlockedEvent(d as BlockedRecord);
        break;
      case 'blocked_geo_update':
        updateBlockedGeo(d as BlockedRecord);
        break;
      case 'blocked_update':
        setBlockedCount((d as { blocked: number }).blocked);
        break;
      case 'blocked_init':
        setBlockedInit(d as BlockedRecord[]);
        break;
      case 'active_init':
        setActiveInit(d as ActiveConnectionArr);
        break;
      case 'connection_opened':
        openConnection(d as Record<string, unknown>);
        break;
      case 'connection_closed':
        closeConnection(d as DisconnectRecord);
        addEventLog({ kind: 'disconn', data: d });
        break;
      case 'event_log_init':
        setEventLogInit(d as EventEntry[]);
        break;
      case 'sys_log':
        addEventLog({ kind: 'sys', data: d as SysLogEntry });
        break;
      case 'unban_ip':
        unbanIp((d as { ip: string }).ip);
        break;
    }
  }

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  return wsRef;
}

// helper type
type ActiveConnectionArr = import('../types').ActiveConnection[];
