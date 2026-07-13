import { useMemo } from 'react';
import BaseModal from './BaseModal';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAddressFields } from '../../hooks/useAddressFields';
import { getDesc } from '../../utils/formatDesc';
import { tsToLocal } from '../../utils/time';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BlockedModal({ open, onClose }: Props) {
  const blockedRecords = useConnectionStore((s) => s.blockedRecords);
  const addressFields = useAddressFields();

  const sorted = useMemo(
    () => [...blockedRecords].reverse(),
    [blockedRecords],
  );

  return (
    <BaseModal open={open} onClose={onClose} title={`拦截记录 (${sorted.length})`} width="max-w-xl">
      <div className="max-h-[500px] overflow-y-auto space-y-1.5">
        {sorted.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-6">无拦截记录</div>
        )}
        {sorted.map((r, i) => (
          <div
            key={i}
            className="px-3 py-2 bg-gray-800/60 rounded-lg text-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-red-400 font-mono">{r.ip}</span>
                <span className="text-gray-600 mx-1">→</span>
                <span className="text-gray-300">{r.proxy}</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50">
                  {r.reason}
                </span>
              </div>
              <span className="text-gray-600 text-[11px] tabular-nums">
                {tsToLocal(r.time)}
              </span>
            </div>
            {getDesc(r, addressFields) && (
              <div className="text-gray-500 text-[11px] mt-0.5">
                {getDesc(r, addressFields)}
              </div>
            )}
          </div>
        ))}
      </div>
    </BaseModal>
  );
}
