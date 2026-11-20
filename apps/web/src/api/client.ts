export type Row = { id: string; [key: string]: unknown };
export type List = { items: Row[]; total?: number; page?: number; pageSize?: number };
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiRequestError(
      response.status,
      data?.error?.message ?? 'Сервер временно недоступен',
    );
  return data as T;
}
export const send = <T>(path: string, body: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function value(row: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (item, key) =>
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined,
      row,
    );
}
export const text = (row: unknown, path: string) => String(value(row, path) ?? '—');
export const money = (n: unknown) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));
export const date = (n: unknown) =>
  n
    ? new Intl.DateTimeFormat('ru-KZ', { dateStyle: 'medium', timeZone: 'Asia/Almaty' }).format(
        new Date(String(n)),
      )
    : '—';
