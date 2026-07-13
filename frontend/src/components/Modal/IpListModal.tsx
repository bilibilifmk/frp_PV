import { useMemo } from 'react';
import BaseModal from './BaseModal';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAddressFields } from '../../hooks/useAddressFields';
import { getDesc } from '../../utils/formatDesc';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IpListModal({ open, onClose }: Props) {
  const allIpData = useConnectionStore((s) => s.allIpData);
  const addressFields = useAddressFields();

  // 按 count 降序
  const sorted = useMemo(
    () => [...allIpData].sort((a, b) => b.count - a.count),
    [allIpData],
  );

  return (
    <BaseModal open={open} onClose={onClose} title={`IP 列表 (${sorted.length})`} width="max-w-xl">
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500 sticky top-0 bg-gray-900">
            <tr>
              <th className="text-left py-1 px-2">IP</th>
              <th className="text-left py-1 px-2">模块</th>
              <th className="text-left py-1 px-2">位置</th>
              <th className="text-right py-1 px-2">次数</th>
              <th className="text-right py-1 px-2">最近</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-1.5 px-2 font-mono text-gray-300">{r.ip}</td>
                <td className="py-1.5 px-2 text-gray-400">{r.module}</td>
                <td className="py-1.5 px-2 text-gray-500 max-w-[200px] truncate">
                  {getDesc(r, addressFields)}
                </td>
                <td className="py-1.5 px-2 text-right text-brand-400 tabular-nums">{r.count}</td>
                <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BaseModal>
  );
}
