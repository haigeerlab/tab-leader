/** Which mechanism to start from; unavailable mechanisms fall through to the next one. */
export type TabLeaderStrategy = 'auto' | 'lease' | 'solo'

/** The mechanism actually in use. `'none'` before `start()` and outside a browser. */
export type TabLeaderMode = 'locks' | 'lease' | 'solo' | 'none'

/** Minimal Web Locks surface the library relies on. */
export interface TabLeaderLockManager {
  request(name: string, options: { steal?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>
}

/** Browser globals used by the library. Injected in tests; defaults to the real globals. */
export interface TabLeaderEnv {
  window: {
    addEventListener(type: string, listener: (event: any) => void): void
    removeEventListener(type: string, listener: (event: any) => void): void
  }
  document?: {
    addEventListener(type: string, listener: (event: any) => void): void
    removeEventListener(type: string, listener: (event: any) => void): void
    readonly visibilityState?: string
  } | null
  navigator?: { locks?: TabLeaderLockManager | null } | null
  localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

export interface TabLeaderOptions {
  /** Tabs sharing a name elect one leader. Used verbatim as the lock name and storage key prefix. */
  name: string
  /** Called when this tab becomes the leader. */
  onLeader?: () => void
  /** Called when this tab stops being the leader. Always paired with a preceding `onLeader`. */
  onFollower?: () => void
  /** Mechanism to start from. Default `'auto'` (Web Locks, then lease, then solo). */
  strategy?: TabLeaderStrategy
  /** Lease time-to-live in ms. Default 150000. */
  leaseTtl?: number
  /** Lease renewal / follower check interval in ms. Default 60000. */
  leaseRenewInterval?: number
  /** Delay before reading a freshly written lease back, in ms. Default 50. */
  leaseConfirmDelay?: number
  /** Interval of the leader's alive record (Web Locks mode) and of follower stall checks, in ms. Default 60000. */
  aliveInterval?: number
  /** An alive record older than this means the leader stalled and may be taken over, in ms. Default 180000. */
  stallTimeout?: number
  /** For tests only. */
  env?: TabLeaderEnv
}

export interface TabLeader {
  /** Detect capabilities, register lifecycle listeners and join the election. Only the first call has effect. */
  start(): void
  /** Step down and rejoin the election. No effect when not the leader or in solo mode. */
  relinquish(): void
  /** Leave the election, remove all listeners, release the lock or own lease. Cannot be restarted. */
  destroy(): void
  /** Whether this tab is currently the leader. */
  readonly isLeader: boolean
  /** Mechanism in use. */
  readonly mode: TabLeaderMode
}

export interface TabIntervalOptions extends Omit<TabLeaderOptions, 'onLeader' | 'onFollower'> {
  /** Minimum time between two runs across all tabs and reloads, in ms. */
  interval: number
  /** The work. Return value is ignored; sync throws and rejections are swallowed and not retried. */
  run: () => unknown
  /** Optional context identity; a change triggers an immediate run. */
  key?: () => string
}

export interface TabInterval {
  start(): void
  /** Run now if this tab is the leader and the interval elapsed or the key changed. Never forces a run. */
  check(): void
  destroy(): void
  readonly isLeader: boolean
  readonly mode: TabLeaderMode
}
