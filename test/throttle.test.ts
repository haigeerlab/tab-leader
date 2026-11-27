import { describe, expect, test } from 'vitest'
import { join, leaders } from './helpers'
import { createLog, gaps, MIN, openTask, SEC } from './interval-helpers'
import { createWorld } from './world'

/** The fast takeover settings from the API guide. */
const fast = { leaseTtl: 6000, leaseRenewInterval: 2000, aliveInterval: 2000, stallTimeout: 6000 }

describe('every tab hidden with intensive throttling (timer chains wake once a minute)', () => {
  test('Web Locks: tabs stealing at the same wake-up never run createTabInterval twice in one interval', async () => {
    // Writes reach other tabs a few milliseconds later, as across Chrome renderer processes.
    const world = createWorld({ throttle: true, storageLag: 3 })
    const log = createLog()
    for (let i = 0; i < 3; i++) openTask(world, log, { ...fast, interval: 5000 })
    await world.advance(10 * MIN)
    const times = log.times()
    expect(times.length).toBeGreaterThan(5)
    expect(Math.min(...gaps(times))).toBeGreaterThanOrEqual(5000)
  })

  test('lease: a confirmation delayed past the lease expiry still elects a leader', async () => {
    const world = createWorld({ locks: false, throttle: true })
    const tabs = [join(world, fast), join(world, fast), join(world, fast)]
    let leaderless = 0
    let longest = 0
    let most = 0
    for (let t = 0; t < 10 * MIN; t += SEC) {
      await world.advance(SEC)
      const count = leaders(tabs).length
      most = Math.max(most, count)
      leaderless = count === 0 ? leaderless + SEC : 0
      longest = Math.max(longest, leaderless)
    }
    expect(tabs.every((m) => m.leader.mode === 'lease')).toBe(true)
    expect(most).toBe(1)
    // Leadership may change about once a minute, but never minutes without a leader.
    expect(longest).toBeLessThanOrEqual(2 * MIN)
  })
})

describe('Web Locks takeover delay', () => {
  test('after stealing the lock the first run waits 1 s; check() and focus meanwhile do nothing', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log, { ...fast, interval: 5000 })
    const b = openTask(world, log, { ...fast, interval: 5000 })
    await world.advance(10)
    world.freeze(a.tab)
    for (let i = 0; i < 2000 && !b.task.isLeader; i++) await world.advance(10)
    expect(b.task.isLeader).toBe(true)
    const before = log.runs.length
    b.task.check()
    world.activate(b.tab)
    await world.advance(990)
    expect(log.runs.length).toBe(before)
    await world.advance(10)
    expect(log.runs.length).toBe(before + 1)
    expect(log.runs[before]!.tab).toBe(b.tab.id)
  })

  test('losing the lock during the delay cancels the pending first run', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log, fast)
    const b = openTask(world, log, fast)
    await world.advance(10)
    world.freeze(a.tab)
    for (let i = 0; i < 20 && !b.task.isLeader; i++) await world.advance(SEC)
    const before = log.runs.length
    b.task.destroy()
    await world.advance(5 * SEC)
    expect(log.runs.length).toBe(before)
  })
})

describe('lease renewal and confirmation past expiry', () => {
  test('a leader whose lease expired unrenewed keeps it when nobody overwrote it', async () => {
    const world = createWorld({ locks: false })
    const a = join(world, fast)
    await world.advance(SEC)
    expect(a.leader.isLeader).toBe(true)
    world.freeze(a.tab)
    await world.advance(MIN)
    world.unfreeze(a.tab)
    await world.advance(SEC)
    expect(a.leader.isLeader).toBe(true)
    expect(a.events).toEqual(['L'])
  })
})
