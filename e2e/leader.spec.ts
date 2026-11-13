import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/** Short timings so takeovers happen within a second or two. */
const FAST = 'leaseTtl=900&leaseRenewInterval=200&leaseConfirmDelay=30&aliveInterval=200&stallTimeout=600'

interface DemoState {
  isLeader: boolean
  mode: string
  events: string[]
  runs: number[]
}

declare global {
  interface Window {
    demo: {
      leader: { isLeader: boolean; mode: string }
      events: Array<{ text: string }>
      runs: number[]
    }
  }
}

function demoUrl(query: string): string {
  return `/demo/?${query}&${FAST}`
}

async function openPages(context: BrowserContext, query: string, count: number): Promise<Page[]> {
  const pages: Page[] = []
  for (let i = 0; i < count; i++) {
    const page = await context.newPage()
    await page.goto(demoUrl(query))
    await page.waitForFunction(() => !!window.demo && window.demo.leader.mode !== 'none')
    pages.push(page)
  }
  return pages
}

function read(page: Page): Promise<DemoState> {
  return page.evaluate(() => ({
    isLeader: window.demo.leader.isLeader,
    mode: window.demo.leader.mode,
    events: window.demo.events.map((e) => e.text),
    runs: window.demo.runs.slice(),
  }))
}

async function leaderIndexes(pages: Page[]): Promise<number[]> {
  const states = await Promise.all(pages.map(read))
  return states.flatMap((s, i) => (s.isLeader ? [i] : []))
}

/** Waits until exactly one page leads, and returns its index. */
async function singleLeader(pages: Page[]): Promise<number> {
  let found: number[] = []
  await expect
    .poll(async () => {
      found = await leaderIndexes(pages)
      return found.length
    })
    .toBe(1)
  // Stays single: no second leader shows up shortly after.
  await pages[0]!.waitForTimeout(500)
  expect(await leaderIndexes(pages)).toEqual(found)
  return found[0]!
}

for (const strategy of ['auto', 'lease'] as const) {
  const mode = strategy === 'auto' ? 'locks' : 'lease'

  test(`${mode}: one leader among three pages; another takes over when it closes`, async ({ context }) => {
    const pages = await openPages(context, `strategy=${strategy}&name=e2e-${mode}`, 3)
    for (const page of pages) expect((await read(page)).mode).toBe(mode)

    const first = await singleLeader(pages)
    await pages[first]!.close()
    const rest = pages.filter((_, i) => i !== first)
    const second = await singleLeader(rest)

    // Callbacks are paired: the new leader saw exactly one onLeader.
    const events = (await read(rest[second]!)).events
    expect(events.filter((e) => e === 'onLeader')).toHaveLength(1)
  })
}

test('solo: every page is a leader', async ({ context }) => {
  const pages = await openPages(context, 'strategy=solo&name=e2e-solo', 3)
  for (const page of pages) {
    await expect.poll(async () => (await read(page)).isLeader).toBe(true)
    expect((await read(page)).mode).toBe('solo')
  }
})

test('interval: runs at most once per interval across pages', async ({ context }) => {
  const interval = 1000
  const pages = await openPages(context, `interval=${interval}&name=e2e-interval`, 3)
  await pages[0]!.waitForTimeout(3600)
  const runs = (await Promise.all(pages.map(read))).flatMap((s) => s.runs).sort((a, b) => a - b)
  // The leader runs right away and then every second; the gap check below is what bounds the count.
  expect(runs.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < runs.length; i++) expect(runs[i]! - runs[i - 1]!).toBeGreaterThanOrEqual(interval)
})

test('frozen leader is taken over and steps down after resuming (Chromium only)', async ({
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Pausing a page needs the Chrome DevTools Protocol (Chromium only)')
  const pages = await openPages(context, 'name=e2e-freeze', 2)
  const first = await singleLeader(pages)
  const leader = pages[first]!
  const other = pages[1 - first]!

  // Page.setWebLifecycleState only freezes hidden pages, and automated pages always report visible.
  // Pausing the page's JavaScript has the same effect: the lock stays held and no alive record is written.
  const cdp = await context.newCDPSession(leader)
  await cdp.send('Debugger.enable')
  await cdp.send('Debugger.pause')
  // The follower notices the stale alive record (stallTimeout 600 ms) and steals the lock.
  await expect.poll(async () => (await read(other)).isLeader, { timeout: 5000 }).toBe(true)

  await cdp.send('Debugger.resume')
  await cdp.send('Debugger.disable')
  // The old leader learns its lock was stolen and steps down.
  await expect.poll(async () => (await read(leader)).isLeader, { timeout: 5000 }).toBe(false)
  expect((await read(leader)).events).toContain('onFollower')
  expect(await leaderIndexes(pages)).toEqual([1 - first])
})

test('bfcache: a page leaving and returning does not leave two leaders (best effort)', async ({
  context,
}) => {
  const pages = await openPages(context, 'name=e2e-bfcache', 2)
  const first = await singleLeader(pages)
  const leaving = pages[first]!
  const other = pages[1 - first]!
  // A value on window survives only if the page itself is restored from the back/forward cache.
  await leaving.evaluate(() => {
    ;(window as unknown as { bfcacheMarker?: boolean }).bfcacheMarker = true
  })
  await leaving.goto('/demo/?name=e2e-bfcache-elsewhere')
  // While it is away, the other page leads.
  await expect.poll(async () => (await read(other)).isLeader).toBe(true)

  await leaving.goBack()
  const restored = await leaving.evaluate(
    () => (window as unknown as { bfcacheMarker?: boolean }).bfcacheMarker === true,
  )
  test.skip(!restored, 'This engine did not restore the page from bfcache under automation')
  // Restored page rejoins as follower; still exactly one leader.
  await singleLeader(pages)
  expect(await leaderIndexes(pages)).toEqual([1 - first])
})
