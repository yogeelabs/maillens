import { useCallback, useSyncExternalStore } from "react";

export type AppSource = {
  id: string;
  type: string;
  path: string;
  total_emails: number;
  last_ingest_ts: number;
};

export type AppMeta = {
  first_run_complete: boolean;
  sources: AppSource[];
  active_source?: string;
};

const STORAGE_KEY = "maillens.appMeta.v1";
const defaultMeta: AppMeta = {
  first_run_complete: false,
  sources: [],
};

let hydrated = false;
let metaCache: AppMeta = Object.freeze(cloneMeta(defaultMeta)) as AppMeta;
const listeners = new Set<() => void>();

function cloneMeta(meta: AppMeta): AppMeta {
  return {
    ...meta,
    sources: meta.sources.map((s) => ({ ...s })),
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function loadFromLocalStorage(): AppMeta | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppMeta;
    return {
      first_run_complete: Boolean(parsed.first_run_complete),
      sources: Array.isArray(parsed.sources)
        ? parsed.sources
            .filter((s): s is AppSource => s && typeof s.id === "string")
            .map((s) => ({
              id: s.id,
              type: s.type,
              path: s.path,
              total_emails: Number(s.total_emails ?? 0),
              last_ingest_ts: Number(s.last_ingest_ts ?? 0),
            }))
        : [],
      active_source:
        typeof parsed.active_source === "string" ? parsed.active_source : undefined,
    };
  } catch (err) {
    console.warn("Failed to parse persisted app meta", err);
    return null;
  }
}

function persistToLocalStorage(meta: AppMeta) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn("Unable to persist app meta", err);
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  const stored = loadFromLocalStorage();
  if (stored) {
    metaCache = Object.freeze(cloneMeta(stored)) as AppMeta;
  }
}

export function loadAppMeta(): AppMeta {
  ensureHydrated();
  return cloneMeta(metaCache);
}

export function saveAppMeta(next: AppMeta): void {
  metaCache = Object.freeze(cloneMeta(next)) as AppMeta;
  persistToLocalStorage(metaCache);
  notify();
}

export function updateAppMeta(
  updater: (current: AppMeta) => AppMeta | void,
): void {
  const draft = cloneMeta(loadAppMeta());
  const result = updater(draft);
  saveAppMeta(result ?? draft);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  ensureHydrated();
  return metaCache;
}

export function useAppState() {
  const meta = useSyncExternalStore(subscribe, getSnapshot);

  const setMeta = useCallback((next: AppMeta | ((current: AppMeta) => AppMeta)) => {
    const resolved = typeof next === "function" ? (next as (c: AppMeta) => AppMeta)(loadAppMeta()) : next;
    saveAppMeta(resolved);
  }, []);

  return { meta, setMeta, saveMeta: saveAppMeta, loadMeta: loadAppMeta };
}
