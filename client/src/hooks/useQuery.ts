import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";

/**
 * Minimal data fetching with a shared in-memory cache:
 * - screens render instantly from cache when navigating back, then refresh in the background;
 * - `invalidate(prefix)` after a mutation refetches every mounted query under that path.
 */

interface Entry {
  data?: unknown;
  error?: unknown;
  promise?: Promise<void>;
  version: number;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let clock = 0;

const notify = () => {
  clock++;
  listeners.forEach((l) => l());
};

function load(path: string): Promise<void> {
  const entry = cache.get(path) ?? { version: 0 };
  if (entry.promise) return entry.promise;
  const promise = api<unknown>(path)
    .then((data) => {
      cache.set(path, { data, version: entry.version + 1 });
    })
    .catch((error: unknown) => {
      cache.set(path, { data: entry.data, error, version: entry.version + 1 });
    })
    .finally(notify);
  cache.set(path, { ...entry, promise });
  return promise;
}

/** Refetch all cached queries whose path starts with one of the prefixes. */
export function invalidate(...prefixes: string[]): Promise<void[]> {
  const jobs: Promise<void>[] = [];
  for (const key of cache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      const entry = cache.get(key)!;
      cache.set(key, { data: entry.data, version: entry.version });
      jobs.push(load(key));
    }
  }
  return Promise.all(jobs);
}

/** Drop everything (sign-out). */
export function clearQueryCache() {
  cache.clear();
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useQuery<T>(path: string | null) {
  useSyncExternalStore(subscribe, () => clock);
  const [, force] = useState(0);

  useEffect(() => {
    if (!path) return;
    void load(path).then(() => force((n) => n + 1));
  }, [path]);

  const entry = path ? cache.get(path) : undefined;
  const reload = useCallback(() => (path ? invalidate(path) : Promise.resolve([])), [path]);

  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!path && !entry?.data && !entry?.error,
    refreshing: !!entry?.promise,
    reload,
  };
}
