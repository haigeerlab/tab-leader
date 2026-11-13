import { describe, expect, test } from 'vitest'
import {
  browserEnv,
  createTabId,
  lockManager,
  readJson,
  removeKey,
  usableStorage,
  writeJson,
} from '../src/env'
import { createWorld } from './world'

describe('env', () => {
  test('browserEnv returns null outside a browser', () => {
    expect(browserEnv()).toBeNull()
  })

  test('lockManager detects Web Locks', () => {
    expect(lockManager(createWorld().openTab().env)).not.toBeNull()
    expect(lockManager(createWorld({ locks: false }).openTab().env)).toBeNull()
    const env = createWorld().openTab().env
    expect(lockManager({ ...env, navigator: null })).toBeNull()
    expect(
      lockManager({
        ...env,
        get navigator(): never {
          throw new Error('denied')
        },
      }),
    ).toBeNull()
  })

  test('usableStorage requires write, read back and remove to succeed', () => {
    const world = createWorld()
    const storage = usableStorage(world.openTab().env, 'p')
    expect(storage).not.toBeNull()
    expect(world.store.has('p')).toBe(false)
    expect(usableStorage(createWorld({ storage: 'none' }).openTab().env, 'p')).toBeNull()
    expect(usableStorage(createWorld({ storage: 'broken' }).openTab().env, 'p')).toBeNull()
    const env = createWorld().openTab().env
    expect(usableStorage({ ...env, localStorage: null }, 'p')).toBeNull()
    const lying = { getItem: () => '0', setItem: () => {}, removeItem: () => {} }
    expect(usableStorage({ ...env, localStorage: lying }, 'p')).toBeNull()
  })

  test('readJson distinguishes failure, missing and corrupt values', () => {
    const world = createWorld()
    const storage = usableStorage(world.openTab().env, 'p')!
    expect(readJson(storage, 'k')).toEqual({ ok: true, value: null })
    storage.setItem('k', '{bad')
    expect(readJson(storage, 'k')).toEqual({ ok: true, value: undefined })
    expect(writeJson(storage, 'k', { a: 1 })).toBe(true)
    expect(readJson(storage, 'k')).toEqual({ ok: true, value: { a: 1 } })
    expect(removeKey(storage, 'k')).toBe(true)
    world.storageBroken = true
    expect(readJson(storage, 'k')).toEqual({ ok: false })
    expect(writeJson(storage, 'k', 1)).toBe(false)
    expect(removeKey(storage, 'k')).toBe(false)
  })

  test('createTabId is unique without crypto', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createTabId(1)))
    expect(ids.size).toBe(100)
  })
})
