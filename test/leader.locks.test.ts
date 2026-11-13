import { describe, expect, test } from 'vitest'
import { alternates, join, leaders } from './helpers'
import { createWorld } from './world'

describe('Web Locks mode', () => {
  test('five tabs: exactly one leader', async () => {
    const world = createWorld()
    const members = Array.from({ length: 5 }, () => join(world))
    await world.advance(10)
    expect(members[0]!.leader.mode).toBe('locks')
    expect(leaders(members)).toHaveLength(1)
    expect(leaders(members)[0]).toBe(members[0])
  })

  test('leader closes: the next tab takes over immediately', async () => {
    const world = createWorld()
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(10)
    world.closeTab(a.tab)
    await world.advance(10)
    expect(leaders([b, c])).toEqual([b])
    expect(a.events).toEqual(['L', 'F'])
  })

  test('leader crashes without pagehide: the browser frees the lock and another tab leads', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.crash(a.tab)
    await world.advance(10)
    expect(b.leader.isLeader).toBe(true)
  })

  test('a tab paused while queued releases the lock as soon as it gets it (R4)', async () => {
    const world = createWorld()
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(10)
    world.hide(b.tab)
    world.closeTab(a.tab)
    await world.advance(10)
    expect(b.leader.isLeader).toBe(false)
    expect(b.events).toEqual([])
    expect(c.leader.isLeader).toBe(true)
    expect(world.lockHolder('app')).toBe(c.tab)
  })

  test('pagehide releases the lock; pageshow(persisted) queues again', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    world.hide(a.tab)
    await world.advance(10)
    expect(b.leader.isLeader).toBe(true)
    world.show(a.tab)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(false)
    world.closeTab(b.tab)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(true)
    expect(a.events).toEqual(['L', 'F', 'L'])
  })

  test('stolen leader is notified and queues again (R7)', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    void b.tab.env.navigator!.locks!.request('app', { steal: true }, () => new Promise(() => {}))
    await world.advance(10)
    expect(a.leader.isLeader).toBe(false)
    expect(a.events).toEqual(['L', 'F'])
  })

  test('relinquish moves to the back of the queue (R12)', async () => {
    const world = createWorld()
    const [a, b, c] = [join(world), join(world), join(world)]
    await world.advance(10)
    a.leader.relinquish()
    await world.advance(10)
    expect(leaders([a, b, c])).toEqual([b])
    b.leader.relinquish()
    await world.advance(10)
    expect(leaders([a, b, c])).toEqual([c])
    c.leader.relinquish()
    await world.advance(10)
    expect(leaders([a, b, c])).toEqual([a])
    for (const m of [a, b, c]) expect(alternates(m.events)).toBe(true)
  })

  test('relinquish when alone: becomes leader again', async () => {
    const world = createWorld()
    const a = join(world)
    await world.advance(10)
    a.leader.relinquish()
    await world.advance(10)
    expect(a.events).toEqual(['L', 'F', 'L'])
  })

  test('different names do not interfere', async () => {
    const world = createWorld()
    const a = join(world, { name: 'one' })
    const b = join(world, { name: 'two' })
    await world.advance(10)
    expect([a.leader.isLeader, b.leader.isLeader]).toEqual([true, true])
  })

  test('destroy releases the lock to the next tab', async () => {
    const world = createWorld()
    const [a, b] = [join(world), join(world)]
    await world.advance(10)
    a.leader.destroy()
    await world.advance(10)
    expect(b.leader.isLeader).toBe(true)
  })

  test('other request rejections are treated as losing leadership (R8)', async () => {
    const world = createWorld()
    const tab = world.openTab()
    let rejectHeld!: (e: unknown) => void
    let calls = 0
    const locks = {
      request(_n: string, _o: object, cb: (l: unknown) => unknown) {
        calls++
        void cb({})
        return new Promise((_resolve, reject) => {
          if (calls === 1) rejectHeld = reject
        })
      },
    }
    const m = join(world, {}, Object.assign(tab, { env: { ...tab.env, navigator: { locks } } }))
    await world.advance(10)
    expect(m.leader.isLeader).toBe(true)
    rejectHeld(new Error('dropped'))
    await world.advance(10)
    expect(m.events).toEqual(['L', 'F', 'L'])
    expect(calls).toBe(2)
  })
})
