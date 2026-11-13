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
| Chrome | 80 | `locks` | 本库 0.1.0 在首个接入方页面（HTTPS）实测通过：两个标签页只有一个 Leader、不同 `name` 各有一个 Leader 互不影响、与前身实现混开共用同一份记录不重复执行；冻结接管、bfcache 未测 | 2026-11-13 | 实测（本库，接入方页面） |
| Firefox | 74 | `lease` | 待测 | — | 推断 |
| Safari | 13.1 | `lease` | 待测 | — | 推断 |
| iOS Safari | 12.4 | `lease` | 待测 | — | 推断 |

## 4. 手动实测清单

发版前（[V5](release.md#验证阶段)）在旧版本浏览器上逐项操作，结果写进 3.2 节。目标是证明第 1 节声称的最低版本**确实可用**，并且走的是预期的档。

### 4.1 要测的浏览器

| 浏览器 | 版本 | 预期 `mode` | 打开方式 |
|---|---|---|---|
| Chrome | 80 | `locks` | 在运行示例页的同一台电脑上打开 `http://127.0.0.1:4789/demo/`（`127.0.0.1` 算安全上下文） |
| Chrome | 80 | `lease` | 用局域网地址打开（HTTP、非安全上下文，没有 Web Locks），验证第 1 节「HTTP 页面走 `lease`」 |
| Firefox | 74 | `lease` | 局域网地址 |
| Safari（Mac） | 13.1 | `lease` | 局域网地址 |
| iOS Safari | 12.4 | `lease` | 局域网地址 |

旧版本浏览器的来源：真机，或者旧系统的虚拟机、Xcode 旧版本 iOS 模拟器、浏览器官方的历史安装包。Edge 80 与 Chrome 80 同内核，有条件再测。

### 4.2 准备

1. 在开发机上启动示例页，让局域网里的设备也能访问：

   ```bash
   pnpm build && HOST=0.0.0.0 node scripts/serve.mjs
   ```

   终端会打印本机地址和局域网地址。服务器只提供 `demo/` 和 `dist/` 两个目录，测完按 Ctrl+C 关掉。

2. 打开页面时在地址里加上**测试参数**，把默认的分钟级等待缩短到几秒。下文用 `F` 代指这串参数，例如 `/demo/?name=v5-1&F` 实际要输入的是 `/demo/?name=v5-1&leaseTtl=6000&…&interval=5000`：

   ```text
   leaseTtl=6000&leaseRenewInterval=2000&aliveInterval=2000&stallTimeout=6000&interval=5000
   ```

   不要再调得更短：后台标签页的计时器每秒最多执行一次，间隔低于 1 秒会把正常的后台 Leader 误判成停摆。

3. 每个标签页上能看到：大字「Leader」（绿色）或「Follower」，`mode`，以及按时间倒序的日志（`started`、`onLeader`、`onFollower`、`interval run`）。
4. 能打开开发者工具时（iOS 用 Mac 上 Safari 的「开发」菜单连接），留意控制台有没有报错。

### 4.3 操作和判定

每个浏览器按下面的顺序做一遍。`name` 参数用来隔开各步，避免上一步留下的记录干扰下一步。

| # | 操作 | 通过的标准 |
|---|---|---|
| 1 | 打开一个标签页：`/demo/?name=v5-1&F` | 页面正常显示，`mode` 与 4.1 节预期一致；控制台没有报错。显示 `none` 或页面空白算失败 |
| 2 | 再开两个同样地址的标签页，逐个切过去看 | 三个标签页里**只有一个** Leader |
| 3 | 关掉 Leader 所在的标签页 | 剩下的标签页里，几秒内恰好有一个变成 Leader，日志多一条 `onLeader` |
| 4 | 刷新现在的 Leader 标签页，刷新后逐个查看 | 任何时候都只有一个 Leader；刷新的那个页面日志从 `started` 重新开始 |
| 5 | 另开两个 `/demo/?name=v5-5&F` 的标签页 | 它们之间另选一个 Leader，与第 2～4 步的那组互不影响（两组各有一个 Leader） |
| 6 | **后台与冻结**（见下表），之后回到原来的 Leader 标签页 | 冻结期间别的标签页接手；回来后旧 Leader 日志里有 `onFollower`，最终只有一个 Leader |
| 7 | 关掉其他标签页，开三个 `/demo/?name=v5-7&F`，从打开第一个起等 30 秒 | 把三个标签页日志里的 `interval run` 按时间合在一起：共 6～7 次，相邻两次相隔不少于 5 秒。间隔任务自己单独选主，运行它的标签页不一定是页面上显示 Leader 的那个 |
| 8 | 在 Leader 标签页的地址栏打开 `/demo/?name=v5-8-elsewhere`，再按「后退」回来 | 回来后只有一个 Leader。日志里没有新的 `started` 说明页面是从 bfcache 恢复的，有就说明重新加载了，两种都记下来 |
| 9 | （可选）在浏览器设置里禁用网站数据（Cookie 与网站数据），重新打开示例页 | `mode` 为 `solo`（Chrome 80 本机地址仍为 `locks`，见第 1 节最后一行），页面正常 |
| 10 | **无痕模式**（Safari 13.1、iOS 12.4 必测，其他浏览器有条件再测）：打开一个无痕窗口，在里面开三个 `/demo/?name=v5-10&F` 的标签页，逐个查看 | 记录观察结果，不按通过或失败判定：三个标签页里有几个 Leader、`mode` 各是什么。**只有一个 Leader** 说明无痕标签页之间共享 localStorage；**每个都是 Leader 且 `mode` 为 `lease`** 说明各标签页的存储互相隔离，本库在这种情况下等同于各自运行，要写进 README 的「已知限制」 |

第 6 步各浏览器的做法：

| 浏览器 | 怎么让 Leader 冻结或停住 | 预期多久接手 |
|---|---|---|
| Chrome 80（`locks`） | 打开 `chrome://discards`，在 Leader 标签页那一行点「Freeze」（没有这个按钮就记为「未测」） | 约 8 秒（`stallTimeout` 6 秒加一次检查间隔），之后点回该标签页解冻 |
| Firefox 74、Safari 13.1（`lease`） | 把 Leader 标签页所在窗口最小化 1 分钟。桌面浏览器只会节流后台计时器，一般**不会**换 Leader，这一步主要确认后台不会出现两个 Leader | 不换或换一次都算正常，只要任何时候只有一个 Leader |
| iOS Safari 12.4（`lease`） | ① 从 Leader 标签页切到另一个标签页，停留 30 秒；② 再锁屏 30 秒后解锁 | ① iOS 暂停后台标签页时，约 6～8 秒（租约过期）后当前标签页变成 Leader，切回原标签页后它收到 `onFollower`；没有换也算正常。② 锁屏时整个 Safari 都暂停，解锁后可能由原 Leader 重新当选。两种情况都只看一点：任何时候只有一个 Leader |

### 4.4 记录

每个浏览器在 3.2 节记一行：

| 浏览器 | 版本 | 档 | 结果 | 日期 | 证据类型 |
|---|---|---|---|---|---|
| Firefox | 74.0 | `lease` | 1～8 通过；第 8 步重新加载，未从 bfcache 恢复；第 9、10 步未测 | 2026-11-20 | 实测（本库，示例页） |

- 「结果」写清哪几步通过、哪几步未测或失败，失败写现象（截图或日志另存，不放进仓库也可以）。
- 第 10 步单独写一句观察结果，例如「无痕模式：三个标签页各自为 Leader，`mode` 为 `lease`」。
- 有失败项时先开 Issue 修复，修完重新测，再更新这一行。
- 3.2 节里还标着「推断」的行，在对应浏览器测完之前不能改成「支持」。
