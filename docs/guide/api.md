# API 参考

> 对应版本：0.3.0。本文按 `src/types.ts` 的类型定义写成，两者不一致时以类型定义为准，并修正本文。
> 行为细节的唯一事实源是需求文档 [spec/tab-leader.md](../../spec/tab-leader.md)。

```ts
import { createTabLeader, createTabInterval } from 'tab-leader'
```

包只导出这两个函数和下面这些类型，没有默认导出，import 时没有任何副作用：

```ts
import type {
  TabLeader, TabLeaderOptions, TabLeaderStrategy, TabLeaderMode,
  TabInterval, TabIntervalOptions,
  TabLeaderEnv, TabLeaderLockManager, // 仅测试注入环境时用到
} from 'tab-leader'
```

---

## createTabLeader(options)

同名的标签页之间选一个 Leader。返回 `TabLeader`，**调用 `start()` 之后才开始工作**。

```ts
const leader = createTabLeader({
  name: 'my-app:poller',
  onLeader() { startPolling() },
  onFollower() { stopPolling() },
})
leader.start()
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | `string` | 必填 | 同名的标签页之间选主，不同名互不影响。原样用作锁名和 localStorage key 前缀，请选一个不会和你自己的 key 冲突的名字 |
| `onLeader` | `() => void` | — | 成为 Leader 时调用 |
| `onFollower` | `() => void` | — | 失去 Leader 时调用（让出、被抢、页面进入 bfcache、降级前、`destroy`）。与 `onLeader` 严格交替 |
| `strategy` | `'auto' \| 'lease' \| 'solo'` | `'auto'` | 从哪一档开始尝试，不可用时继续往下降。`'lease'` 常用于测试旧浏览器路径 |
| `leaseTtl` | `number`（毫秒） | `150000` | 租约有效期 |
| `leaseRenewInterval` | `number` | `60000` | 租约续期间隔，也是追随者检查租约的间隔 |
| `leaseConfirmDelay` | `number` | `50` | 写入租约后等多久读回确认 |
| `aliveInterval` | `number` | `60000` | Web Locks 档 Leader 写存活记录的间隔，也是追随者检查停摆的间隔 |
| `stallTimeout` | `number` | `180000` | 存活记录多久没更新算停摆，超过后追随者抢锁接管 |
| `env` | `TabLeaderEnv` | 浏览器全局对象 | 仅用于测试 |

回调里抛出的异常会被捕获并异步重新抛出（控制台可见），不会打断选主。

### 返回值 `TabLeader`

| 成员 | 说明 |
|---|---|
| `start()` | 检测能力、注册生命周期事件、参选。重复调用无效；`destroy()` 之后调用无效 |
| `relinquish()` | 主动让出。Web Locks 档排到队尾（没有别人排队时会马上重新当选）；租约档等一个续期间隔再参选；solo 档无效 |
| `requestLeadership()` | 0.3.0 起。本标签页不是 Leader 时主动抢主：Web Locks 档抢锁，租约档覆盖租约，原 Leader 让出并收到 `onFollower`。已是 Leader、solo 档、`start()` 之前、页面进入 bfcache 期间、`destroy()` 之后调用无效。详见下文 |
| `destroy()` | 停止参选，移除所有事件监听，释放锁或删掉自己的租约。是 Leader 时会先调 `onFollower` |
| `isLeader` | 只读，当前是否 Leader |
| `mode` | 只读，`'locks' \| 'lease' \| 'solo' \| 'none'`。`start()` 之前和非浏览器环境为 `'none'` |

### 主动抢主 `requestLeadership()`

选谁当 Leader 默认是先来后到。想让某个标签页（通常是用户正在看的那个）当 Leader，就在它上面调用 `requestLeadership()`：

```ts
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') leader.requestLeadership()
})
```

- **结果是异步的**：调用返回时 `isLeader` 还是 `false`；Web Locks 档在浏览器授予锁之后、租约档在 `leaseConfirmDelay` 之后成为 Leader，照常调用 `onLeader`。`onLeader`／`onFollower` 仍严格交替。
- **原 Leader 怎么让出**：Web Locks 档它的锁被抢走，收到 `onFollower` 后重新排队；租约档它在收到租约的 `storage` 事件、下一次续期核对（或 `createTabInterval` 运行前的核对）时发现租约不是自己的，收到 `onFollower`。
- **租约档只能尽力保证**：两个标签页几乎同时写租约时，以最后写入的为准；没抢到的保持追随者，不会自动重试。
- **可能短暂出现两个 Leader**：原 Leader 正被系统暂停（后台冻结、iOS 切到后台）时收不到通知，恢复后、让出前它仍认为自己是 Leader。业务回调要能容忍这个短暂窗口。
- **不要在 `focus` 里无条件调用**：并排可见的几个窗口会来回互抢，每次换主都会调一次 `onFollower`／`onLeader`。库不做退避或限流，几个标签页先后调用时最后一个当选。`visibilitychange` 变为 `visible` 只发生在切到这个标签页时，适合用来触发。
- `createTabInterval` 没有这个方法。

## 快速接管

默认的时长参数偏保守：Leader 被冻结后，Web Locks 档约 3～4 分钟、租约档约 150 秒才有人接手。如果 Leader 承担的是要尽快恢复的事（例如多个标签页共用的一条长连接），可以接受更频繁的 localStorage 读写，就把时长调短。不改参数时行为与以前相同。

### 推荐参数

`createTabLeader` 和 `createTabInterval` 都适用：

```ts
const fastTakeover = {
  leaseTtl: 6000,
  leaseRenewInterval: 2000,
  aliveInterval: 2000,
  stallTimeout: 6000,
}

const leader = createTabLeader({ name: 'my-app:socket', ...fastTakeover, onLeader, onFollower })
```

**依据**：[兼容性文档](../compatibility.md) 3.2 节的旧版本浏览器实测用的就是这组参数。Chrome 80 冻结 Leader 后约 5 秒由别的标签页接手（`locks` 档 4.8 秒、`lease` 档 5.1 秒）；Firefox 74、Safari 13.1 把 Leader 所在窗口最小化 60 秒，没有误换 Leader。

### 下限

自己调参数时不要低于：

- `leaseRenewInterval`、`aliveInterval` 不低于 1000 毫秒。后台标签页的计时器每秒最多执行一次，更短会把正常的后台 Leader 误判成停摆。
- `leaseTtl` ≥ 3 × `leaseRenewInterval`。
- `stallTimeout` ≥ 3 × `aliveInterval`。

### 还没验证过的情况

**所有标签页都在后台**时，用这组参数会频繁换 Leader。下面是在 Chrome 158（macOS）上的实测，过程见[兼容性文档](../compatibility.md) 3.3 节：

- **强力节流约 1 分钟内就开始**，不是 5 分钟：页面进入后台 20～60 秒后，计时器大约每分钟才执行一次，续租和存活记录都远晚于 6 秒。
- **`lease` 档约每 1～2 分钟换一次 Leader，中间可能有约 1 分钟没有 Leader**：租约来不及续就过期，别的标签页会去抢。0.3.0 在这种情况下会一直选不出 Leader（实测约 7.5 分钟），`createTabInterval` 也不再运行；修复后确认或续期晚于租约过期、但租约仍是自己的，就续写并当选／保持，实测 9 分钟内最长 60 秒没有 Leader。
- **`locks` 档约每分钟换一次 Leader**：锁始终有人持有，没有无 Leader 的空档；但每分钟 2～3 个标签页同时判定停摆、先后抢锁，几毫秒内 `onLeader` 被调好几次。
- 两档的 `createTabInterval` 都仍然满足「每 `interval` 毫秒最多运行一次」。0.3.0 的 `locks` 档在这种情况下实测出现过两个标签页在同一个 `interval` 内各运行一次，已修复：抢锁接手的新 Leader 先等 1 秒再检查（见下文 `createTabInterval`）。

如果所有标签页都可能长时间在后台，不要用这组参数，或者让业务能容忍上面的情况。

以下**未测**：

- 默认时长参数下所有标签页都在后台。
- 只有部分标签页在后台、至少一个在前台时，后台 Leader 是否会被误判停摆。
- Chrome 以外的浏览器；修复后的行为只在接通电源时的 Chrome 上实测过（0.3.0 那次用电池供电）。
- iOS Safari 暂停后台标签页时，预计与上面类似。

每次换 Leader 都会调 `onFollower`／`onLeader`，业务要能承受。前台标签页在变为可见时调用 [`requestLeadership()`](#主动抢主-requestleadership)，可以把 Leader 稳定在用户正在看的标签页上。

---

## createTabInterval(options)

只在 Leader 上运行、跨标签页限频的定时任务：**整个浏览器里每 `interval` 毫秒最多运行一次**，刷新页面、换 Leader 都不会打破间隔。

```ts
const task = createTabInterval({
  name: 'my-app:report',
  interval: 3 * 60 * 1000,
  key: () => currentUserId(),   // 身份变了立即补一次
  canRun: () => pageUserId() === currentUserId(), // 本页身份与共享身份不一致时跳过
  run: () => fetch('/api/report', { method: 'POST' }),
})
task.start()
// 本页里登录状态变化后：
task.check()
```

### 选项

除了下面四项，其余与 `createTabLeader` 相同（不含 `onLeader`、`onFollower`）。

| 选项 | 类型 | 说明 |
|---|---|---|
| `interval` | `number`（毫秒） | 两次运行的最小间隔，严格判断，差 1 毫秒也不运行 |
| `run` | `() => unknown` | 要做的事。返回值被忽略；同步抛错和 Promise 拒绝都被吞掉，不重试 |
| `key` | `() => string` | 可选。运行上下文的标识，和上次运行时不同就立即运行。抛错时沿用上次的值，不会因此触发运行 |
| `canRun` | `() => boolean` | 可选（0.2.0 起）。本页现在能不能运行。每次检查时、读上次运行记录之前调用；只有返回 `false` 才跳过：本轮不读写记录、不调用 `key` 和 `run`，**1 秒后**再检查（固定间隔，不可配置）。**抛错按 `true` 处理**，照常运行，与 `key` 抛错时不运行相反 |

`canRun` 的几点说明：

- 跳过不会推后间隔：条件恢复后，没有记录、`key` 变了或已到期就立即运行（最多晚 1 秒），否则照常等到期。
- 一直返回 `false` 期间，Leader 每秒调用一次 `canRun`，任务不运行；页面在后台时计时器会被浏览器节流，这个 1 秒也可能被拉长。请让它保持同步、便宜。
- `check()`、切回前台、成为 Leader 时也会先问 `canRun`；失去 Leader 或 `destroy()` 之后不再调用。
- 只有 Leader 调用 `canRun`；Leader 跳过时其他标签页也不会运行。

Web Locks 档的新 Leader 如果是**抢锁接手**的（原 Leader 被判定停摆），先等 **1 秒**再检查是否到期（固定间隔，不可配置），这 1 秒内 `check()`、切回前台也不运行。原因是原 Leader 可能就在同一时刻运行过，它写下的上次运行记录要过几毫秒才能被别的标签页读到。原 Leader 关闭、让出后的正常交接不等。这 1 秒只作用于 `createTabInterval`：`createTabLeader` 无论是停摆接管还是调用 `requestLeadership()` 抢主，当选后都立即调用 `onLeader`，不等。

### 返回值 `TabInterval`

| 成员 | 说明 |
|---|---|
| `start()` | 开始参选 |
| `check()` | 立即检查一次：是 Leader 且（到期或 `key` 变了）才运行。**不强制运行** |
| `destroy()` | 停止 |
| `isLeader`、`mode` | 同 `TabLeader` |

---

## 存储 key

以 `name = 'my-app:report'` 为例，库会使用：

| key | 用途 |
|---|---|
| Web Locks 锁 `my-app:report` | Web Locks 档的锁 |
| `my-app:report:lease` | 租约档的租约 |
| `my-app:report:alive` | Web Locks 档的存活记录 |
| `my-app:report:last` | `createTabInterval` 的上次运行记录 |
| `my-app:report:probe` | 启动时检测 localStorage 是否可用，用完即删 |

这些 key 和记录格式是兼容性承诺的一部分，见 [ADR-0003](../adr/0003-name-as-key-and-record-compat.md)；记录的具体格式和从自研实现迁移的做法见[迁移说明](migration.md)。

## 保证程度

见 [README](../../README.md#保证程度) 和[兼容性文档](../compatibility.md)。
