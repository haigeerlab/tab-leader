import { describe, expect, test } from 'vitest'
import { createLog, gaps, INTERVAL, MIN, openTask, SEC } from './interval-helpers'
import { createWorld } from './world'

describe('createTabInterval', () => {
  test('five tabs: one run per interval', async () => {
    const world = createWorld()
    const log = createLog()
    const tasks = Array.from({ length: 5 }, () => openTask(world, log))
    await world.advance(30 * MIN)
    expect(log.times()).toHaveLength(11)
    expect(gaps(log.times()).every((g) => g === INTERVAL)).toBe(true)
    expect(new Set(log.runs.map((r) => r.tab)).size).toBe(1)
    expect(tasks.filter((t) => t.task.isLeader)).toHaveLength(1)
  })

  test('new leader after close waits until the interval since the last run has passed', async () => {
    const world = createWorld()
    const log = createLog()
    const [a] = [openTask(world, log), openTask(world, log)]
    await world.advance(MIN)
    world.closeTab(a.tab)
    await world.advance(10 * MIN)
    expect(gaps(log.times()).every((g) => g >= INTERVAL)).toBe(true)
    expect(log.times()[1]! - log.times()[0]!).toBe(INTERVAL)
  })

  test('strict interval: not at interval - 1 ms, yes at interval', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(INTERVAL - 1)
    a.task.check()
    expect(log.times()).toHaveLength(1)
    await world.advance(1)
    expect(log.times()).toHaveLength(2)
  })

  test('five reloads within the interval: one run', async () => {
    const world = createWorld()
    const log = createLog()
    for (let i = 0; i < 5; i++) {
      const r = openTask(world, log)
      await world.advance(20 * SEC)
      world.closeTab(r.tab)
    }
    expect(log.times()).toHaveLength(1)
  })

  test('identity change: run at once and restart the interval', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(MIN)
    a.identity = 'u:1'
    a.task.check()
    expect(log.runs.map((r) => r.identity)).toEqual(['guest', 'u:1'])
    await world.advance(INTERVAL - 1)
    expect(log.times()).toHaveLength(2)
    await world.advance(1)
    expect(log.times()).toHaveLength(3)
  })

  test('identity change in another tab is picked up by the leader on its next tick', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    const b = openTask(world, log)
    await world.advance(MIN)
    a.identity = 'u:1'
    b.identity = 'u:1'
    b.task.check() // follower: no effect
    expect(log.times()).toHaveLength(1)
    a.task.check()
    expect(log.runs.at(-1)!.identity).toBe('u:1')
  })

  test('visibilitychange, focus and a timer firing together: one run', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(INTERVAL - 1)
    await world.advance(1)
    world.activate(a.tab)
    a.task.check()
    expect(log.times()).toHaveLength(2)
  })

  test('different names are independent', async () => {
    const world = createWorld()
    const log = createLog()
    openTask(world, log, { name: 'one' })
    openTask(world, log, { name: 'two' })
    await world.advance(INTERVAL)
    expect(log.times('one')).toHaveLength(2)
    expect(log.times('two')).toHaveLength(2)
  })

  test('run rejects: no retry, next cycle runs normally', async () => {
    const world = createWorld()
    let calls = 0
    const tab = world.openTab()
    const { createTabInterval } = await import('../src/interval')
    createTabInterval({
      name: 'app',
      interval: INTERVAL,
      env: tab.env,
      run: () => {
        calls++
        return Promise.reject(new Error('network'))
      },
    }).start()
    await world.advance(2 * INTERVAL)
    expect(calls).toBe(3)
  })

  test('run throws synchronously: next cycle runs normally', async () => {
    const world = createWorld()
    let calls = 0
    const tab = world.openTab()
    const { createTabInterval } = await import('../src/interval')
    createTabInterval({
      name: 'app',
      interval: INTERVAL,
      env: tab.env,
      run: () => {
        calls++
        throw new Error('sync')
      },
    }).start()
    await world.advance(2 * INTERVAL)
    expect(calls).toBe(3)
    expect(world.errors).toEqual([])
  })

  test('key() throwing keeps the previous identity and does not trigger a run', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    a.task.destroy()
    const r = openTask(world, log, {
      key: () => {
        throw new Error('no identity yet')
      },
    })
    await world.advance(MIN)
    r.task.check()
    expect(log.times()).toHaveLength(1)
  })

  test('clock moved back: no early run; interval restarts from the new time', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(MIN)
    world.jumpClock(-10 * MIN)
    a.task.check()
    expect(log.times()).toHaveLength(1)
    const reset = world.now
    await world.advance(INTERVAL - 1)
    expect(log.times()).toHaveLength(1)
    await world.advance(1)
    expect(log.times().at(-1)).toBe(reset + INTERVAL)
  })

  test('Web Locks without localStorage: still one tab runs', async () => {
    const world = createWorld({ storage: 'none' })
    const log = createLog()
    openTask(world, log)
    openTask(world, log)
    await world.advance(10 * MIN)
    expect(new Set(log.runs.map((r) => r.tab)).size).toBe(1)
  })

  test('neither Web Locks nor localStorage: every tab runs on its own interval', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const log = createLog()
    openTask(world, log)
    openTask(world, log)
    await world.advance(INTERVAL)
    expect(log.times()).toHaveLength(4)
  })

  test('storage starts throwing at runtime: no interruption and no early run', async () => {
    const world = createWorld()
    const log = createLog()
    openTask(world, log)
    await world.advance(MIN)
    world.storageBroken = true
    await world.advance(10 * MIN)
    expect(gaps(log.times()).every((g) => g === INTERVAL)).toBe(true)
    expect(log.times().length).toBeGreaterThanOrEqual(4)
  })

  test('corrupt record falls back to the in-memory record', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(MIN)
    world.store.set('app:last', '{broken')
    a.task.check()
    expect(log.times()).toHaveLength(1)
  })

  test('lease mode: one run per interval across three tabs', async () => {
    const world = createWorld({ locks: false })
    const log = createLog()
    for (let i = 0; i < 3; i++) openTask(world, log)
    await world.advance(30 * MIN)
    expect(gaps(log.times()).every((g) => g >= INTERVAL)).toBe(true)
    expect(log.times().length).toBeGreaterThanOrEqual(10)
  })

  test('lease mode: an old leader resumed from a long pause does not run', async () => {
    const world = createWorld({ locks: false })
    const log = createLog()
    const a = openTask(world, log)
    openTask(world, log)
    await world.advance(SEC)
    world.freeze(a.tab)
    await world.advance(10 * MIN)
    world.unfreeze(a.tab)
    a.task.check()
    await world.advance(MIN)
    expect(gaps(log.times()).every((g) => g >= INTERVAL)).toBe(true)
  })

  test('lease mode: storage failure degrades to solo and keeps running', async () => {
    const world = createWorld({ locks: false })
    const log = createLog()
    openTask(world, log)
    await world.advance(SEC)
    world.storageBroken = true
    await world.advance(10 * MIN)
    expect(log.times().length).toBeGreaterThanOrEqual(3)
  })

  test('Web Locks: frozen leader taken over, intervals stay >= interval', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    openTask(world, log)
    await world.advance(SEC)
    world.freeze(a.tab)
    await world.advance(10 * MIN)
    world.unfreeze(a.tab)
    await world.advance(10 * MIN)
    expect(new Set(log.runs.map((r) => r.tab)).size).toBe(2)
    expect(gaps(log.times()).every((g) => g >= INTERVAL)).toBe(true)
  })

  test('bfcache: pagehide stops, pageshow resumes with a single timer', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(MIN)
    world.hide(a.tab)
    await world.advance(5 * MIN)
    expect(log.times()).toHaveLength(1)
    world.show(a.tab)
    world.show(a.tab)
    await world.advance(10 * MIN)
    expect(gaps(log.times()).every((g) => g >= INTERVAL)).toBe(true)
  })

  test('destroy stops running', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log)
    await world.advance(1)
    a.task.destroy()
    await world.advance(10 * MIN)
    expect(log.times()).toHaveLength(1)
    expect(a.task.isLeader).toBe(false)
    expect(a.task.mode).toBe('locks')
  })

  test('without a key every run uses the same identity', async () => {
    const world = createWorld()
    const log = createLog()
    openTask(world, log, { key: undefined })
    await world.advance(INTERVAL)
    expect(log.times()).toHaveLength(2)
  })
})
