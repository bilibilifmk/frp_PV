/** 通用 API 请求工具 */

const headers = { 'Content-Type': 'application/json' };

export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export function apiGet<T = unknown>(url: string): Promise<T> {
  return apiFetch<T>(url);
}
