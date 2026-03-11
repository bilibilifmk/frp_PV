/**
 * 地址拼接工具 — 移植自原 Python/JS 版本。
 *
 * geo_parts 含 7 项: [country, region, city, district, locality, street, isp]
 * fields 是用户选中的下标集合 (0-6)。
 */

const ADMIN_SUFFIXES = ['省', '市', '区', '县', '自治区', '自治州', '自治县', '特别行政区', '地区', '盟', '州'];

function normAdmin(s: string): string {
  for (const suffix of ADMIN_SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) {
      return s.slice(0, -suffix.length);
    }
  }
  return s;
}

/**
 * 根据选中 fields 拼接地址描述。
 */
export function formatDesc(
  geoParts: string[] | null | undefined,
  fields: Set<number>,
  fallback?: string,
): string {
  if (!geoParts || geoParts.length === 0) return fallback ?? '';

  const addrParts = geoParts.slice(0, 5);
  const street = geoParts[5] ?? '';
  const isp = geoParts[6] ?? '';

  const parts: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < addrParts.length; i++) {
    if (!fields.has(i)) continue;
    const p = (addrParts[i] ?? '').trim().replace(/^[,，]+/, '');
    if (!p) continue;
    const key = normAdmin(p);
    if (!seen.has(key)) {
      parts.push(p);
      seen.add(key);
    }
  }

  let desc: string;
  if (parts.length <= 1) {
    desc = parts[0] || '';
  } else {
    desc = `${parts[0]} - ${parts.slice(1).join(' · ')}`;
  }

  if (fields.has(5) && street) desc += ` ${street.trim()}`;
  if (fields.has(6) && isp) desc += ` ${isp}`;

  return desc;
}

/**
 * 便捷函数: 从 ConnectionRecord / BlockedRecord 等对象里取 desc。
 */
export function getDesc(
  obj: { geo_parts?: string[] | null; desc?: string } | null | undefined,
  fields: Set<number>,
): string {
  if (!obj) return '';
  return formatDesc(obj.geo_parts, fields, obj.desc ?? '');
}
