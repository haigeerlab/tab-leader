import { describe, expect, test } from 'vitest'
import { createLog, INTERVAL, MIN, openTask } from './interval-helpers'
import { createWorld } from './world'

describe('migration compatibility with the record formats of a previous implementation', () => {
  test('starts from an existing `:last` record { at, id } and honours its interval', async () => {
    const world = createWorld()
    world.store.set('app:last', JSON.stringify({ at: world.now - MIN, id: 'guest' }))
    const log = createLog()
    openTask(world, log)
    await world.advance(2 * MIN - 1)
    expect(log.times()).toHaveLength(0)
    await world.advance(1)
    expect(log.times()).toHaveLength(1)
  })

  test('an existing foreign lease { tab, gen, exp } is respected until it expires', async () => {
    const world = createWorld({ locks: false })
    world.store.set('app:lease', JSON.stringify({ tab: 'legacy', gen: 0, exp: world.now + 2 * MIN }))
    const log = createLog()
    const r = openTask(world, log)
    await world.advance(MIN)
    expect(r.task.isLeader).toBe(false)
    await world.advance(2 * MIN)
    expect(r.task.isLeader).toBe(true)
  })

  test('a legacy Web Locks leader (no alive record) is never stolen from', async () => {
    const world = createWorld()
    const legacy = world.openTab()
    void legacy.env.navigator!.locks!.request('app', {}, () => new Promise(() => {}))
    world.store.set('app:last', JSON.stringify({ at: world.now, id: 'guest' }))
    const log = createLog()
    openTask(world, log)
    await world.advance(10 * INTERVAL)
    expect(log.times()).toHaveLength(0)
  })

  test('writes `:last` in the same { at, id } format', async () => {
    const world = createWorld()
    openTask(world, createLog())
    await world.advance(1)
    expect(Object.keys(JSON.parse(world.store.get('app:last')!) as object).sort()).toEqual(['at', 'id'])
  })
})
