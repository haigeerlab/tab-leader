# 选型调研：为什么要做一个新库

> 调研日期：2026-11-13。所有结论来自 npm 上**已发布 tarball 里的源码和产物**（不是只看 README），文件路径相对于各包根目录；版本、发布日期、许可证来自 npm registry，周下载来自 `api.npmjs.org/downloads/point/last-week/<包名>`。
> 标「未实测」的是读代码得出的推断，没有在浏览器里跑过。数据会过时，引用前请按同样的方法重新核对。

## 1. 我们要什么

四个硬要求（需求文档 §1.2），缺一不可：

1. **支持没有 Web Locks 的旧浏览器**：Safari 13.1、Firefox 74、iOS 12.4，产物不能用这些浏览器解析不了的语法。
2. **Leader 被冻结时能接管**：后台页面被浏览器冻结后，计时器停止、不派发 `pagehide`、Web Lock 不释放。
3. **失去 Leader 时通知业务**：被抢、让出、页面进入 bfcache 时，业务要能马上停手。
4. **零运行时依赖、无全局副作用**：import 不改全局对象，SSR 下 import 安全。

## 2. 候选

用「tab leader election」「leader election browser tabs」「web locks polyfill」「cross tab leader」在 npm 上搜索，加上已知的库，共 11 个。其中 3 个不是浏览器多标签页选主库，只简单说明：

| 包 | 是什么 | 为什么排除 |
|---|---|---|
| `@zukhruf/election` 0.8.15 | Node／SQLite 的进程选主 | 不是浏览器库。但它的「任期号（epoch）」思路与我们的代次（R14）是同一类做法 |
| `web-locks` 0.0.9（metarhia） | Node.js 的 Web Locks 实现（基于 `worker_threads`） | 不是浏览器库 |
| `browser-tabs-lock` 1.3.0（supertokens） | 基于 localStorage 的**互斥锁** | 不是选主，没有 Leader 概念和回调；依赖 `lodash`；2023 年后没有发布 |

## 3. 多维度对比

### 3.1 能力

| 包 | 版本／最近发布 | 选主机制与回退顺序 | 无 Web Locks 时 | 冻结接管 | 失去 Leader 通知 | 主动让出 |
|---|---|---|---|---|---|---|
| **broadcast-channel**（pubkey） | 7.4.0／2026-08-03 | 有 Web Locks 用锁；否则用基于消息的经典算法（消息通道依次退到 IndexedDB、localStorage） | ✅ 经典算法 | ❌ Web Locks 模式持锁不放、无 steal、无心跳；经典模式超时后可自立，可能出现双 Leader（未实测） | ❌ Web Locks 模式下 `onduplicate` 是空操作 | `die()` |
| **tab-election**（dabblewriter） | 4.6.2／2026-07-20 | 只用 Web Locks + BroadcastChannel | ❌ 两者缺一不可 | `Tab` 层 ❌；`Hub` 层 ✅：Leader 每 2 秒心跳，断开后 `steal`，退避 10～300 秒 | ✅ `leadershipchange` 事件 | ✅ `relinquishLeadership()` |
| **tabs-broadcast**（Rovniy） | 4.2.2／2026-10-15 | 有 Web Locks 用锁；否则 localStorage + `storage` 事件 | ⚠️ 有 localStorage 回退，但整体依赖 BroadcastChannel（Safari 15.4+） | Web Locks 模式 ❌；localStorage 模式 ✅（2 秒刷新、5 秒判死） | ❌ 只有 `onBecomePrimary` | 只有 `destroy()` |
| **navigator.locks**（aermin） | 0.9.1／2026-08-04 | 不是选主库，是 Web Locks 的 localStorage polyfill | ✅（就是为此而生） | ✅ 每秒心跳，约 3.1 秒判死并清理锁 | ❌ 无回调；被 steal 的请求以异常拒绝 | — |
| **web-locks-polyfill**（bitovi） | 0.0.13／2021-04-09 | Web Locks 的 localStorage polyfill | ✅ | 锁约 2 秒过期；主线程长任务超过 2 秒可能两个回调同时运行（README 自述） | ❌ | — |
| **tab-elect**（xuset） | 0.1.2／2017-04-14 | IndexedDB 原子写入当锁 + 消息通知 | ✅（依赖 IndexedDB） | ❌ 无心跳，崩溃或冻结的锁一直留在 IndexedDB | ✅ `deposed` 事件 | ✅ `stepDown()` |
| **TanStack offline-transactions**（内置选主） | 1.2.1／2026-11-11 | Web Locks → BroadcastChannel 心跳 → 永远当 Leader；可注入自定义实现 | ⚠️ BroadcastChannel 也要 Safari 15.4+ | ❌ Web Locks 模式无 steal；追随者探测失败后没有重试（未实测） | ✅ `onLeadershipChange` | `releaseLeadership()` |
| **leader-tab**（frectonz） | 0.0.4／2025-04-15 | 纯 BroadcastChannel 心跳（50 毫秒），UUID 最小者当选 | ❌ 需要 BroadcastChannel 和 `crypto.randomUUID` | ✅ 500 毫秒判死；后台计时器节流时容易误判（未实测） | ✅ `onLeaderDemoted` | 只有 `destroy()` |

### 3.2 工程与生态

| 包 | 产物语法 | 运行时依赖 | import 时的全局副作用 | 周下载 | 许可证 |
|---|---|---|---|---|---|
| broadcast-channel | ES5（Babel） | 4 个：`unload`、`p-queue`、`oblivious-set`、`@babel/runtime` | 无 | 约 401 万 | MIT |
| tab-election | ES2020（产物含 `?.`、`??`、对象展开） | 0 | 无 | 约 1.85 万 | MIT |
| tabs-broadcast | ES2022（含私有字段 `#`、`?.`、可选 catch 绑定） | 0 | 无 | 69 | MIT |
| navigator.locks | 已降级（未逐项核对） | 0 | ⚠️ 没有 `navigator.locks` 时**改写全局对象**；构造时启动每秒心跳 | 约 4 万 | MIT |
| web-locks-polyfill | — | 0 | ⚠️ **import 即给 `navigator.locks` 打补丁**；不支持 `steal` 等选项 | 1212 | MIT |
| tab-elect | ES5 | 2 个：`idb-kv-store`、`inherits` | 无 | 473 | MIT |
| TanStack offline-transactions | 无 `?.`、`??` | 未核对 | 无 | 约 9.5 万（整个包，选主只是内部功能） | MIT |
| leader-tab | 无 `?.`、`??` | 0 | 无 | 7 | MIT |

### 3.3 对照四个硬要求

| 包 | ① 旧浏览器 | ② 冻结接管 | ③ 失去通知 | ④ 零依赖无副作用 | 结论 |
|---|---|---|---|---|---|
| broadcast-channel | ✅ | ❌（Web Locks 模式） | ❌ | ❌ 4 个依赖 | 最成熟、下载量最大，但在有 Web Locks 的新浏览器里恰恰无法接管被冻结的 Leader |
| tab-election | ❌ | ⚠️ 仅 Hub 层 | ✅ | ✅ | 现代浏览器下设计最好，但产物 ES2020，并且离不开 Web Locks 和 BroadcastChannel |
| tabs-broadcast | ❌ | ⚠️ 仅 localStorage 模式 | ❌ | ✅ | 思路对，但产物 ES2022、依赖 BroadcastChannel，几乎没人用 |
| navigator.locks | ✅ | ✅ | ❌ | ❌ 改写全局对象 | 不是选主库；秒级心跳在后台节流时容易误判 |
| web-locks-polyfill | ✅ | ⚠️ | ❌ | ❌ 改写全局对象 | 不支持 `steal`；长期不维护 |
| tab-elect | ✅ | ❌ | ✅ | ❌ 2 个依赖 | 2017 年后不维护 |
| TanStack（内置） | ❌ | ❌ | ✅ | — | 不是独立库 |
| leader-tab | ❌ | ⚠️ | ✅ | ✅ | 依赖 BroadcastChannel；50 毫秒心跳太激进 |

**没有一个同时满足四条。** 最接近的两个各缺一块：broadcast-channel 能覆盖旧浏览器，但在新浏览器里接管不了冻结的 Leader，也不通知失去；tab-election 在新浏览器里设计完整，但覆盖不了旧浏览器。

### 3.4 只用原生 Web Locks 行不行

在只面向新浏览器（Chrome 69+、Firefox 96+、Safari／iOS 15.4+）时，原生 Web Locks 已经很强：锁随页面销毁自动释放，正常关闭和崩溃都不需要额外处理；`{ ifAvailable: true }` 可以探测，`{ steal: true }` 可以强抢。但仍然缺三样：

1. **没有「失去 Leader」的通知**，只有被 steal 时持有者的 Promise 以 `AbortError` 拒绝；
2. **冻结的持有者不释放锁**，什么时候该 steal 要自己做存活检测；
3. **旧浏览器没有它**，要自己做回退。

本库做的就是把这三样补上。

## 4. 什么时候不该用 tab-leader

| 你的情况 | 更合适的选择 |
|---|---|
| 只支持新浏览器，只要一把锁 | 直接用 `navigator.locks.request`，十几行代码 |
| 只支持新浏览器，需要选主加 Leader 与其他标签页 RPC | [tab-election](https://github.com/dabblewriter/tab-election) |
| 需要标签页之间可靠地收发消息（本库 0.x 不做） | [broadcast-channel](https://github.com/pubkey/broadcast-channel) |
| 只需要防止多个标签页同时执行一段代码（比如防重复刷新令牌），不需要 Leader | [browser-tabs-lock](https://github.com/supertokens/browser-tabs-lock) 或原生 Web Locks |
| 要求「绝对不能重复」（扣款、下单） | 任何前端选主都做不到，用后端幂等 |

## 5. 决定

自己做 `tab-leader`，借鉴上面各库的思路，不复制代码。借鉴了什么、对应本库哪条规则，见[架构文档第 7 节](../architecture/overview.md#7-设计来源)；决定本身记录在 [ADR-0001](../adr/0001-build-instead-of-reuse.md)。

## 附：浏览器支持数据

来源：`@mdn/browser-compat-data` 8.1.9。

| 特性 | Chrome | Edge | Firefox | Safari | iOS Safari | Samsung Internet | Chrome Android |
|---|---|---|---|---|---|---|---|
| Web Locks（`navigator.locks`） | 69 | 79 | 96 | 15.4 | 15.4 | 10.0 | 69 |
| BroadcastChannel | 54 | 79 | 38 | 15.4 | 15.4 | 6.0 | 54 |
| `storage` 事件 | 1 | 12 | 13 | 4 | 3 | 1.0 | 18 |
| localStorage | 4 | 12 | 3.5 | 4 | 3.2 | 1.0 | 18 |

- BCD 没有 `steal`、`ifAvailable` 选项单独的数据；规范上它们是 `request` 的选项，按与 `request` 同版本可用处理，本库的真实浏览器测试会覆盖 `steal`。
- Web Locks 只在安全上下文（HTTPS 或 localhost）里可用。
