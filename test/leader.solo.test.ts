import { describe, expect, test } from 'vitest'
import { createTabLeader } from '../src/leader'
import { alternates, join } from './helpers'
import { createWorld } from './world'

describe('solo mode and lifecycle', () => {
  test('without Web Locks and localStorage every tab is a leader', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const a = join(world)
    const b = join(world)
    await world.advance(10)
    expect(a.leader.mode).toBe('solo')
    expect([a.leader.isLeader, b.leader.isLeader]).toEqual([true, true])
  })

  test("strategy 'solo' skips available mechanisms", async () => {
    const world = createWorld()
    const a = join(world, { strategy: 'solo' })
    await world.advance(10)
    expect(a.leader.mode).toBe('solo')
    expect(a.leader.isLeader).toBe(true)
    expect(world.store.size).toBe(0)
  })

  test('mode is none before start; creating touches no browser API', () => {
    const world = createWorld()
    const tab = world.openTab()
    let touched = false
    const env = new Proxy(tab.env, {
      get(target, key, receiver) {
        touched = true
        return Reflect.get(target, key, receiver) as unknown
      },
    })
    const leader = createTabLeader({ name: 'app', env })
    expect(touched).toBe(false)
    expect(leader.mode).toBe('none')
    expect(leader.isLeader).toBe(false)
  })

  test('outside a browser start() is inert (R3)', () => {
    const leader = createTabLeader({ name: 'app', onLeader: () => expect.fail('must not lead') })
    leader.start()
    leader.relinquish()
    expect(leader.mode).toBe('none')
    expect(leader.isLeader).toBe(false)
    leader.destroy()
  })

  test('start twice has no extra effect', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const a = join(world)
    a.leader.start()
    await world.advance(10)
    expect(a.events).toEqual(['L'])
  })

  test('pagehide suspends and notifies; pageshow(persisted) rejoins; repeated pageshow does not restart', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const a = join(world)
    await world.advance(10)
    world.hide(a.tab)
    expect(a.leader.isLeader).toBe(false)
    world.show(a.tab)
    world.show(a.tab)
    await world.advance(10)
    expect(a.leader.isLeader).toBe(true)
    expect(a.events).toEqual(['L', 'F', 'L'])
  })

  test('a normal-load pageshow (persisted false) does not restart', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const a = join(world)
    a.tab.window.dispatch('pageshow', { persisted: false })
    await world.advance(10)
    expect(a.events).toEqual(['L'])
  })

  test('destroy notifies, removes every listener, and start afterwards does nothing', async () => {
    const world = createWorld()
    const a = join(world)
    await world.advance(10)
    expect(a.tab.window.listenerCount() + a.tab.document.listenerCount()).toBeGreaterThan(0)
    a.leader.destroy()
    a.leader.destroy()
    expect(a.tab.window.listenerCount() + a.tab.document.listenerCount()).toBe(0)
    expect(a.events).toEqual(['L', 'F'])
    a.leader.start()
    await world.advance(10)
    expect(a.leader.isLeader).toBe(false)
  })

  test('destroy before start is allowed and start afterwards does nothing', async () => {
    const world = createWorld()
    const tab = world.openTab()
    const leader = createTabLeader({ name: 'app', env: tab.env })
    leader.destroy()
    leader.start()
    await world.advance(10)
    expect(leader.isLeader).toBe(false)
    expect(tab.window.listenerCount()).toBe(0)
  })

  test('callback errors are reported asynchronously and do not break the state machine (R15)', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const tab = world.openTab()
    const leader = createTabLeader({
      name: 'app',
      env: tab.env,
      onLeader: () => {
        throw new Error('boom-leader')
      },
      onFollower: () => {
        throw new Error('boom-follower')
      },
    })
    leader.start()
    expect(leader.isLeader).toBe(true)
    world.hide(tab)
    expect(leader.isLeader).toBe(false)
    await world.advance(10)
    expect(world.errors.map((e) => (e as Error).message)).toEqual(['boom-leader', 'boom-follower'])
  })

  test('relinquish has no effect in solo mode or when not leader', async () => {
    const world = createWorld({ locks: false, storage: 'none' })
    const a = join(world)
    a.leader.relinquish()
    await world.advance(10)
    expect(a.events).toEqual(['L'])
    expect(alternates(a.events)).toBe(true)
  })
})
