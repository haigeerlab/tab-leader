import { describe, expect, test } from 'vitest'
import { join, leaders } from './helpers'
import { createLog, INTERVAL, openTask } from './interval-helpers'
import { createWorld } from './world'

/** Resolves only if the real event loop still runs macrotasks (a microtask loop would starve it). */
const realTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// Web Locks exists but request() rejects before granting (e.g. Chrome with all site data blocked
// in a secure context): the mechanism is unusable here, so fall through instead of retrying (R8a).
describe('navigator.locks rejects every request', () => {
  test('storage usable: falls back to lease with one leader and no retry loop', async () => {
    const world = createWorld({ locksReject: true })
    const [a, b, c] = [join(world), join(world), join(world)]
    await realTick()
    await world.advance(1000)
    expect(world.lockRequests).toBe(3)
    for (const m of [a, b, c]) expect(m.leader.mode).toBe('lease')
    expect(leaders([a, b, c])).toHaveLength(1)
    for (const m of [a, b, c]) expect(m.events.filter((e) => e === 'L').length).toBeLessThanOrEqual(1)
  })

  test('storage unusable: falls back to solo and every tab leads', async () => {
    const world = createWorld({ locksReject: true, storage: 'none' })
    const [a, b] = [join(world), join(world)]
    await realTick()
    await world.advance(1000)
    expect(world.lockRequests).toBe(2)
    for (const m of [a, b]) {
      expect(m.leader.mode).toBe('solo')
      expect(m.events).toEqual(['L'])
    }
  })

  test('createTabInterval: runs once and keeps the event loop alive', async () => {
    const world = createWorld({ locksReject: true, storage: 'none' })
    const log = createLog()
    openTask(world, log)
    await realTick()
    await world.advance(INTERVAL - 1)
    expect(world.lockRequests).toBe(1)
    expect(log.times()).toHaveLength(1)
  })
})
