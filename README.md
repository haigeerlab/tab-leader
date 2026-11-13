# tab-leader

[English](README.en.md) | 中文

> **状态：0.1.0 已实现，尚未发布到 npm。** 发布前还要完成首个接入方的联调和旧版本浏览器实测，见[发布策略](docs/release.md#验证阶段)。

同一浏览器里，同一个网站开了多个标签页时，**某件事只让一个标签页去做**；这个标签页关闭、崩溃、进入前进／后退缓存或被浏览器冻结后，**由另一个标签页自动接手**。没有 Web Locks 的旧浏览器逐层降级。

- 零运行时依赖，import 时没有任何副作用，SSR 下可以安全 import
- 支持到 Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4，产物是 ES2017，不需要 polyfill
- Leader 被浏览器冻结（不释放锁、不派发 `pagehide`）时，其他标签页能接管
- 失去 Leader 时通知你，业务可以马上停手

## 适合做什么

| 场景 | 只让一个标签页做 |
|---|---|
| 在线状态上报、埋点 | 定时请求 |
| 消息未读数、通知 | 轮询 |
| WebSocket／SSE | 只建一条连接（分发给其他标签页需要自己做，见[示例](docs/guide/recipes.md#3-只建一条-websocket再分发给其他标签页)） |
| 令牌刷新 | 只让一个标签页去刷新 |
| 后台同步、缓存预热 | 只跑一份任务 |

## 安装

```bash
npm install tab-leader
```

## 快速上手

### 通用选主：`createTabLeader`

```ts
import { createTabLeader } from 'tab-leader'

const leader = createTabLeader({
  name: 'my-app:poller',               // 同名的标签页之间选主
  onLeader() { startPolling() },       // 当上 Leader：开始做事
  onFollower() { stopPolling() },      // 失去 Leader：立即停手
})
leader.start()

leader.isLeader      // 当前是否 Leader
leader.mode          // 'locks' | 'lease' | 'solo' | 'none'
leader.relinquish()  // 主动让出
leader.destroy()     // 停止
```

### 定时任务：`createTabInterval`

整个浏览器里每隔 `interval` 最多运行一次，刷新页面、换 Leader 都不会打破间隔：

```ts
import { createTabInterval } from 'tab-leader'

const task = createTabInterval({
  name: 'my-app:presence',
  interval: 3 * 60 * 1000,
  key: () => currentUserId(),   // 身份变了立即补一次
  run: () => reportPresence(),  // 失败不重试，不影响下个周期
})
task.start()
task.check()   // 立即检查一次（到期或 key 变了才运行，不强制）
```

完整参数见 [API 参考](docs/guide/api.md)，更多用法见[场景示例](docs/guide/recipes.md)。

## 工作原理

按浏览器能力从强到弱选一种方式，只做功能检测，不判断 UA：

```
Web Locks（locks）──不支持──▶ localStorage 租约（lease）──存储不可用──▶ 各自运行（solo）
```

- **locks**：浏览器保证同一时间只有一把锁。Leader 定期写一条存活记录；Leader 被冻结、记录长时间不更新时，其他标签页用 `steal` 接管。
- **lease**：用 localStorage 写一份带过期时间的租约，写入后再读回确认；Leader 定期续期，别的标签页看到租约过期就接手。
- **solo**：存储也不可用时，每个标签页各自运行，保证工作不停摆。

详细设计见[架构文档](docs/architecture/overview.md)。

## 保证程度

| 档 | 同一时间只有一个 Leader | 冻结后接管 |
|---|---|---|
| `locks` | 由浏览器保证（被抢锁的旧 Leader 解冻后有极短窗口） | 支持（需要 localStorage） |
| `lease` | **尽力保证**，可能有极短的双 Leader 窗口 | 租约过期后接管 |
| `solo` | **不保证**，每个标签页都是 Leader | 不涉及 |

**任何一档都不适合用来保证「绝对不能重复」的操作**（扣款、下单），这类需求请在后端做幂等。

## 浏览器兼容

| 浏览器 | 最低版本 | 走哪一档 |
|---|---|---|
| Chrome／Edge | 80 | `locks`（HTTPS）；HTTP 页面 `lease` |
| Firefox | 74 | 96 以前 `lease`，96 起 `locks` |
| Safari | 13.1 | 15.4 以前 `lease`，15.4 起 `locks` |
| iOS Safari | 12.4 | 15.4 以前 `lease`，15.4 起 `locks` |

哪些版本实测过、哪些是推断，见[兼容性文档](docs/compatibility.md)。

## 为什么不用现有的库

我们对比了 npm 上 11 个候选，没有一个同时满足「支持旧浏览器、冻结后能接管、失去 Leader 时通知、零依赖无副作用」。最接近的两个：

- [broadcast-channel](https://github.com/pubkey/broadcast-channel)：最成熟，覆盖旧浏览器；但在有 Web Locks 的新浏览器里接管不了被冻结的 Leader，也不通知失去，并且有 4 个运行时依赖。
- [tab-election](https://github.com/dabblewriter/tab-election)：新浏览器里设计完整；但离不开 Web Locks 和 BroadcastChannel，产物是 ES2020。

**这些情况你可能不需要本库：**

- 只支持新浏览器、只要一把锁 → 直接用 `navigator.locks.request`
- 只支持新浏览器、还要 Leader 和其他标签页通信 → [tab-election](https://github.com/dabblewriter/tab-election)
- 需要标签页之间收发消息 → [broadcast-channel](https://github.com/pubkey/broadcast-channel)

完整对比和我们借鉴了哪些库的什么设计，见[选型调研](docs/research/selection.md)和[架构文档第 7 节](docs/architecture/overview.md#7-设计来源)。

## 已知限制

- `lease` 档只能尽力保证唯一。
- 系统时钟往前跳会让间隔看起来提前满足，需要严格限频时请在后端按服务端时间去重。
- 后台计时器会被浏览器节流，`createTabInterval` 的实际间隔可能比设定值多出约 1 分钟。
- 有 Web Locks 但 localStorage 不可用时，不做冻结接管，`createTabInterval` 每次刷新都会立即运行一次。
- 0.x 不提供标签页之间的消息分发。

## 文档

| 文档 | 内容 |
|---|---|
| [API 参考](docs/guide/api.md) | 每个函数、参数、默认值 |
| [场景示例](docs/guide/recipes.md) | 定时上报、轮询、WebSocket、令牌刷新 |
| [迁移说明](docs/guide/migration.md) | 从自研实现迁移：沿用旧的名字和存储格式、新旧实现混开 |
| [架构](docs/architecture/overview.md) | 分层、降级链、状态机、冻结接管、设计来源 |
| [选型调研](docs/research/selection.md) | 与 11 个现有方案的多维度对比 |
| [兼容性](docs/compatibility.md) | 浏览器范围与实测证据 |
| [发布策略](docs/release.md) | 版本号、`next`／`latest` 标签 |
| [架构决策](docs/adr/) | 关键决定及其理由 |

## 参与贡献

欢迎提 Issue 和 PR，开始前请读[贡献指南](CONTRIBUTING.md)。安全问题请按[安全策略](SECURITY.md)私下报告，不要开公开 Issue。

## 许可证

[MIT](LICENSE) © 2026 haigeerlab
