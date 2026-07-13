import { useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'frp_pv_address_fields';
const EVENT_NAME = 'frp_pv_address_fields';
const DEFAULT_FIELDS = [0, 1, 2, 3, 4, 5, 6];

function readFields(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch { /* ignore */ }
  return DEFAULT_FIELDS;
}

/**
 * 从 localStorage 读取地址显示字段配置, 并监听实时变更.
 * 返回 Set<number> 方便 O(1) 查找.
 */
export function useAddressFields(): Set<number> {
  const [fields, setFields] = useState(readFields);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) setFields(detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  return useMemo(() => new Set(fields), [fields]);
}

/** 保存地址字段并广播变更事件 */
export function setAddressFields(fields: number[]) {
  const sorted = [...fields].sort();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: sorted }));
}

export { STORAGE_KEY, EVENT_NAME, DEFAULT_FIELDS };
