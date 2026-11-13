# API 参考

> 状态：**草案**（0.1.0 实现前）。实现完成后以 `src/types.ts` 的类型定义为准定稿；本文与类型定义不一致时以类型定义为准，并修正本文。
> 行为细节的唯一事实源是需求文档 [spec/tab-leader.md](../../spec/tab-leader.md)。

```ts
import { createTabLeader, createTabInterval } from 'tab-leader'
```

包只导出这两个函数和它们的类型，没有默认导出，import 时没有任何副作用。

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
| `destroy()` | 停止参选，移除所有事件监听，释放锁或删掉自己的租约。是 Leader 时会先调 `onFollower` |
| `isLeader` | 只读，当前是否 Leader |
| `mode` | 只读，`'locks' \| 'lease' \| 'solo' \| 'none'`。`start()` 之前和非浏览器环境为 `'none'` |

---

## createTabInterval(options)

只在 Leader 上运行、跨标签页限频的定时任务：**整个浏览器里每 `interval` 毫秒最多运行一次**，刷新页面、换 Leader 都不会打破间隔。

```ts
const task = createTabInterval({
  name: 'my-app:report',
  interval: 3 * 60 * 1000,
  key: () => currentUserId(),   // 身份变了立即补一次
  run: () => fetch('/api/report', { method: 'POST' }),
})
task.start()
// 本页里登录状态变化后：
task.check()
```

### 选项

除了下面三项，其余与 `createTabLeader` 相同（不含 `onLeader`、`onFollower`）。

| 选项 | 类型 | 说明 |
|---|---|---|
| `interval` | `number`（毫秒） | 两次运行的最小间隔，严格判断，差 1 毫秒也不运行 |
| `run` | `() => unknown` | 要做的事。返回值被忽略；同步抛错和 Promise 拒绝都被吞掉，不重试 |
| `key` | `() => string` | 可选。运行上下文的标识，和上次运行时不同就立即运行。抛错时沿用上次的值 |

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

这些 key 和记录格式是兼容性承诺的一部分，见 [ADR-0003](../adr/0003-name-as-key-and-record-compat.md)。

## 保证程度

见 [README](../../README.md#保证程度) 和[兼容性文档](../compatibility.md)。
