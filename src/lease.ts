import type { Core, Driver } from './core'
import { isRecord, readJson, removeKey, writeJson } from './env'

type LeaseState = 'mine' | 'held' | 'free' | 'failed'

/** localStorage lease mode (R9–R11). Best effort: localStorage has no atomic compare-and-set. */
export function createLeaseDriver(core: Core): Driver {
  const leaseKey = core.name + ':lease'
  let competing = false
  let acquiring = false

  function leaseState(): LeaseState {
    const read = readJson(core.storage!, leaseKey)
    if (!read.ok) return 'failed'
    const lease = read.value
    const now = core.env.now()
    if (!isRecord(lease) || typeof lease.exp !== 'number' || lease.exp <= now) return 'free'
    return lease.tab === core.tabId && lease.gen === core.gen ? 'mine' : 'held'
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
    acquiring = true
    // Read back after a moment: when two tabs write at once, the last writer wins (R10).
    core.later(() => {
      acquiring = false
      if (core.state !== 'waiting') return
      const confirmed = leaseState()
      if (confirmed === 'failed') core.degrade()
      else if (confirmed === 'mine') core.becomeLeader()
    }, core.settings.leaseConfirmDelay)
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

  /** Leader still owns the lease? Otherwise lose leadership (or degrade if storage failed). */
  function verify(): boolean {
    const current = leaseState()
    if (current === 'mine') return true
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
    rejoinDelay: core.settings.leaseRenewInterval,
  }
}
