import { browserEnv, createTabId, lockManager, usableStorage, type Store } from './env'
import { createLeaseDriver } from './lease'
import { createLocksDriver } from './locks'
import type { TabLeaderEnv, TabLeaderLockManager, TabLeaderMode, TabLeaderOptions } from './types'

export type State = 'idle' | 'waiting' | 'leader' | 'suspended' | 'destroyed'

/** One election mechanism. All callbacks it schedules go through `core.later`, so they are generation-guarded. */
export interface Driver {
  /** Start competing. `core.state` is already 'waiting'. */
  join(): void
  /** Give up the lock or own lease, if any. Must not notify. */
  leave(): void
  /** Re-check ownership right before acting (lease re-reads storage). False means leadership was lost. */
  verify(): boolean
  /** Page came to the foreground. */
  onActive(): void
  onStorage(key: string): void
  /** How long to wait before competing again after `relinquish()`. */
  rejoinDelay: number
}

export interface Settings {
  leaseTtl: number
  leaseRenewInterval: number
  leaseConfirmDelay: number
  aliveInterval: number
  stallTimeout: number
}

/** What drivers may use. */
export interface Core {
  readonly name: string
  readonly env: TabLeaderEnv
  readonly tabId: string
  readonly settings: Settings
  readonly storage: Store | null
  readonly locks: TabLeaderLockManager | null
  readonly gen: number
  readonly state: State
  /** generation-guarded setTimeout: the callback is dropped if the generation changed meanwhile. */
  later(fn: () => void, ms: number): void
  /** Invalidate all pending callbacks without changing state or notifying. */
  newGeneration(): void
  becomeLeader(): void
  /** Leadership was taken away: notify, then compete again. */
  lose(): void
  /** The current mechanism is unusable: Web Locks falls back to lease (or solo without storage), lease to solo. */
  degrade(): void
}

export interface Hooks {
  onLeader?: () => void
  onFollower?: () => void
  /** Called after the core handled a foreground event. */
  onActive?: () => void
}

export interface CoreHandle {
  start: () => void
  relinquish: () => void
  destroy: () => void
  readonly isLeader: boolean
  readonly mode: TabLeaderMode
  /** Ownership check right before doing leader work (I1 step 1). */
  verify: () => boolean
  /** Storage usable for shared records, once started. */
  readonly storage: Store | null
  readonly env: TabLeaderEnv | null
}

const DEFAULTS: Settings = {
  leaseTtl: 150_000,
  leaseRenewInterval: 60_000,
  leaseConfirmDelay: 50,
  aliveInterval: 60_000,
  stallTimeout: 180_000,
}

function soloDriver(core: Core): Driver {
  return {
    join: () => core.becomeLeader(),
    leave: () => {},
    verify: () => true,
    onActive: () => {},
    onStorage: () => {},
    rejoinDelay: 0,
  }
}

export function createCore(options: TabLeaderOptions, hooks: Hooks): CoreHandle {
  const name = options.name
  const strategy = options.strategy || 'auto'
  const settings: Settings = {
    leaseTtl: options.leaseTtl ?? DEFAULTS.leaseTtl,
    leaseRenewInterval: options.leaseRenewInterval ?? DEFAULTS.leaseRenewInterval,
    leaseConfirmDelay: options.leaseConfirmDelay ?? DEFAULTS.leaseConfirmDelay,
    aliveInterval: options.aliveInterval ?? DEFAULTS.aliveInterval,
    stallTimeout: options.stallTimeout ?? DEFAULTS.stallTimeout,
  }

  let env: TabLeaderEnv | null = null
  let started = false
  let state: State = 'idle'
  let mode: TabLeaderMode = 'none'
  let gen = 0
  let notifiedLeader = false
  let storage: Store | null = null
  let locks: TabLeaderLockManager | null = null
  let tabId = ''
  let driver: Driver | null = null
  let timers: unknown[] = []
  type Listener = (event: unknown) => void
  const listeners: Array<{ target: 'window' | 'document'; type: string; fn: Listener }> = []

  function clearTimers(): void {
    const e = env!
    for (const id of timers) e.clearTimeout(id)
    timers = []
  }

  /** Invalidate every pending callback of the current generation. */
  function bump(): void {
    gen++
    clearTimers()
  }

  function call(fn: (() => void) | undefined): void {
    if (!fn) return
    try {
      fn()
    } catch (error) {
      // Report like an uncaught error, without breaking the state machine (R15).
      env!.setTimeout(() => {
        throw error
      }, 0)
    }
  }

  function notify(leader: boolean): void {
    if (notifiedLeader === leader) return
    notifiedLeader = leader
    call(leader ? hooks.onLeader : hooks.onFollower)
  }

  const core: Core = {
    name,
    get env() {
      return env!
    },
    get tabId() {
      return tabId
    },
    settings,
    get storage() {
      return storage
    },
    get locks() {
      return locks
    },
    get gen() {
      return gen
    },
    get state() {
      return state
    },
    later(fn, ms) {
      const myGen = gen
      const id = env!.setTimeout(() => {
        timers = timers.filter((t) => t !== id)
        if (myGen === gen) fn()
      }, ms)
      timers.push(id)
    },
    newGeneration() {
      bump()
    },
    becomeLeader() {
      if (state !== 'waiting') return
      state = 'leader'
      notify(true)
    },
    lose() {
      if (state !== 'leader' && state !== 'waiting') return
      bump()
      notify(false)
      driver!.leave()
      join()
    },
    degrade() {
      if (mode === 'solo' || state === 'destroyed' || state === 'suspended') return
      bump()
      notify(false)
      if (mode === 'locks' && storage) {
        mode = 'lease'
        driver = createLeaseDriver(core)
      } else {
        mode = 'solo'
        driver = soloDriver(core)
      }
      join()
    },
  }

  function join(): void {
    state = 'waiting'
    driver!.join()
  }

  function listen(target: 'window' | 'document', type: string, fn: Listener): void {
    const t = target === 'window' ? env!.window : env!.document
    if (!t) return
    t.addEventListener(type, fn)
    listeners.push({ target, type, fn })
  }

  function suspend(): void {
    if (state !== 'waiting' && state !== 'leader') return
    bump()
    notify(false)
    driver!.leave()
    state = 'suspended'
  }

  function onActive(): void {
    if (state === 'waiting' || state === 'leader') driver!.onActive()
    if (hooks.onActive) hooks.onActive()
  }

  function start(): void {
    if (started) return
    started = true
    env = options.env || browserEnv()
    if (!env) return // not a browser (R3): stay inert
    tabId = createTabId(env.now())
    locks = strategy === 'auto' ? lockManager(env) : null
    storage = strategy === 'solo' ? null : usableStorage(env, name + ':probe')
    if (locks) {
      mode = 'locks'
      driver = createLocksDriver(core)
    } else if (storage) {
      mode = 'lease'
      driver = createLeaseDriver(core)
    } else {
      mode = 'solo'
      driver = soloDriver(core)
    }

    listen('window', 'pagehide', suspend)
    listen('window', 'pageshow', (event) => {
      if ((event as { persisted?: boolean } | undefined)?.persisted && state === 'suspended') {
        join()
        onActive()
      }
    })
    listen('window', 'focus', onActive)
    listen('document', 'visibilitychange', () => {
      const doc = env!.document
      if (doc && doc.visibilityState === 'visible') onActive()
    })
    listen('window', 'storage', (event) => {
      const key = (event as { key?: unknown } | undefined)?.key
      if (typeof key === 'string' && (state === 'waiting' || state === 'leader')) {
        driver!.onStorage(key)
      }
    })
    join()
  }

  function relinquish(): void {
    if (state !== 'leader' || mode === 'solo') return
    bump()
    notify(false)
    driver!.leave()
    state = 'waiting'
    const delay = driver!.rejoinDelay
    if (delay > 0) core.later(() => join(), delay)
    else join()
  }

  function destroy(): void {
    if (state === 'destroyed') return
    started = true
    if (env) {
      bump()
      notify(false)
      if (driver && (state === 'waiting' || state === 'leader')) driver.leave()
      for (const l of listeners.splice(0)) {
        const t = l.target === 'window' ? env.window : env.document
        if (t) t.removeEventListener(l.type, l.fn)
      }
    }
    state = 'destroyed'
  }

  return {
    start,
    relinquish,
    destroy,
    get isLeader() {
      return state === 'leader'
    },
    get mode() {
      return mode
    },
    verify() {
      if (state !== 'leader') return false
      return driver!.verify() && state === 'leader'
    },
    get storage() {
      return storage
    },
    get env() {
      return env
    },
  }
}
