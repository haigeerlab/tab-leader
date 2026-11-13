import { expect, test } from 'vitest'

test('importing the package has no side effects and needs no browser globals', async () => {
  const before = Object.keys(globalThis).sort()
  const api = await import('../src/index')
  expect(typeof api.createTabLeader).toBe('function')
  expect(Object.keys(globalThis).sort()).toEqual(before)
  expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined')
})
