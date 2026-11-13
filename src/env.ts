import type { TabLeaderEnv, TabLeaderLockManager } from './types'

export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Result of a storage read: `ok: false` means the storage itself failed (threw). */
export type ReadResult = { ok: true; value: unknown } | { ok: false }

/**
 * Build the environment from browser globals. Returns null outside a browser (SSR, Node).
 * Only called from `start()`, never at module load.
 */
export function browserEnv(): TabLeaderEnv | null {
  if (typeof window === 'undefined') return null
  const win = window
  return {
    window: win,
    document: typeof document === 'undefined' ? null : document,
    navigator: typeof navigator === 'undefined' ? null : navigator,
    // A getter: reading window.localStorage itself can throw (privacy settings, some WebViews).
    get localStorage() {
      return win.localStorage
    },
    now: () => Date.now(),
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id as number),
  }
}

/** The lock manager, or null when Web Locks are unavailable. */
export function lockManager(env: TabLeaderEnv): TabLeaderLockManager | null {
  try {
    const nav = env.navigator
    return nav && nav.locks && typeof nav.locks.request === 'function' ? nav.locks : null
  } catch {
    return null
  }
}

/** localStorage if it can be written, read back and removed (R1); otherwise null. */
export function usableStorage(env: TabLeaderEnv, probeKey: string): Store | null {
  let storage: Store | null | undefined
  try {
    storage = env.localStorage
  } catch {
    return null
  }
  if (!storage) return null
  try {
    storage.setItem(probeKey, '1')
    const ok = storage.getItem(probeKey) === '1'
    storage.removeItem(probeKey)
    return ok ? storage : null
  } catch {
    return null
  }
}

/** Read and parse JSON. Corrupt content reads as `null`; only a throwing storage reports failure. */
export function readJson(storage: Store, key: string): ReadResult {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { ok: false }
  }
  if (raw === null) return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: true, value: null }
  }
}

export function writeJson(storage: Store, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(storage: Store, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** Unique enough per tab without `crypto` (R16). */
export function createTabId(now: number): string {
  return now.toString(36) + Math.random().toString(36).slice(2)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
