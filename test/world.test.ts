import { describe, expect, test } from 'vitest'
import { createWorld, flush } from './world'

describe('fake world', () => {
  test('locks queue per name and are released when the callback settles', async () => {
    const world = createWorld()
    const a = world.openTab()
    const b = world.openTab()
    let releaseA!: () => void
    const order: string[] = []
    void a.env.navigator!.locks!.request('n', {}, () => {
      order.push('a')
      return new Promise<void>((resolve) => (releaseA = resolve))
    })
    void b.env.navigator!.locks!.request('n', {}, () => {
      order.push('b')
    })
    await flush()
    expect(order).toEqual(['a'])
    expect(world.lockHolder('n')).toBe(a)
    releaseA()
    await flush()
    expect(order).toEqual(['a', 'b'])
  })

  test('steal rejects the previous holder with AbortError', async () => {
    const world = createWorld()
    const a = world.openTab()
    const b = world.openTab()
    const held = a.env.navigator!.locks!.request('n', {}, () => new Promise(() => {}))
    await flush()
    void b.env.navigator!.locks!.request('n', { steal: true }, () => new Promise(() => {}))
    await expect(held).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(world.lockHolder('n')).toBe(b)
  })

  test('a frozen tab receives queued tasks only after unfreezing', async () => {
    const world = createWorld()
    const a = world.openTab()
    const b = world.openTab()
    const seen: string[] = []
    a.window.addEventListener('storage', (e: { key: string }) => seen.push(e.key))
    world.freeze(a)
    b.env.localStorage!.setItem('k', 'v')
    let fired = false
    a.env.setTimeout(() => (fired = true), 10)
    await world.advance(100)
    expect(seen).toEqual([])
    expect(fired).toBe(false)
    world.unfreeze(a)
    expect(seen).toEqual(['k'])
    await world.advance(0)
    expect(fired).toBe(true)
  })

  test('storage events go to other tabs only', () => {
    const world = createWorld()
    const a = world.openTab()
    const b = world.openTab()
    const seenA: string[] = []
    const seenB: string[] = []
    a.window.addEventListener('storage', (e: { key: string }) => seenA.push(e.key))
    b.window.addEventListener('storage', (e: { key: string }) => seenB.push(e.key))
    a.env.localStorage!.setItem('k', 'v')
    expect(seenA).toEqual([])
    expect(seenB).toEqual(['k'])
  })

  test('closing a tab drops its lock so the next request gets it', async () => {
    const world = createWorld()
    const a = world.openTab()
    const b = world.openTab()
    void a.env.navigator!.locks!.request('n', {}, () => new Promise(() => {}))
    let got = false
    void b.env.navigator!.locks!.request('n', {}, () => {
      got = true
      return new Promise(() => {})
    })
    await flush()
    world.closeTab(a)
    await flush()
    expect(got).toBe(true)
  })

  test('jumpClock moves the wall clock but timers fire after real elapsed time', async () => {
    const world = createWorld()
    const a = world.openTab()
    let at = 0
    a.env.setTimeout(() => (at = world.now), 1000)
    const start = world.now
    world.jumpClock(-5000)
    await world.advance(1000)
    expect(at).toBe(start - 5000 + 1000)
  })

  test('storage modes', () => {
    expect(() => createWorld({ storage: 'none' }).openTab().env.localStorage).toThrow()
    const broken = createWorld({ storage: 'broken' }).openTab()
    expect(() => broken.env.localStorage!.getItem('k')).toThrow()
    expect(createWorld({ locks: false }).openTab().env.navigator!.locks).toBeUndefined()
  })
})
