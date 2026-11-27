import type { Core, Driver } from './core'
import { isRecord, readJson, removeKey, writeJson } from './env'

/** 'stale': still this tab's lease (same tab and generation, nobody overwrote it) but past `exp`. */
type LeaseState = 'mine' | 'stale' | 'held' | 'free' | 'failed'

/** localStorage lease mode (R9–R11). Best effort: localStorage has no atomic compare-and-set. */
export function createLeaseDriver(core: Core): Driver {
  const leaseKey = core.name + ':lease'
  let competing = false
  let acquiring = false

  function leaseState(): LeaseState {
    const read = readJson(core.storage!, leaseKey)
    if (!read.ok) return 'failed'
    const lease = read.value
    if (!isRecord(lease) || typeof lease.exp !== 'number') return 'free'
    const own = lease.tab === core.tabId && lease.gen === core.gen
    if (lease.exp <= core.env.now()) return own ? 'stale' : 'free'
    return own ? 'mine' : 'held'
  }

  function writeLease(): boolean {
    return writeJson(core.storage!, leaseKey, {
      tab: core.tabId,
      gen: core.gen,
      exp: core.env.now() + core.settings.leaseTtl,
    })
  }

  function tryAcquire(): void {
    if (!competing || acquiring || core.state !== 'waiting') return
    const current = leaseState()
    if (current === 'failed') return core.degrade()
    if (current === 'held') return
    if (!writeLease()) return core.degrade()
    confirmLater()
  }

  /**
   * Read back after a moment: when two tabs write at once, the last writer wins (R10).
   * Background throttling can delay the read-back past `exp`; if the lease is still ours, nobody overwrote
   * it, so we won: renew it, then lead.
   */
  function confirmLater(): void {
    acquiring = true
    core.later(() => {
      acquiring = false
      if (core.state !== 'waiting') return
      const confirmed = leaseState()
      if (confirmed === 'failed') core.degrade()
      else if (confirmed === 'stale' && !writeLease()) core.degrade()
      else if (confirmed === 'mine' || confirmed === 'stale') core.becomeLeader()
    }, core.settings.leaseConfirmDelay)
  }

  /** R17: overwrite the lease whoever holds it, confirm, and keep competing as usual if that fails. */
  function takeOver(): void {
    // Drops pending renewal, confirmation and rejoin timers; the loop is restarted below.
    core.newGeneration()
    competing = true
    acquiring = false
    if (!writeLease()) return core.degrade()
    confirmLater()
    loop()
  }

  /** Leader: renew after checking ownership. Follower: try to acquire. (R10, R11) */
  function loop(): void {
    core.later(() => {
      if (core.state === 'leader') {
        if (!verify()) return
        if (!writeLease()) return core.degrade()
      } else {
        tryAcquire()
      }
      loop()
    }, core.settings.leaseRenewInterval)
  }

  /**
   * Leader still owns the lease? Otherwise lose leadership (or degrade if storage failed).
   * A lease that expired while throttled timers kept us from renewing is still ours if nobody overwrote it:
   * renew it at once instead of stepping down (R11).
   */
  function verify(): boolean {
    const current = leaseState()
    if (current === 'mine') return true
    if (current === 'stale') {
      if (writeLease()) return true
      core.degrade()
      return false
    }
    if (current === 'failed') core.degrade()
    else core.lose()
    return false
  }

  return {
    join() {
      competing = true
      acquiring = false
      tryAcquire()
      loop()
    },
    leave() {
      competing = false
      acquiring = false
      // Called after the generation changed, so match on the tab only: any lease of this tab is ours to drop.
      const read = readJson(core.storage!, leaseKey)
      if (read.ok && isRecord(read.value) && read.value.tab === core.tabId) removeKey(core.storage!, leaseKey)
    },
    verify,
    onActive() {
      if (core.state === 'leader') verify()
      else tryAcquire()
    },
    onStorage(key) {
      if (key !== leaseKey || !competing) return
      if (core.state === 'leader') verify()
      else tryAcquire()
    },
    takeOver,
    rejoinDelay: core.settings.leaseRenewInterval,
  }
}
