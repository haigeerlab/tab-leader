import type { Core, Driver } from './core'
import { isRecord, readJson, writeJson } from './env'

interface Alive {
  tab: string
  at: number
}

function asAlive(value: unknown): Alive | null {
  return isRecord(value) && typeof value.tab === 'string' && typeof value.at === 'number'
    ? { tab: value.tab, at: value.at }
    : null
}

/** Web Locks mode (R4–R8): hold the lock while leader; alive record + steal to take over a frozen leader. */
export function createLocksDriver(core: Core): Driver {
  const aliveKey = core.name + ':alive'
  let release: (() => void) | null = null
  /** Time of this tab's last alive write in the current term; null before the first write. */
  let lastWrite: number | null = null

  function request(steal: boolean): void {
    const myGen = core.gen
    core
      .locks!.request(core.name, steal ? { steal: true } : {}, () => {
        // Paused, destroyed or switched to stealing while queued: let the lock go at once (R4).
        if (myGen !== core.gen || core.state !== 'waiting') return undefined
        return new Promise<void>((resolve) => {
          release = resolve
          lastWrite = null
          core.becomeLeader()
          if (core.state === 'leader' && myGen === core.gen) {
            beat()
          }
        })
      })
      .then(
        () => {},
        () => {
          // Stolen (AbortError, R7) or dropped by the browser (R8): lose and compete again.
          if (myGen === core.gen) core.lose()
        },
      )
    if (!steal) watch()
  }

  /** Leader: write the alive record (R5), first checking it was not taken over. */
  function writeAlive(): boolean {
    const storage = core.storage
    if (!storage) return true
    if (lastWrite !== null) {
      const read = readJson(storage, aliveKey)
      const record = read.ok ? asAlive(read.value) : null
      if (record && record.tab !== core.tabId && record.at >= lastWrite) {
        core.lose()
        return false
      }
    }
    const at = core.env.now()
    if (writeJson(storage, aliveKey, { tab: core.tabId, at })) lastWrite = at
    return true
  }

  function beat(): void {
    if (!writeAlive()) return
    core.later(beat, core.settings.aliveInterval)
  }

  /** Follower: check periodically whether the leader stalled (R6). */
  function watch(): void {
    core.later(() => {
      if (core.state !== 'waiting') return
      if (!checkStall()) watch()
    }, core.settings.aliveInterval)
  }

  function checkStall(): boolean {
    const storage = core.storage
    if (!storage || core.state !== 'waiting') return false
    const read = readJson(storage, aliveKey)
    const record = read.ok ? asAlive(read.value) : null
    const now = core.env.now()
    // Missing, corrupt or future-dated records never count as a stall.
    if (!record || record.at > now || now - record.at <= core.settings.stallTimeout) return false
    // A new generation invalidates the queued normal request; when it is granted it returns at once.
    core.newGeneration()
    request(true)
    return true
  }

  return {
    join: () => request(false),
    leave() {
      if (release) {
        release()
        release = null
      }
    },
    verify: () => true,
    onActive() {
      if (core.state === 'leader') writeAlive()
      else checkStall()
    },
    onStorage: () => {},
    rejoinDelay: 0,
  }
}
