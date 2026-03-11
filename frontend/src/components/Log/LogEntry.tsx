import { useMemo } from 'react';
import { getDesc } from '../../utils/formatDesc';
import { shortTime } from '../../utils/time';
import type { EventEntry, ConnectionRecord, DisconnectRecord, SysLogEntry, BlockedRecord } from '../../types';

interface Props {
  entry: EventEntry;
  addressFields: Set<number>;
}

export default function LogEntry({ entry, addressFields }: Props) {
  const { kind, data } = entry;

  const content = useMemo(() => {
    switch (kind) {
      case 'conn': {
        const d = data as ConnectionRecord;
        const desc = getDesc(d, addressFields);
        return (
          <span>
            <Tag color="cyan">连接</Tag>
            <span className="text-gray-400">{d.ip}</span>
            <span className="text-gray-600 mx-1">→</span>
            <span className="text-gray-300">{d.module}</span>
            {desc && <span className="text-gray-500 ml-1 text-[11px]">{desc}</span>}
          </span>
        );
      }
      case 'disconn': {
        const d = data as DisconnectRecord;
        const dur = d.duration != null ? `${Math.round(d.duration)}s` : '';
        return (
          <span>
            <Tag color="gray">断开</Tag>
            <span className="text-gray-400">{d.ip}</span>
            <span className="text-gray-600 mx-1">→</span>
            <span className="text-gray-300">{d.module}</span>
            {dur && <span className="text-gray-600 ml-1 text-[11px]">({dur})</span>}
          </span>
        );
      }
      case 'sys': {
        const d = data as SysLogEntry;
        const isBan = d.type === 'ban';
        return (
          <span>
            <Tag color={isBan ? 'red' : 'green'}>{isBan ? '封禁' : '解封'}</Tag>
            <span className="text-gray-300">{d.msg}</span>
          </span>
        );
      }
      case 'blocked': {
        const d = data as BlockedRecord;
        const desc = getDesc(d, addressFields);
        return (
          <span>
            <Tag color="orange">拦截</Tag>
            <span className="text-gray-400">{d.ip}</span>
            <span className="text-gray-600 mx-1">→</span>
            <span className="text-gray-300">{d.proxy}</span>
            {desc && <span className="text-gray-500 ml-1 text-[11px]">{desc}</span>}
          </span>
        );
      }
      default:
        return <span className="text-gray-500">未知事件</span>;
    }
  }, [kind, data, addressFields]);

  const time = useMemo(() => {
    if (kind === 'conn') return shortTime((data as ConnectionRecord).time);
    if (kind === 'disconn') return shortTime((data as DisconnectRecord).time);
    if (kind === 'sys') return shortTime((data as SysLogEntry).time);
    if (kind === 'blocked') {
      const ts = (data as BlockedRecord).time;
      return new Date(ts * 1000).toLocaleTimeString('zh-CN', { hour12: false });
    }
    return '';
  }, [kind, data]);

  return (
    <div className="flex items-start gap-2 text-xs leading-5">
      <span className="text-gray-600 shrink-0 tabular-nums w-16">{time}</span>
      <div className="min-w-0 break-all">{content}</div>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: string }) {
  const classes: Record<string, string> = {
    cyan: 'bg-cyan-900/50 text-cyan-400 border-cyan-800',
    gray: 'bg-gray-800 text-gray-400 border-gray-700',
    red: 'bg-red-900/50 text-red-400 border-red-800',
    green: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
    orange: 'bg-orange-900/50 text-orange-400 border-orange-800',
  };
  return (
    <span
      className={`inline-block text-[10px] leading-4 px-1.5 rounded border mr-1.5
                  ${classes[color] || classes.gray}`}
    >
      {children}
    </span>
  );
}
