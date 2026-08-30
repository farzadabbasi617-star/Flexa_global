type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const globalForCache = globalThis as typeof globalThis & {
  __flexaServerCache?: Map<string, CacheEntry<unknown>>;
};

const cache = globalForCache.__flexaServerCache ?? new Map<string, CacheEntry<unknown>>();
if (process.env.NODE_ENV !== "production") globalForCache.__flexaServerCache = cache;

export async function ttlCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;

  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearTtlCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function publicCacheHeaders(seconds: number, staleWhileRevalidate = seconds * 4) {
  return {
    "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}
