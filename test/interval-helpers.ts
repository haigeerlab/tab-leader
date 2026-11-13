import { createTabInterval } from '../src/interval'
import type { TabInterval, TabIntervalOptions } from '../src/types'
import type { Tab, World } from './world'

export const SEC = 1000
export const MIN = 60 * SEC
export const INTERVAL = 3 * MIN

export interface Runner {
  tab: Tab
  task: TabInterval
  identity: string
}

/** Every run across all tabs, in order. */
export function createLog() {
  const runs: Array<{ at: number; tab: number; identity: string; name: string }> = []
  return {
    runs,
    times: (name = 'app') => runs.filter((r) => r.name === name).map((r) => r.at),
  }
}

export function openTask(
  world: World,
  log: ReturnType<typeof createLog>,
  options: Partial<TabIntervalOptions> = {},
  tab: Tab = world.openTab(),
): Runner {
  const name = options.name ?? 'app'
  const runner = { tab, identity: 'guest' } as Runner
  runner.task = createTabInterval({
    name,
    interval: INTERVAL,
    key: () => runner.identity,
    run: () => {
      log.runs.push({ at: world.now, tab: tab.id, identity: runner.identity, name })
    },
    ...options,
    env: tab.env,
  })
  runner.task.start()
  return runner
}

export const gaps = (times: number[]): number[] => times.slice(1).map((t, i) => t - times[i]!)
