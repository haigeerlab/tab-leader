import { describe, expect, test } from 'vitest'
import { join } from './helpers'
import { createWorld } from './world'

const MIN = 60_000

describe('Web Locks mode: alive record and stall takeover', () => {
  test('the leader writes an alive record when elected and every aliveInterval', async () => {
    const world = createWorld()
    const a = join(world)
    await world.advance(10)
    const first = JSON.parse(world.store.get('app:alive')!) as { at: number }
    await world.advance(MIN)
    const second = JSON.parse(world.store.get('app:alive')!) as { at: number }
    expect(second.at - first.at).toBe(MIN)
    expect(a.leader.isLeader).toBe(true)
  })

  test('frozen leader (no pagehide, lock kept) is taken over after stallTimeout (R6)', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    await world.advance(3 * MIN)
    expect(b.leader.isLeader).toBe(false) // not yet: within the 180 s threshold
    await world.advance(2 * MIN)
    expect(b.leader.isLeader).toBe(true)
    expect(world.lockHolder('app')).toBe(b.tab)
  })

  test('a short pause within stallTimeout does not trigger a takeover', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    await world.advance(2 * MIN)
    world.unfreeze(a.tab)
    await world.advance(10 * MIN)
    expect(a.leader.isLeader).toBe(true)
    expect(b.leader.isLeader).toBe(false)
    expect(a.events).toEqual(['L'])
  })

  test('unfrozen old leader yields on its first alive check, before AbortError arrives (R5)', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    await world.advance(5 * MIN)
    expect(b.leader.isLeader).toBe(true)
    // Unfreeze without delivering the queued AbortError: drop it to isolate the alive-record check.
    a.tab.pending.length = 0
    world.unfreeze(a.tab)
    await world.advance(MIN)
    expect(a.leader.isLeader).toBe(false)
    expect(a.events).toEqual(['L', 'F'])
    expect(b.leader.isLeader).toBe(true)
  })

  test('unfrozen old leader also yields via AbortError and queues again (R7)', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    await world.advance(5 * MIN)
    world.unfreeze(a.tab)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(false)
    expect(a.events).toEqual(['L', 'F'])
    world.closeTab(b.tab)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(true)
  })

  test('no alive record (e.g. an older implementation is leading): never steal', async () => {
    const world = createWorld()
    const legacy = world.openTab()
    void legacy.env.navigator!.locks!.request('app', {}, () => new Promise(() => {}))
    const b = join(world)
    await world.advance(30 * MIN)
    expect(b.leader.isLeader).toBe(false)
  })

  test('corrupt or future-dated alive records never count as a stall', async () => {
    const world = createWorld()
    const legacy = world.openTab()
    void legacy.env.navigator!.locks!.request('app', {}, () => new Promise(() => {}))
    const b = join(world)
    world.store.set('app:alive', '{bad')
    await world.advance(10 * MIN)
    expect(b.leader.isLeader).toBe(false)
    world.store.set('app:alive', JSON.stringify({ tab: 'x', at: world.now + 60 * MIN }))
    await world.advance(10 * MIN)
    expect(b.leader.isLeader).toBe(false)
  })

  test('coming to the foreground checks for a stall immediately', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.freeze(a.tab)
    world.freeze(b.tab) // follower's timers are throttled too
    await world.advance(5 * MIN)
    world.unfreeze(b.tab)
    world.activate(b.tab)
    await world.advance(10)
    expect(b.leader.isLeader).toBe(true)
  })

  test('without localStorage there is no stall takeover (known limitation)', async () => {
    const world = createWorld({ storage: 'none' })
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    expect(a.leader.mode).toBe('locks')
    world.freeze(a.tab)
    await world.advance(30 * MIN)
    expect(b.leader.isLeader).toBe(false)
  })

  test('stallTimeout and aliveInterval are configurable', async () => {
    const world = createWorld()
    const opts = { aliveInterval: 1000, stallTimeout: 3000 }
    const [a, b] = [join(world, opts), join(world, opts)]
    await world.advance(10)
    world.freeze(a.tab)
    await world.advance(5000)
    expect(b.leader.isLeader).toBe(true)
  })
})
