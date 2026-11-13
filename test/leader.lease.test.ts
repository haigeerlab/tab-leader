import { describe, expect, test } from 'vitest'
import { alternates, join, leaders } from './helpers'
import { createWorld } from './world'

const SEC = 1000
const MIN = 60 * SEC

describe('lease mode', () => {
  test('three tabs opened at once: exactly one leader', async () => {
    const world = createWorld({ locks: false })
    const members = [join(world), join(world), join(world)]
    await world.advance(SEC)
    expect(members[0]!.leader.mode).toBe('lease')
    expect(leaders(members)).toHaveLength(1)
  })

  test('only one leader across many renewals', async () => {
    const world = createWorld({ locks: false })
    const members = [join(world), join(world), join(world)]
    for (let i = 0; i < 20; i++) {
      await world.advance(MIN)
      expect(leaders(members)).toHaveLength(1)
    }
  })

  test('leader closes: lease removed, another tab takes over at once via the storage event', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    const owner = () => (JSON.parse(world.store.get('app:lease') ?? 'null') as { tab?: string } | null)?.tab
    const leaseOfA = owner()
    world.closeTab(a.tab)
    expect(owner()).not.toBe(leaseOfA) // removed, then immediately re-written by b
    await world.advance(SEC)
    expect(b.leader.isLeader).toBe(true)
  })

  test('leader paused beyond the lease TTL: taken over after expiry', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.freeze(a.tab)
    await world.advance(2 * MIN)
    expect(b.leader.isLeader).toBe(false)
    await world.advance(MIN + SEC)
    expect(b.leader.isLeader).toBe(true)
  })

  test('resumed old leader finds the lease is not its own and steps down', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.freeze(a.tab)
    await world.advance(4 * MIN)
    expect(b.leader.isLeader).toBe(true)
    world.unfreeze(a.tab)
    await world.advance(MIN)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('a crashed leader (no pagehide) is replaced after its lease expires', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.crash(a.tab)
    await world.advance(4 * MIN)
    expect(b.leader.isLeader).toBe(true)
  })

  test('pagehide removes the own lease', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    await world.advance(SEC)
    expect(world.store.has('app:lease')).toBe(true)
    world.hide(a.tab)
    expect(world.store.has('app:lease')).toBe(false)
  })

  test('storage fails at runtime: degrade to solo, onFollower then onLeader (R11)', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    world.storageBroken = true
    await world.advance(2 * MIN)
    expect(a.leader.mode).toBe('solo')
    expect(b.leader.mode).toBe('solo')
    expect([a.leader.isLeader, b.leader.isLeader]).toEqual([true, true])
    expect(a.events).toEqual(['L', 'F', 'L'])
    expect(b.events).toEqual(['L'])
  })

  test('another tab overwriting the lease makes the leader step down on the storage event', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    b.tab.env.localStorage!.setItem(
      'app:lease',
      JSON.stringify({ tab: 'other', gen: 0, exp: world.now + MIN }),
    )
    expect(a.leader.isLeader).toBe(false)
    expect(alternates(a.events)).toBe(true)
  })

  test('relinquish waits one renew interval before competing again (R12)', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    a.leader.relinquish()
    await world.advance(SEC)
    expect(leaders([a, b])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('relinquish when alone: leads again after the renew interval', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    await world.advance(SEC)
    a.leader.relinquish()
    await world.advance(10 * SEC)
    expect(a.leader.isLeader).toBe(false)
    await world.advance(MIN)
    expect(a.leader.isLeader).toBe(true)
  })

  test("strategy 'lease' uses the lease even when Web Locks exist", async () => {
    const world = createWorld()
    const a = join(world, { strategy: 'lease' })
    await world.advance(SEC)
    expect(a.leader.mode).toBe('lease')
    expect(world.lockHolder('app')).toBeNull()
  })

  test('capability matrix picks the expected mode', () => {
    const cases: Array<[boolean, 'ok' | 'none', string]> = [
      [true, 'ok', 'locks'],
      [true, 'none', 'locks'],
      [false, 'ok', 'lease'],
      [false, 'none', 'solo'],
    ]
    for (const [locks, storage, mode] of cases) {
      expect(join(createWorld({ locks, storage })).leader.mode).toBe(mode)
    }
  })

  test('foreground check: a leader whose lease was taken steps down', async () => {
    const world = createWorld({ locks: false })
    const a = join(world)
    await world.advance(SEC)
    world.freeze(a.tab)
    world.store.set('app:lease', JSON.stringify({ tab: 'other', gen: 0, exp: world.now + MIN }))
    world.unfreeze(a.tab)
    world.activate(a.tab)
    expect(a.leader.isLeader).toBe(false)
  })

  test('destroy removes the own lease', async () => {
    const world = createWorld({ locks: false })
    const [a, b] = [join(world), join(world)]
    await world.advance(SEC)
    a.leader.destroy()
    await world.advance(SEC)
    expect(b.leader.isLeader).toBe(true)
  })
})
