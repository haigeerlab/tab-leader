import { describe, expect, test } from 'vitest'
import { createTabLeader } from '../src/leader'
import type { TabLeaderLockManager } from '../src/types'
import { alternates, join, leaders } from './helpers'
import { createWorld, type World } from './world'

const MIN = 60_000

/** Everything a no-op call must leave untouched (R17 step 1). */
function snapshot(world: World, members: Array<{ events: string[]; leader: { isLeader: boolean } }>) {
  return JSON.stringify({
    lockRequests: world.lockRequests,
    store: [...world.store.entries()],
    members: members.map((m) => [m.leader.isLeader, m.events.join('')]),
  })
}

describe('requestLeadership: Web Locks mode (R17 step 2)', () => {
  test('a follower takes over; the old leader gets onFollower and queues again', async () => {
    const world = createWorld()
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(10)
    expect(a.leader.isLeader).toBe(true)
    const aliveOfA = (JSON.parse(world.store.get('app:alive')!) as { tab: string }).tab
    c.leader.requestLeadership()
    expect(c.leader.isLeader).toBe(false) // asynchronous (R17 step 4)
    await world.advance(10)
    expect(leaders([a, b, c])).toEqual([c])
    expect(world.lockHolder('app')).toBe(c.tab)
    expect(c.events).toEqual(['L'])
    expect(a.events).toEqual(['L', 'F'])
    expect(b.events).toEqual([])
    // The new leader wrote its alive record at once (R5).
    expect((JSON.parse(world.store.get('app:alive')!) as { tab: string }).tab).not.toBe(aliveOfA)
    // The old leader queued again: when the new one closes, someone takes over.
    world.closeTab(c.tab)
    await world.advance(10)
    expect(leaders([a, b])).toHaveLength(1)
    for (const m of [a, b, c]) expect(alternates(m.events)).toBe(true)
  })

  test('only one leader for a long time after a takeover', async () => {
    const world = createWorld()
    const members = [join(world), join(world), join(world)]
    await world.advance(10)
    members[2]!.leader.requestLeadership()
    for (let i = 0; i < 10; i++) {
      await world.advance(MIN)
      expect(leaders(members)).toEqual([members[2]])
    }
  })

  test('old leader frozen: the caller leads at once; the old one steps down after resuming', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    b.leader.requestLeadership()
    await world.advance(10)
    expect(b.leader.isLeader).toBe(true)
    expect(a.leader.isLeader).toBe(true) // the known short window: a has not run yet
    world.unfreeze(a.tab)
    await world.advance(10)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('AbortError arrives late: the old leader yields on its next alive write (R5)', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    b.leader.requestLeadership()
    await world.advance(10)
    a.tab.pending.length = 0 // drop the queued AbortError to isolate the alive-record check
    world.unfreeze(a.tab)
    await world.advance(MIN)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('without localStorage the takeover still works and the old leader yields (R7)', async () => {
    const world = createWorld({ storage: 'none' })
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    expect(a.leader.mode).toBe('locks')
    b.leader.requestLeadership()
    await world.advance(10)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('the stale queued request of the caller does not create a second leader later', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    b.leader.requestLeadership()
    await world.advance(10)
    // b steps down: its old (invalidated) queued request must not make it leader again by itself.
    b.leader.relinquish()
    await world.advance(10)
    expect(leaders([a, b])).toHaveLength(1)
    await world.advance(5 * MIN)
    expect(leaders([a, b])).toHaveLength(1)
    for (const m of [a, b]) expect(alternates(m.events)).toBe(true)
  })

  test('steal request rejected before being granted: degrade, no retry (R8a)', async () => {
    const world = createWorld()
    const a = join(world)
    await world.advance(10)
    const tab = world.openTab()
    const real = tab.env.navigator!.locks!
    let steals = 0
    const locks: TabLeaderLockManager = {
      request(name, options, callback) {
        if (!options.steal) return real.request(name, options, callback)
        steals++
        const error = new Error('denied')
        error.name = 'SecurityError'
        return Promise.reject(error)
      },
    }
    tab.env = { ...tab.env, navigator: { locks } }
    const b = join(world, {}, tab)
    await world.advance(10)
    b.leader.requestLeadership()
    await world.advance(MIN)
    expect(steals).toBe(1)
    expect(b.leader.mode).toBe('lease')
    expect(a.leader.isLeader).toBe(true)
  })
})

describe('requestLeadership: lease mode (R17 step 3)', () => {
  const SEC = 1000
  const leaseOwner = (world: World) =>
    (JSON.parse(world.store.get('app:lease') ?? 'null') as { tab?: string } | null)?.tab

  test('a follower overwrites the lease and leads after the confirmation; the old leader yields', async () => {
    const world = createWorld({ locks: false })
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(SEC)
    expect(a.leader.isLeader).toBe(true)
    const leaseOfA = leaseOwner(world)
    c.leader.requestLeadership()
    await world.advance(49)
    expect(c.leader.isLeader).toBe(false) // not before leaseConfirmDelay
    await world.advance(1)
    expect(leaders([a, b, c])).toEqual([c])
    expect(leaseOwner(world)).not.toBe(leaseOfA)
    expect(a.events).toEqual(['L', 'F'])
    expect(c.events).toEqual(['L'])
  })

  test('the new leader keeps renewing; the old one neither deletes the lease nor takes it back', async () => {
    const world = createWorld({ locks: false })
    const members = [join(world), join(world), join(world)]
    await world.advance(SEC)
    members[2]!.leader.requestLeadership()
    await world.advance(SEC)
    const leaseOfC = leaseOwner(world)
    for (let i = 0; i < 10; i++) {
      await world.advance(MIN)
      expect(leaders(members)).toEqual([members[2]])
      expect(leaseOwner(world)).toBe(leaseOfC)
    }
  })

  test('old leader misses the storage event: it yields on its next renewal check', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.freeze(a.tab)
    b.leader.requestLeadership()
    await world.advance(SEC)
    expect(b.leader.isLeader).toBe(true)
    a.tab.pending.length = 0 // drop the queued storage events
    world.unfreeze(a.tab)
    expect(a.leader.isLeader).toBe(true) // the known short window
    await world.advance(MIN)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('overwritten by another tab before the confirmation: stays a follower and does not retry', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    b.leader.requestLeadership()
    const other = JSON.stringify({ tab: 'other', gen: 1, exp: world.now + 10 * MIN })
    world.openTab().env.localStorage!.setItem('app:lease', other)
    await world.advance(30 * SEC)
    expect(b.leader.isLeader).toBe(false)
    expect(b.events).toEqual([])
    expect(world.store.get('app:lease')).toBe(other)
    expect(a.leader.isLeader).toBe(false) // the lease is not a's either
  })

  test('writing the lease throws: degrade to solo', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.storageBroken = true
    b.leader.requestLeadership()
    await world.advance(SEC)
    expect(b.leader.mode).toBe('solo')
    expect(b.leader.isLeader).toBe(true)
    expect(a.leader.mode).toBe('lease')
  })
})

const MODES = [
  { mode: 'locks', worldOptions: {} },
  { mode: 'lease', worldOptions: { locks: false } },
] as const

describe.each(MODES)(
  'requestLeadership: common rules in $mode mode (R17 steps 1, 5, 6)',
  ({ worldOptions }) => {
    // Long enough for a lock grant (microtasks) and for the lease confirmation (leaseConfirmDelay 50 ms).
    const STEP = 1000

    test('no effect when already the leader', async () => {
      const world = createWorld(worldOptions)
      const [a, b] = [join(world), join(world)]
      await world.advance(STEP)
      const before = snapshot(world, [a, b])
      a.leader.requestLeadership()
      await world.advance(MIN / 2)
      expect(snapshot(world, [a, b])).toBe(before)
    })

    test('no effect in solo mode', async () => {
      const world = createWorld({ locks: false, storage: 'none' })
      const a = join(world)
      await world.advance(STEP)
      expect(a.leader.mode).toBe('solo')
      a.leader.requestLeadership()
      await world.advance(STEP)
      expect(a.events).toEqual(['L'])
    })

    test('no effect before start() and outside a browser', async () => {
      const world = createWorld(worldOptions)
      const tab = world.openTab()
      const idle = createTabLeader({ name: 'app', env: tab.env })
      idle.requestLeadership()
      await world.advance(STEP)
      expect(idle.mode).toBe('none')
      expect(world.lockRequests).toBe(0)
      expect(world.store.size).toBe(0)

      const server = createTabLeader({ name: 'app' })
      server.start()
      expect(() => server.requestLeadership()).not.toThrow()
      expect(server.mode).toBe('none')
    })

    test('no effect while suspended (pagehide) or after destroy()', async () => {
      const world = createWorld(worldOptions)
      const [a, b, c] = [join(world), join(world), join(world)]
      await world.advance(STEP)
      world.hide(b.tab)
      c.leader.destroy()
      await world.advance(STEP)
      const before = snapshot(world, [a, b, c])
      b.leader.requestLeadership()
      c.leader.requestLeadership()
      await world.advance(MIN / 2)
      expect(snapshot(world, [a, b, c])).toBe(before)
    })

    test('repeated calls: elected once, onLeader called once', async () => {
      const world = createWorld(worldOptions)
      const [a, b] = [join(world), join(world)]
      await world.advance(STEP)
      b.leader.requestLeadership()
      b.leader.requestLeadership()
      await world.advance(STEP)
      b.leader.requestLeadership()
      await world.advance(MIN)
      expect(leaders([a, b])).toEqual([b])
      expect(b.events).toEqual(['L'])
      expect(a.events).toEqual(['L', 'F'])
    })

    test('two tabs one after another: the last caller leads, callbacks stay paired', async () => {
      const world = createWorld(worldOptions)
      const [a, b, c] = [join(world), join(world), join(world)]
      await world.advance(STEP)
      b.leader.requestLeadership()
      await world.advance(STEP)
      c.leader.requestLeadership()
      await world.advance(STEP)
      expect(leaders([a, b, c])).toEqual([c])
      expect(a.events).toEqual(['L', 'F'])
      expect(b.events).toEqual(['L', 'F'])
      expect(c.events).toEqual(['L'])
    })

    test('called after relinquish() while waiting to compete again: takes over at once (A3)', async () => {
      const world = createWorld(worldOptions)
      const [a, b] = [join(world), join(world)]
      await world.advance(STEP)
      a.leader.relinquish()
      await world.advance(STEP)
      expect(b.leader.isLeader).toBe(true)
      a.leader.requestLeadership()
      await world.advance(STEP)
      expect(leaders([a, b])).toEqual([a])
      expect(a.events).toEqual(['L', 'F', 'L'])
      expect(b.events).toEqual(['L', 'F'])
      // The rejoin scheduled by relinquish() (lease: one leaseRenewInterval later) must not fire.
      await world.advance(MIN - 2 * STEP + 10)
      expect(a.leader.isLeader).toBe(true)
      await world.advance(5 * MIN)
      expect(leaders([a, b])).toEqual([a])
      expect(a.events).toEqual(['L', 'F', 'L'])
    })
  },
)
