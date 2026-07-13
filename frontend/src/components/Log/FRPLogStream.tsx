import { useEffect, useMemo, useState } from 'react';
import type { FRPLogEntry } from '../../types';

interface FRPLogResponse {
  status: string;
  enabled: boolean;
  msg?: string;
  data: FRPLogEntry[];
}

export default function FRPLogStream() {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<FRPLogEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/frp-log?limit=80', {
          credentials: 'include',
          signal: controller.signal,
        });
        const result = await response.json() as FRPLogResponse;
        if (disposed) return;
        setEnabled(Boolean(result.enabled));
        setEntries(Array.isArray(result.data) ? result.data : []);
        setError(result.status === 'success' ? '' : (result.msg || '日志读取失败'));
      } catch (err) {
        if (!disposed && (err as Error).name !== 'AbortError') setError('日志接口连接失败');
      }
    };

    void load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, []);

  const recent = useMemo(() => entries.slice(-50).reverse(), [entries]);
  if (!enabled) return null;

  return (
    <div className="mt-3 border-t border-gray-800 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-gray-500">FRP 日志</h3>
        <span className="text-[9px] text-gray-700">每 3 秒刷新</span>
      </div>
      <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1 md:max-h-[210px]">
        {error && <div className="rounded bg-red-950/40 px-2 py-1.5 text-[10px] text-red-400">{error}</div>}
        {!error && recent.length === 0 && (
          <div className="py-4 text-center text-xs text-gray-600">暂无关键 FRP 日志</div>
        )}
        {recent.map((entry, index) => (
          <div key={`${entry.time}-${index}`} className="rounded bg-gray-950/45 px-2 py-1.5 text-[10px] leading-4">
            <div className="flex items-center gap-1.5">
              <span className={entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : 'text-brand-400'}>
                {entry.category}
              </span>
              {entry.time && <span className="text-gray-700">{entry.time}</span>}
            </div>
            <div className="break-all font-mono text-gray-500" title={entry.message}>{entry.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
