import { createTabLeader } from '../src/leader'
import type { TabLeader, TabLeaderOptions } from '../src/types'
import type { Tab, World } from './world'

export interface Member {
  tab: Tab
  leader: TabLeader
  /** 'L' for onLeader, 'F' for onFollower, in call order. */
  events: string[]
}

/** Open a tab running a started leader. */
export function join(
  world: World,
  options: Partial<TabLeaderOptions> = {},
  tab: Tab = world.openTab(),
): Member {
  const events: string[] = []
  const leader = createTabLeader({
    name: 'app',
    onLeader: () => events.push('L'),
    onFollower: () => events.push('F'),
    ...options,
    env: tab.env,
  })
  leader.start()
  return { tab, leader, events }
}

export const leaders = (members: Member[]): Member[] => members.filter((m) => m.leader.isLeader)

/** Events must alternate L, F, L, ... starting with L (R15). */
export function alternates(events: string[]): boolean {
  return events.every((e, i) => e === (i % 2 === 0 ? 'L' : 'F'))
}
