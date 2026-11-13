import { createCore } from './core'
import { isRecord, readJson, writeJson } from './env'
import type { TabInterval, TabIntervalOptions } from './types'

interface Last {
  at: number
  id: string
}

/** Run `options.run` at most once per `options.interval` across all tabs sharing `options.name`. */
export function createTabInterval(options: TabIntervalOptions): TabInterval {
  const { interval, run, key } = options
  const lastKey = options.name + ':last'
  let memory: Last | null = null
  let timer: unknown = null
  /** Bumped whenever leadership changes, so a stale timer cannot act. */
  let term = 0

  const core = createCore(options, {
    onLeader() {
      term++
      tick()
    },
    onFollower() {
      term++
      clear()
    },
    onActive: () => tick(),
  })

  function clear(): void {
    if (timer !== null && core.env) core.env.clearTimeout(timer)
    timer = null
  }

  function schedule(delay: number): void {
    clear()
    const myTerm = term
    timer = core.env!.setTimeout(() => {
      timer = null
      if (myTerm === term) tick()
    }, delay)
  }

  /** Shared record from storage; falls back to memory when storage fails or holds garbage (I5). */
  function readLast(): Last | null {
    const storage = core.storage
    if (!storage) return memory
    const read = readJson(storage, lastKey)
    if (!read.ok) return memory
    if (read.value === null) return null
    const v = read.value
    return isRecord(v) && typeof v.at === 'number' && typeof v.id === 'string'
      ? { at: v.at, id: v.id }
      : memory
  }

  function writeLast(value: Last): void {
    memory = value
    if (core.storage) writeJson(core.storage, lastKey, value)
  }

  function currentId(last: Last | null): string {
    if (!key) return ''
    try {
      return String(key())
    } catch {
      // Keep the previous identity: a throwing key() must not trigger a run (I1 step 2).
      return last ? last.id : memory ? memory.id : ''
    }
  }

  function fire(): void {
    try {
      Promise.resolve(run()).catch(() => {})
    } catch {
      // A synchronous throw does not affect later cycles (I4).
    }
  }

  function tick(): void {
    if (!core.isLeader || !core.verify()) return
    const last = readLast()
    const id = currentId(last)
    const now = core.env!.now()
    let lastAt = last ? last.at : now
    // Clock moved back: do not run; restart the interval from now (I1 step 4).
    const rolledBack = last !== null && now < last.at
    const due = last === null || last.id !== id || (!rolledBack && now - last.at >= interval)
    if (due) {
      writeLast({ at: now, id })
      lastAt = now
      fire()
    } else if (rolledBack) {
      writeLast({ at: now, id: last.id })
      lastAt = now
    }
    schedule(Math.max(0, lastAt + interval - now))
  }

  return {
    start: core.start,
    check: () => tick(),
    destroy() {
      term++
      clear()
      core.destroy()
    },
    get isLeader() {
      return core.isLeader
    },
    get mode() {
      return core.mode
    },
  }
}
