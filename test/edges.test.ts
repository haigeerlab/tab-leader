import { afterEach, describe, expect, test, vi } from 'vitest'
import { browserEnv } from '../src/env'
import { createTabInterval } from '../src/interval'
import { createTabLeader } from '../src/leader'
import { join } from './helpers'
import { createLog, openTask } from './interval-helpers'
import { createWorld, type Tab } from './world'

/** Storage whose writes fail after `n` successful setItem calls (reads keep working). */
function failWritesAfter(tab: Tab, n: number): Tab {
  const real = tab.env.localStorage!
  let writes = 0
  const storage = {
    getItem: (k: string) => real.getItem(k),
    removeItem: (k: string) => real.removeItem(k),
    setItem(k: string, v: string) {
      if (++writes > n) throw new Error('quota')
      real.setItem(k, v)
    },
  }
  return Object.assign(tab, { env: { ...tab.env, localStorage: storage } })
}

describe('edge cases', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('browserEnv reads the real globals lazily', () => {
    const calls: number[] = []
    const win = {
      addEventListener() {},
      removeEventListener() {},
      setTimeout: (fn: () => void, ms: number) => (calls.push(ms), 1),
      clearTimeout: (id: number) => calls.push(-id),
      get localStorage(): never {
        throw new Error('denied')
      },
    }
    vi.stubGlobal('window', win)
    const env = browserEnv()!
    expect(env.document).toBeNull()
    expect(env.navigator).toBe(globalThis.navigator ?? null)
    expect(() => env.localStorage).toThrow()
    env.setTimeout(() => {}, 5)
    env.clearTimeout(1)
    expect(calls).toEqual([5, -1])
    expect(typeof env.now()).toBe('number')
    vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {} })
    vi.stubGlobal('navigator', undefined)
    const env2 = browserEnv()!
    expect(env2.document).not.toBeNull()
    expect(env2.navigator).toBeNull()
  })

  test('a hidden visibilitychange does not count as coming to the foreground', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    world.freeze(b.tab)
    await world.advance(5 * 60_000)
    world.unfreeze(b.tab)
    b.tab.document.visibilityState = 'hidden'
    b.tab.document.dispatch('visibilitychange')
    expect(b.leader.isLeader).toBe(false)
  })

  test('works without a document', async () => {
    const world = createWorld({ document: false })
    const a = join(world)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(true)
    a.leader.destroy()
    expect(a.tab.window.listenerCount()).toBe(0)
  })

  test('callbacks are optional', async () => {
    const world = createWorld()
    const tab = world.openTab()
    const leader = createTabLeader({ name: 'app', env: tab.env })
    leader.start()
    await world.advance(10)
    expect(leader.isLeader).toBe(true)
    leader.destroy()
  })

  test('events while suspended are ignored; destroy while suspended is clean', async () => {
    const world = createWorld()
    const a = join(world)
    await world.advance(10)
    world.hide(a.tab)
    world.hide(a.tab)
    world.activate(a.tab)
    expect(a.leader.isLeader).toBe(false)
    a.leader.destroy()
    expect(a.events).toEqual(['L', 'F'])
  })

  test('destroy inside onLeader stops before the alive record is written', async () => {
    const world = createWorld()
    const tab = world.openTab()
    const leader = createTabLeader({ name: 'app', env: tab.env, onLeader: () => leader.destroy() })
    leader.start()
    await world.advance(10)
    expect(leader.isLeader).toBe(false)
    expect(world.store.has('app:alive')).toBe(false)
  })

  test('stall check survives a throwing storage', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.storageBroken = true
    await world.advance(10 * 60_000)
    expect(a.leader.isLeader).toBe(true)
    expect(b.leader.isLeader).toBe(false)
  })

  test('lease: writing the lease fails while reading works -> degrade to solo', async () => {
    const world = createWorld({ locks: false })
    const a = join(world, {}, failWritesAfter(world.openTab(), 1)) // the probe write succeeds
    await world.advance(10)
    expect(a.leader.mode).toBe('solo')
    expect(a.leader.isLeader).toBe(true)
  })

  test('lease: renewal write fails -> degrade to solo', async () => {
    const world = createWorld({ locks: false })
    const a = join(world, {}, failWritesAfter(world.openTab(), 2)) // probe + first lease
    await world.advance(10)
    expect(a.leader.mode).toBe('lease')
    await world.advance(60_000)
    expect(a.leader.mode).toBe('solo')
    expect(a.events).toEqual(['L', 'F', 'L'])
  })

  test('lease: storage fails inside the confirm window -> degrade', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    world.storageBroken = true
    await world.advance(100)
    expect(a.leader.mode).toBe('solo')
  })

  test('lease: another tab overwrites inside the confirm window -> not elected; repeated events are ignored', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    const other = world.openTab()
    other.env.localStorage!.setItem(
      'app:lease',
      JSON.stringify({ tab: 'other', gen: 0, exp: world.now + 60_000 }),
    )
    await world.advance(100)
    expect(a.leader.isLeader).toBe(false)
  })

  test('lease: pagehide inside the confirm window drops the pending confirmation', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    world.hide(a.tab)
    await world.advance(100)
    expect(a.leader.isLeader).toBe(false)
    expect(a.events).toEqual([])
  })

  test('interval: a throwing key with no previous record runs once with an empty identity', async () => {
    const world = createWorld()
    const log = createLog()
    openTask(world, log, {
      key: () => {
        throw new Error('x')
      },
    })
    await world.advance(10)
    expect(log.runs.map((r) => r.identity)).toEqual(['guest'])
    expect(JSON.parse(world.store.get('app:last')!)).toMatchObject({ id: '' })
  })

  test('interval: check() on a follower does nothing', async () => {
    const world = createWorld()
    let runs = 0
    const make = () => {
      const tab = world.openTab()
      const t = createTabInterval({ name: 'app', interval: 1000, env: tab.env, run: () => runs++ })
      t.start()
      return t
    }
    make()
    const b = make()
    await world.advance(10)
    b.check()
    expect(runs).toBe(1)
  })
})

describe('cases that need the generation check and the pre-run lease check', () => {
  test('a lock request left over from before a bfcache round-trip does not jump the queue (R4, R14)', async () => {
    const world = createWorld()
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(10)
    // b's first request stays queued ahead of c; after the round-trip b queues a second one at the end.
    world.hide(b.tab)
    world.show(b.tab)
    a.leader.relinquish()
    await world.advance(10)
    expect(c.leader.isLeader).toBe(true)
    expect(b.leader.isLeader).toBe(false)
  })

  test('lease mode: a leader that missed the storage event re-reads the lease before running (I1 step 1)', async () => {
    const world = createWorld({ locks: false })
    const log = createLog()
    const a = openTask(world, log)
    openTask(world, log)
    await world.advance(1000)
    world.freeze(a.tab)
    await world.advance(4 * 60_000) // a's lease expired; the other tab took over
    a.tab.pending.length = 0 // a missed the storage events
    world.unfreeze(a.tab)
    a.identity = 'u:1' // would make a run immediately if it still believed it leads
    a.task.check()
    expect(log.runs.filter((r) => r.tab === a.tab.id && r.identity === 'u:1')).toEqual([])
    expect(a.task.isLeader).toBe(false)
  })
})
