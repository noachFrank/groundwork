export async function api<T = any>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options?.method ?? (options?.body !== undefined ? 'POST' : 'GET'),
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status}). Is the Groundwork window still open?`);
  return data as T;
}
