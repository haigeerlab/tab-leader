# 浏览器兼容性

> 本文是浏览器支持范围和实测证据的唯一事实源。**每一行都标明证据**：「实测」写明浏览器版本、日期、结论；没测过的标「推断」。推断不能写成「支持」。

## 1. 支持范围

| 浏览器 | 最低版本 | 预期走哪一档 | 依据 |
|---|---|---|---|
| Chrome | 80 | `locks`（HTTPS）；HTTP 页面 `lease` | Chrome 69 起有 Web Locks，只在安全上下文可用 |
| Edge（Chromium） | 80 | 同 Chrome | Edge 79 起有 Web Locks |
| Firefox | 74 | 74～95：`lease`；96 起：`locks` | Firefox 96 起有 Web Locks |
| Safari（Mac） | 13.1 | 13.1～15.3：`lease`；15.4 起：`locks` | Safari 15.4 起有 Web Locks |
| iOS Safari | 12.4 | 12.4～15.3：`lease`；15.4 起：`locks` | iOS 15.4 起有 Web Locks |
| Android Chrome、App 内置 WebView | 跟随系统 | 按功能检测 | — |
| 任意浏览器、localStorage 被禁用 | — | 有 Web Locks 走 `locks`（无停摆接管）；否则 `solo` | — |

最低版本在代码里的唯一来源是 `package.json` 的 browserslist（`chrome >= 80, edge >= 80, firefox >= 74, safari >= 13.1, ios_saf >= 12.4`），eslint-plugin-compat 按它检查浏览器 API；改下限要同时改它和本文。

各浏览器开始支持 Web Locks 的版本数据来源：`@mdn/browser-compat-data` 8.1.9（见[选型调研附录](research/selection.md#附浏览器支持数据)）。

产物语法为 ES2017，以上浏览器都不需要 polyfill 或转译（ES2017 支持情况：Chrome 58、Firefox 53、Safari 11，均早于下限版本）。

## 2. 各档保证程度

| 档 | 同一时间只有一个 Leader | 冻结后接管 | 适用 |
|---|---|---|---|
| `locks` | 由浏览器保证；唯一例外是被抢锁的旧 Leader 解冻后的极短窗口 | 有 localStorage 时支持，默认约 3～4 分钟后接管 | 一般业务 |
| `lease` | **尽力保证**，可能有极短的双 Leader 窗口 | 租约过期（默认 150 秒）后接管 | 能容忍偶发重复的事 |
| `solo` | **不保证**，每个标签页都是 Leader | 不涉及 | 兜底 |

任何一档都不适合用来保证「绝对不能重复」的操作，这类需求要由后端幂等兜底。

## 3. 证据

### 3.1 自动化（每次提交，CI）

Playwright 在 Chromium、Firefox、WebKit **当前版本**上跑多标签页场景（需求文档 §9.2）。它证明三档逻辑在三大引擎的当前版本上行为一致，**不能证明旧版本可用**。

运行方式：`pnpm test:browser`（Playwright 1.65.0，本地 macOS，连续 3 次都通过）。

| 引擎 | 版本 | 结果 | 日期 |
|---|---|---|---|
| Chromium | 158.0.8127.18 | `locks`、`lease`、`solo`、上层间隔、冻结接管通过；bfcache 跳过 | 2026-11-13 |
| Firefox | 159.0 | `locks`、`lease`、`solo`、上层间隔通过；冻结接管、bfcache 跳过 | 2026-11-13 |
| WebKit | 27.2 | `locks`、`lease`、`solo`、上层间隔通过；冻结接管、bfcache 跳过 | 2026-11-13 |

跳过的原因：

- **冻结接管只在 Chromium 上测**：用 CDP `Debugger.pause` 暂停 Leader 页的脚本来模拟冻结（锁仍被持有、存活记录停止更新），恢复后检查旧 Leader 让出。`Page.setWebLifecycleState` 只冻结后台页，而自动化环境里页面始终处于前台，实测无效。Firefox、WebKit 没有对应能力。
- **bfcache 三个引擎都跳过**：页面离开再返回时，三个引擎在自动化环境里都是重新加载，而不是从 bfcache 恢复（用例通过 `window` 上的标记判断），测试按 Q3 标记跳过。`pagehide`／`pageshow` 的处理由单元测试覆盖，真实恢复放在发版前手动实测（第 4 节）。

### 3.2 旧版本手动实测（每次发版前）

按第 4 节的清单，用示例页手动实测。

| 浏览器 | 版本 | 档 | 结果 | 日期 | 证据类型 |
|---|---|---|---|---|---|
| Chrome | 80 | `locks` | 前身实现实测通过：多标签页只有一个 Leader、不同 `name` 互不影响；冻结接管未测 | 2026-11-13 | 实测（前身实现，不是本库） |
| Chrome | 80 | `locks` | 本库待测 | — | 推断 |
| Firefox | 74 | `lease` | 待测 | — | 推断 |
| Safari | 13.1 | `lease` | 待测 | — | 推断 |
| iOS Safari | 12.4 | `lease` | 待测 | — | 推断 |

## 4. 手动实测清单

在示例页（`pnpm demo`）上逐项操作，记录结果：

1. 打开 3 个标签页：只有一个显示 Leader，`mode` 与第 1 节预期一致。
2. 关闭 Leader 标签页：另一个在预期时间内成为 Leader（`locks` 档立即；`lease` 档在下一次检查或收到 `storage` 事件时）。
3. 刷新 Leader 标签页：期间最多一个 Leader。
4. Leader 标签页切到后台 5 分钟以上（移动端锁屏）再回到前台：最终只有一个 Leader，旧 Leader 收到 `onFollower`。
5. 上层定时任务（示例页的 interval 区块）：多个标签页时，日志里每个间隔只运行一次。
6. 用后退、前进离开再回到页面（bfcache）：回来后行为正常，没有重复的 Leader。
