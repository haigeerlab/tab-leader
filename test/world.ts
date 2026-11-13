/**
 * A fake browser shared by several tabs: one wall clock, one localStorage, one Web Locks manager.
 *
 * - localStorage writes dispatch `storage` events to the OTHER tabs only, like real browsers.
 * - Web Locks queue per name; the holder keeps the lock until its callback's promise settles.
 *   `{ steal: true }` takes the lock and rejects the previous holder's request with an AbortError.
 * - `freeze(tab)` pauses the tab's timers; storage events, lock callbacks and steal rejections are queued
 *   and delivered in order on `unfreeze` (real frozen pages run their tasks only after resuming).
 * - Closing a tab drops its held lock and queued lock requests; `crash` does so without `pagehide`.
 * - `jumpClock(ms)` changes the wall clock only; scheduled timers still fire after the real elapsed time.
 */
import type { TabLeaderEnv, TabLeaderLockManager } from '../src/types'

type Listener = (event: any) => void

export interface FakeTarget {
  addEventListener(type: string, fn: Listener): void
  removeEventListener(type: string, fn: Listener): void
  dispatch(type: string, event?: object): void
  listenerCount(): number
}

export interface Tab {
  id: number
  closed: boolean
  pending: Array<() => void>
  window: FakeTarget
  document: FakeTarget & { visibilityState: string }
  env: TabLeaderEnv
}

interface Timer {
  at: number
  fn: () => void
  owner: Tab
}

interface LockEntry {
  owner: Tab
  callback: (lock: unknown) => unknown
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  stolen: boolean
}

export interface WorldOptions {
  /** Provide navigator.locks. Default true. */
  locks?: boolean
  /** 'ok' (default), 'none' (localStorage getter throws) or 'broken' (every call throws). */
  storage?: 'ok' | 'none' | 'broken'
  /** Provide a global document. Default true. */
  document?: boolean
}

/** Let queued promise callbacks run (real macrotask; independent of the fake clock). */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export function createWorld(options: WorldOptions = {}) {
  const { locks = true, storage = 'ok', document = true } = options
  let now = 1_000_000_000_000
  let seq = 0
  let tabSeq = 0
  const timers = new Map<number, Timer>()
  const frozen = new Set<Tab>()
  const store = new Map<string, string>()
  const tabs: Tab[] = []
  const queues = new Map<string, { held: LockEntry | null; waiting: LockEntry[] }>()

  function runIn(tab: Tab, fn: () => void): void {
    if (tab.closed) return
    if (frozen.has(tab)) tab.pending.push(fn)
    else fn()
  }

  function createTarget(): FakeTarget {
    const listeners = new Map<string, Listener[]>()
    return {
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type)!.push(fn)
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type)
        if (!list) return
        const index = list.indexOf(fn)
        if (index >= 0) list.splice(index, 1)
      },
      dispatch(type, event = {}) {
        for (const fn of (listeners.get(type) || []).slice()) fn(event)
      },
      listenerCount() {
        let count = 0
        for (const list of listeners.values()) count += list.length
        return count
      },
    }
  }

  function lockQueue(name: string) {
    if (!queues.has(name)) queues.set(name, { held: null, waiting: [] })
    return queues.get(name)!
  }

  function release(name: string, entry: LockEntry): void {
    const queue = lockQueue(name)
    if (queue.held === entry) {
      queue.held = null
      pump(name)
    }
  }

  function pump(name: string): void {
    const queue = lockQueue(name)
    if (queue.held || queue.waiting.length === 0) return
    const entry = queue.waiting.shift()!
    queue.held = entry
    // The callback runs in the holder's own task queue: a frozen tab holds the lock without running it.
    void Promise.resolve().then(() =>
      runIn(entry.owner, () => {
        Promise.resolve()
          .then(() => entry.callback({ name }))
          .then(
            (value) => {
              if (entry.stolen) return
              release(name, entry)
              entry.resolve(value)
            },
            (error: unknown) => {
              if (entry.stolen) return
              release(name, entry)
              entry.reject(error)
            },
          )
      }),
    )
  }

  function createLockManager(owner: Tab): TabLeaderLockManager {
    return {
      request(name, opts, callback) {
        return new Promise((resolve, reject) => {
          const queue = lockQueue(name)
          const entry: LockEntry = { owner, callback, resolve, reject, stolen: false }
          if (opts && opts.steal) {
            const old = queue.held
            if (old) {
              old.stolen = true
              queue.held = null
              const abort = new Error('Lock broken by another request with the "steal" option.')
              abort.name = 'AbortError'
              runIn(old.owner, () => old.reject(abort))
            }
            queue.waiting.unshift(entry)
          } else {
            queue.waiting.push(entry)
          }
          pump(name)
        })
      },
    }
  }

  function createStorage(owner: Tab): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const broadcast = (key: string, oldValue: string | null, newValue: string | null) => {
      for (const tab of tabs) {
        if (tab !== owner) runIn(tab, () => tab.window.dispatch('storage', { key, oldValue, newValue }))
      }
    }
    const check = () => {
      if (world.storageBroken) throw new Error('storage broken')
    }
    return {
      getItem(key) {
        check()
        return store.has(key) ? store.get(key)! : null
      },
      setItem(key, value) {
        check()
        const oldValue = store.has(key) ? store.get(key)! : null
        store.set(key, String(value))
        broadcast(key, oldValue, String(value))
      },
      removeItem(key) {
        check()
        const oldValue = store.has(key) ? store.get(key)! : null
        store.delete(key)
        broadcast(key, oldValue, null)
      },
    }
  }

  function dropLocks(tab: Tab): void {
    for (const [name, queue] of queues) {
      queue.waiting = queue.waiting.filter((entry) => entry.owner !== tab)
      if (queue.held && queue.held.owner === tab) {
        queue.held.stolen = true
        queue.held = null
        pump(name)
      }
    }
  }

  const world = {
    storageBroken: storage === 'broken',
    /** Exceptions thrown by timer tasks (what a browser would report to the console). */
    errors: [] as unknown[],
    store,
    tabs,
    get now() {
      return now
    },

    /** Advance the fake clock, running due timers of non-frozen tabs in order. */
    async advance(ms: number): Promise<void> {
      const end = now + ms
      for (;;) {
        await flush()
        let next: { id: number; timer: Timer } | null = null
        for (const [id, timer] of timers) {
          if (frozen.has(timer.owner) || timer.owner.closed || timer.at > end) continue
          if (!next || timer.at < next.timer.at) next = { id, timer }
        }
        if (!next) break
        timers.delete(next.id)
        now = Math.max(now, next.timer.at)
        // Like a browser: an exception in a task is reported, later tasks still run.
        try {
          next.timer.fn()
        } catch (error) {
          world.errors.push(error)
        }
      }
      now = end
      await flush()
    },

    freeze(tab: Tab): void {
      frozen.add(tab)
    },

    unfreeze(tab: Tab): void {
      frozen.delete(tab)
      for (const fn of tab.pending.splice(0)) fn()
    },

    jumpClock(ms: number): void {
      now += ms
      for (const timer of timers.values()) timer.at += ms
    },

    openTab(): Tab {
      const tab = { id: ++tabSeq, closed: false, pending: [] } as unknown as Tab
      tab.window = createTarget()
      tab.document = Object.assign(createTarget(), { visibilityState: 'visible' })
      const localStorage = createStorage(tab)
      const env: TabLeaderEnv = {
        window: tab.window,
        document: document ? tab.document : null,
        navigator: locks ? { locks: createLockManager(tab) } : {},
        get localStorage() {
          if (storage === 'none') throw new Error('SecurityError: localStorage is disabled')
          return localStorage
        },
        now: () => now,
        setTimeout(fn, ms) {
          const id = ++seq
          timers.set(id, { at: now + Math.max(0, ms), fn, owner: tab })
          return id
        },
        clearTimeout(id) {
          timers.delete(id as number)
        },
      }
      tab.env = env
      tabs.push(tab)
      return tab
    },

    /** Close or reload: `pagehide` first, then the page and its locks are gone. */
    closeTab(tab: Tab): void {
      tab.window.dispatch('pagehide', { persisted: false })
      world.crash(tab)
    },

    /** The page disappears without `pagehide` (crash, killed process). */
    crash(tab: Tab): void {
      tab.closed = true
      dropLocks(tab)
    },

    /** Enter the back/forward cache. */
    hide(tab: Tab): void {
      tab.window.dispatch('pagehide', { persisted: true })
    },

    /** Restore from the back/forward cache. */
    show(tab: Tab): void {
      tab.window.dispatch('pageshow', { persisted: true })
    },

    /** Bring a tab to the foreground (visibilitychange + focus). */
    activate(tab: Tab): void {
      tab.document.visibilityState = 'visible'
      tab.document.dispatch('visibilitychange')
      tab.window.dispatch('focus')
    },

    lockHolder(name: string): Tab | null {
      const queue = queues.get(name)
      return queue && queue.held ? queue.held.owner : null
    },
  }
  return world
}

export type World = ReturnType<typeof createWorld>
