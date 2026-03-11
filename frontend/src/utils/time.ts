/** 时间格式化工具 */

/** 秒数 → "Xh Xm Xs" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '-';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Unix 时间戳 → 本地时间字符串 */
export function tsToLocal(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

/** "2025-01-01 12:00:00" → 精简显示 */
export function shortTime(t: string): string {
  if (!t) return '';
  // 已经是 "YYYY-MM-DD HH:MM:SS" 格式
  // 只保留时分秒
  const parts = t.split(' ');
  return parts[1] ?? t;
}
