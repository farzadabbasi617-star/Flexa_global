// Simple in-memory cache for AI responses
type CacheEntry = {
  value: any;
  expiry: number;
};

const cache = new Map<string, CacheEntry>();

export const aiCache = {
  get: (key: string) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  },
  set: (key: string, value: any, ttlSeconds: number = 3600) => {
    cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  },
  delete: (key: string) => {
    cache.delete(key);
  },
};
