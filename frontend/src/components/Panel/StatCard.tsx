interface Props {
  label: string;
  value: number | string;
  color?: 'default' | 'green' | 'red' | 'yellow';
  onClick?: () => void;
}

const colorMap = {
  default: 'text-brand-400',
  green: 'text-emerald-400',
  red: 'text-red-400',
  yellow: 'text-amber-400',
};

export default function StatCard({ label, value, color = 'default', onClick }: Props) {
  const cls = onClick ? 'cursor-pointer hover:bg-gray-700/50' : '';

  return (
    <div
      className={`bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/50 ${cls}`}
      onClick={onClick}
    >
      <div className={`text-xl font-bold tabular-nums ${colorMap[color]}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
