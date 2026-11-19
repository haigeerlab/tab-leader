import { describe, expect, test } from 'vitest'
import { createTabInterval } from '../src/interval'
import { createLog, INTERVAL, MIN, openTask, SEC } from './interval-helpers'
import { createWorld } from './world'

const LAST = 'app:last'

/** A canRun gate the test can flip, counting how often it was asked. */
function createGate(open = false) {
  const gate = {
    open,
    calls: 0,
    canRun: () => {
      gate.calls++
      return gate.open
    },
  }
  return gate
}

describe('createTabInterval canRun (I7)', () => {
  test('false with no record: no run, no record, key() not called', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    let keyCalls = 0
    openTask(world, log, {
      canRun: gate.canRun,
      key: () => {
        keyCalls++
        return 'guest'
      },
    })
    await world.advance(10 * SEC)
    expect(gate.calls).toBeGreaterThan(0)
    expect(log.times()).toHaveLength(0)
    expect(world.store.has(LAST)).toBe(false)
    expect(keyCalls).toBe(0)
  })

  test('false when due: no run and the record stays exactly as it was', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate(true)
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(MIN)
    expect(log.times()).toHaveLength(1)
    const before = world.store.get(LAST)
    gate.open = false
    await world.advance(INTERVAL)
    a.task.check()
    expect(log.times()).toHaveLength(1)
    expect(world.store.get(LAST)).toBe(before)
  })

  test('false when the key changed: no run, record unchanged', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate(true)
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(MIN)
    const before = world.store.get(LAST)
    gate.open = false
    a.identity = 'u:1'
    a.task.check()
    await world.advance(10 * SEC)
    expect(log.times()).toHaveLength(1)
    expect(world.store.get(LAST)).toBe(before)
  })

  test('false when the clock moved back: the record is not rewritten', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate(true)
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(MIN)
    const before = world.store.get(LAST)
    gate.open = false
    world.jumpClock(-10 * MIN)
    a.task.check()
    await world.advance(10 * SEC)
    expect(world.store.get(LAST)).toBe(before)
  })

  test('false then true: runs at the 1000 ms retry after the last skip, not before', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(SEC / 2)
    a.task.check() // skip now: the retry is due 1000 ms from here
    const skippedAt = world.now
    gate.open = true
    await world.advance(SEC - 1)
    expect(log.times()).toHaveLength(0)
    await world.advance(1)
    expect(log.times()).toEqual([skippedAt + SEC])
  })

  test('true again before the interval elapsed: no run until it is due', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate(true)
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(MIN)
    const first = log.times()[0]!
    gate.open = false
    a.task.check()
    await world.advance(5 * SEC)
    gate.open = true
    await world.advance(INTERVAL - MIN - 5 * SEC - 1)
    expect(log.times()).toHaveLength(1)
    await world.advance(MIN + 1)
    expect(log.times()).toEqual([first, first + INTERVAL])
  })

  test('canRun throws: treated as true, the error does not escape', async () => {
    const world = createWorld()
    const log = createLog()
    const a = openTask(world, log, {
      canRun: () => {
        throw new Error('boom')
      },
    })
    await world.advance(MIN)
    expect(log.times()).toHaveLength(1)
    expect(() => a.task.check()).not.toThrow()
    expect(world.errors).toHaveLength(0)
  })

  test('only a strict false skips', async () => {
    const world = createWorld()
    const log = createLog()
    openTask(world, log, { canRun: () => undefined as unknown as boolean })
    await world.advance(MIN)
    expect(log.times()).toHaveLength(1)
  })

  test('check() asks canRun again and runs at once when it is true', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(SEC / 2)
    expect(log.times()).toHaveLength(0)
    const calls = gate.calls
    gate.open = true
    a.task.check()
    expect(gate.calls).toBe(calls + 1)
    expect(log.times()).toEqual([world.now])
  })

  test('back to the foreground asks canRun again', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(SEC / 2)
    gate.open = true
    world.activate(a.tab)
    expect(log.times()).toEqual([world.now])
  })

  test('destroy(): no more canRun calls and no run', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    const a = openTask(world, log, { canRun: gate.canRun })
    await world.advance(5 * SEC)
    a.task.destroy()
    const calls = gate.calls
    gate.open = true
    await world.advance(10 * SEC)
    expect(gate.calls).toBe(calls)
    expect(log.times()).toHaveLength(0)
  })

  test('losing leadership cancels the pending retry; the new leader asks its own canRun', async () => {
    const world = createWorld()
    const log = createLog()
    const gateA = createGate()
    const gateB = createGate(true)
    const a = openTask(world, log, { canRun: gateA.canRun })
    const b = openTask(world, log, { canRun: gateB.canRun })
    await world.advance(5 * SEC)
    expect(a.task.isLeader).toBe(true)
    expect(gateB.calls).toBe(0)
    world.hide(a.tab)
    const callsA = gateA.calls
    await world.advance(10 * SEC)
    expect(gateA.calls).toBe(callsA)
    expect(b.task.isLeader).toBe(true)
    expect(gateB.calls).toBeGreaterThan(0)
    expect(log.runs.map((r) => r.tab)).toEqual([b.tab.id])
  })

  test('several tabs: while the leader skips, nobody runs', async () => {
    const world = createWorld()
    const log = createLog()
    const gate = createGate()
    openTask(world, log, { canRun: gate.canRun })
    const others = [openTask(world, log), openTask(world, log)]
    await world.advance(MIN)
    expect(log.times()).toHaveLength(0)
    expect(others.every((t) => !t.task.isLeader)).toBe(true)
  })

  test('a stale retry that still fires after clearTimeout does nothing (R14)', async () => {
    const world = createWorld()
    const tab = world.openTab()
    // A browser may still run a task that was already queued when clearTimeout was called.
    const env = { ...tab.env, clearTimeout: () => {} }
    const gate = createGate()
    const task = createTabInterval({
      name: 'app',
      interval: INTERVAL,
      run: () => {},
      canRun: gate.canRun,
      env,
    })
    task.start()
    await world.advance(SEC / 2) // skipped once: a retry is pending at 1000 ms
    world.hide(tab)
    world.show(tab) // leader again: skipped once more, a new retry at 1500 ms
    await world.advance(SEC / 4)
    const calls = gate.calls
    await world.advance(SEC / 2) // the stale 1000 ms retry fires here
    expect(gate.calls).toBe(calls)
    task.destroy()
  })
})
