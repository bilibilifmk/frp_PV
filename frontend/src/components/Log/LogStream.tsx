import { useRef, useEffect, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAddressFields } from '../../hooks/useAddressFields';
import LogEntry from './LogEntry';

export default function LogStream() {
  const eventLog = useConnectionStore((s) => s.eventLog);
  const bottomRef = useRef<HTMLDivElement>(null);
  const addressFields = useAddressFields();

  // 最新 50 条, 倒序 → 最新在上
  const recent = useMemo(() => {
    return eventLog.slice(-50).reverse();
  }, [eventLog]);

  useEffect(() => {
    // 滚动到顶部 (最新条目)
    bottomRef.current?.scrollTo({ top: 0 });
  }, [recent.length]);

  return (
    <div
      ref={bottomRef}
      className="max-h-[180px] md:max-h-[320px] overflow-y-auto space-y-1 pr-1"
    >
      {recent.length === 0 && (
        <div className="text-center text-gray-600 text-xs py-6">暂无日志</div>
      )}
      {recent.map((entry, i) => (
        <LogEntry key={i} entry={entry} addressFields={addressFields} />
      ))}
    </div>
  );
}
