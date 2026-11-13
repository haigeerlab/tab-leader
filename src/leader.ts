import { createCore } from './core'
import type { TabLeader, TabLeaderOptions } from './types'

/** Elect one leader among same-origin tabs sharing `options.name`. Call `start()` to begin. */
export function createTabLeader(options: TabLeaderOptions): TabLeader {
  const core = createCore(options, { onLeader: options.onLeader, onFollower: options.onFollower })
  return {
    start: core.start,
    relinquish: core.relinquish,
    destroy: core.destroy,
    get isLeader() {
      return core.isLeader
    },
    get mode() {
      return core.mode
    },
  }
}
