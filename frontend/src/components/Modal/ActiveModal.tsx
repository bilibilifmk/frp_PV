import { useMemo } from 'react';
import BaseModal from './BaseModal';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getDesc } from '../../utils/formatDesc';
import { formatDuration } from '../../utils/time';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ActiveModal({ open, onClose }: Props) {
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const config = useSettingsStore((s) => s.config);
  const addressFields = useMemo(
    () => new Set(config?.address_fields ?? [0, 1, 2, 3, 4, 5, 6]),
    [config?.address_fields],
  );

  const list = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(activeConnections.values()).map((c) => ({
      ...c,
      elapsed: now - c.since,
      descText: getDesc(c, addressFields),
    }));
  }, [activeConnections, addressFields]);

  return (
    <BaseModal open={open} onClose={onClose} title={`活跃连接 (${list.length})`}>
      <div className="max-h-[500px] overflow-y-auto space-y-1.5">
        {list.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-6">无活跃连接</div>
        )}
        {list.map((c) => (
          <div
            key={c.remote_addr}
            className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg text-xs"
          >
            <div className="min-w-0">
              <span className="text-emerald-400 font-mono">{c.ip}</span>
              <span className="text-gray-600 mx-1">→</span>
              <span className="text-gray-300">{c.module}</span>
              {c.descText && (
                <span className="text-gray-500 ml-1.5 text-[11px]">{c.descText}</span>
              )}
            </div>
            <span className="text-gray-500 tabular-nums shrink-0 ml-2">
              {formatDuration(c.elapsed)}
            </span>
          </div>
        ))}
      </div>
    </BaseModal>
  );
}
