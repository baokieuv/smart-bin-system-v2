type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const MEMORY: Record<string, CacheEntry> = {};

const canUseStorage = () => typeof window !== 'undefined';

export const setCache = (key: string, value: unknown, ttlMs = 5 * 60 * 1000) => {
  const expiresAt = Date.now() + ttlMs;
  const entry: CacheEntry = { value, expiresAt };
  MEMORY[key] = entry;

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(`__cache__${key}`, JSON.stringify(entry));
    } catch {
      // ignore
    }
  }
};

export const getCache = <T = unknown>(key: string): T | null => {
  const mem = MEMORY[key];
  if (mem && mem.expiresAt > Date.now()) return mem.value as T;

  if (canUseStorage()) {
    try {
      const raw = window.localStorage.getItem(`__cache__${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry;
      if (parsed.expiresAt > Date.now()) {
        MEMORY[key] = parsed;
        return parsed.value as T;
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const clearCache = (key: string) => {
  delete MEMORY[key];
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(`__cache__${key}`);
    } catch {
      // ignore
    }
  }
};

export const memoizeAsync = async <T = unknown>(key: string, ttlMs: number, fetcher: () => Promise<T>) => {
  const hit = getCache<T>(key);
  if (hit !== null) return hit;

  const value = await fetcher();
  setCache(key, value, ttlMs);
  return value;
};
