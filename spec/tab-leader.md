# Spec：tab-leader

<!-- spec-guard: review approved adfc3f40c21f -->

> 状态：**已批准（仓库所有者，2026-11-13）**　｜　日期：2026-11-13　｜　版本目标：`0.1.0`
> 相关文档：选型调研 [docs/research/selection.md](../docs/research/selection.md)、架构 [docs/architecture/overview.md](../docs/architecture/overview.md)、兼容性 [docs/compatibility.md](../docs/compatibility.md)、发布策略 [docs/release.md](../docs/release.md)。
> 本文只写「做什么、做到什么程度算完」；「为什么这样设计」写在架构文档里，引用本文的规则编号（R*、I*），不复制规则原文。

---

## 1. 目标

### 1.1 要解决的问题

同一浏览器里，同一网站开了多个标签页（窗口、PWA 窗口）时，**某件事只让一个标签页（Leader）去做**；Leader 关闭、崩溃、进入前进／后退缓存或被浏览器冻结后，由另一个标签页自动接手。没有 Web Locks 的旧浏览器逐层降级。

典型用法：定时上报（在线状态、埋点）、轮询、单条 WebSocket／SSE 连接、令牌刷新、后台同步。

### 1.2 为什么要做一个新库

多维度对比见[选型调研](../docs/research/selection.md)。结论：没有现成的库能同时满足下面四个硬要求，这是本库存在的理由：

1. 支持没有 Web Locks 的旧浏览器（Safari 13.1、Firefox 74、iOS 12.4）；
2. Leader 被冻结、不释放锁时，其他标签页能接管；
3. 失去 Leader 时通知业务；
4. 零运行时依赖、无全局副作用。

### 1.3 定位与使用者

- **面向社区**的开源库，希望外部前端开发者使用。文档要让陌生人独立上手，对外声称的能力都要有证据。
- **首个接入方**：一个业务系统的 PC 站（Vite 5 + `@vitejs/plugin-legacy` 5.4.1，TypeScript ~5.2）和 H5 站（Nuxt 3.11 + Vite 5）。它们现在用的是各自仓库里的一份**前身实现**（本库的原型，已在 Chrome 80 实测），本库发布后替换它。
- 本库只做选主，做到最好；**0.x 不做标签页之间的消息分发**（见 §10）。

### 1.4 用户故事

- **U1** 作为业务开发者，我传一个 `name` 和两个回调，就能保证同名标签页里同一时间只有一个在执行 `onLeader` 里启动的工作，并在失去 Leader 时收到 `onFollower` 来停手。
- **U2** 作为业务开发者，我写一个「每 N 毫秒、全浏览器只跑一次」的定时任务，不用自己处理选主、跨标签页限频、刷新、bfcache、时钟回拨。
- **U3** 作为从自研实现迁移过来的开发者，只要沿用旧的锁名和存储 key，在换成本库的那次发版里新旧两种标签页同时开着，也不会出现两个 Leader，不会多跑任务。
- **U4** 作为 SSR 项目（Nuxt 等）的开发者，我在服务端 import 本库不会报错，也没有副作用。
- **U5** 作为评估要不要用本库的开发者，我能在文档里看到：和其他库的对比、每种浏览器走哪一档、每一档保证到什么程度、哪些浏览器是实测过的。

---

## 2. 公共 API

只导出两个工厂函数和它们的类型。没有默认导出，没有类，没有全局注册。

### 2.1 下层：`createTabLeader`

```ts
export type TabLeaderStrategy = 'auto' | 'lease' | 'solo'
export type TabLeaderMode = 'locks' | 'lease' | 'solo' | 'none'

export interface TabLeaderOptions {
  /** 同名的标签页之间互相选主；直接用作锁名和存储 key 前缀（见 §3.5） */
  name: string
  /** 成为 Leader 时调用 */
  onLeader?: () => void
  /** 曾是 Leader、现在不是了（让出、被抢、暂停、降级前、destroy）时调用；与 onLeader 一一配对 */
  onFollower?: () => void
  /** 从哪一档开始尝试，不可用时继续往下降。默认 'auto'（Web Locks → 租约 → solo） */
  strategy?: TabLeaderStrategy
  /** 租约有效期，默认 150_000 */
  leaseTtl?: number
  /** 租约续期／追随者检查间隔，默认 60_000 */
  leaseRenewInterval?: number
  /** 写入租约后等多久再读回确认，默认 50 */
  leaseConfirmDelay?: number
  /** Web Locks 档 Leader 写存活记录的间隔，也是追随者检查停摆的间隔，默认 60_000 */
  aliveInterval?: number
  /** 存活记录超过这么久没更新就认为 Leader 停摆、抢锁接管，默认 180_000 */
  stallTimeout?: number
  /** 运行环境，默认取浏览器全局对象；单测注入 */
  env?: TabLeaderEnv
}

export interface TabLeader {
  /** 检测能力、注册生命周期事件、参选。只有第一次调用生效；destroy 之后调用无效 */
  start(): void
  /** 主动让出 Leader 并重新排队（见 R12） */
  relinquish(): void
  /** 停止参选，移除全部事件监听，释放锁或删掉自己的租约；不可再 start */
  destroy(): void
  /** 当前是否 Leader */
  readonly isLeader: boolean
  /** 实际在用的方式；start 之前、非浏览器环境为 'none' */
  readonly mode: TabLeaderMode
}

export function createTabLeader(options: TabLeaderOptions): TabLeader
```

`strategy` 没有 `'locks'`：它的语义是「起始档」，不可用时照样往下降，和 `'auto'` 完全一样，单独保留只会让人误以为能强制只用 Web Locks。

### 2.2 上层：`createTabInterval`

```ts
export interface TabIntervalOptions
  extends Omit<TabLeaderOptions, 'onLeader' | 'onFollower'> {
  /** 两次运行之间的最小间隔（毫秒），跨标签页、跨刷新生效 */
  interval: number
  /** 要做的事；返回值被忽略，同步抛错和 Promise 拒绝都被吞掉，不重试 */
  run: () => unknown
  /** 可选：运行上下文的标识（比如当前登录身份）；和上次运行时不同就立即运行 */
  key?: () => string
}

export interface TabInterval {
  start(): void
  /** 立即检查一次：是 Leader 且（到期或 key 变了）才运行；不强制运行 */
  check(): void
  destroy(): void
  readonly isLeader: boolean
  readonly mode: TabLeaderMode
}

export function createTabInterval(options: TabIntervalOptions): TabInterval
```

`check()` 不叫 `runNow()`：它不强制运行，叫 `runNow` 会被误解。

### 2.3 运行环境（单测注入用）

```ts
/** 库只用到 Web Locks 的这一个方法 */
export interface TabLeaderLockManager {
  request(name: string, options: { steal?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>
}

export interface TabLeaderEnv {
  window: {
    addEventListener(type: string, listener: (event: any) => void): void
    removeEventListener(type: string, listener: (event: any) => void): void
  }
  document?: {
    addEventListener(type: string, listener: (event: any) => void): void
    removeEventListener(type: string, listener: (event: any) => void): void
    readonly visibilityState?: string
  } | null
  navigator?: { locks?: TabLeaderLockManager | null } | null
  localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}
```

类型只声明库实际用到的最小接口，而不是 `Window`、`LockManager` 等完整 DOM 类型：这样单测的假环境、以及接入方的 TS 版本差异都不会影响类型兼容。`TabLeaderLockManager` 随之成为公开类型。

`env` 写进公开类型，但文档只说明它用于测试，不承诺单测以外的用途。

---

## 3. 行为规则

### 3.1 选择运行方式

- **R1** `start()` 时才检测能力（创建时不碰任何浏览器 API）：
  - `canLock`：`navigator.locks` 存在（非安全上下文 HTTP 页面没有，会自然落到租约档）；
  - `canStore`：在 `${name}:probe` 上试写、读回、删除都成功；读取 `window.localStorage` 本身抛错也算不可用。
- **R2** 按 `strategy` 的起始档往下找第一个可用的：`locks`（需要 `canLock`）→ `lease`（需要 `canStore`）→ `solo`。只做功能检测，不判断 UA。
- **R3** 非浏览器环境（没有传 `env` 且全局没有 `window`）：`start()` 什么都不做，`mode` 保持 `'none'`，`isLeader` 始终为 `false`。

### 3.2 Web Locks 档

- **R4** `locks.request(name, cb)` 排队。进入回调时比对代次，不一致（排队期间已暂停、销毁、改为抢锁）就立即返回、放掉锁；一致就成为 Leader，回调返回一个直到暂停、让出或销毁时才结束的 Promise，以此一直持有锁。
- **R5** **存活记录**：Leader 当选时以及之后每 `aliveInterval` 写一次 `${name}:alive` = `{ tab, at }`。写入前先读：如果记录属于别的标签页、且时间晚于自己上次写入，说明自己已被抢锁，立即失去 Leader（不等 `AbortError` 投递）。
- **R6** **停摆接管**：排队中的标签页每 `aliveInterval`（以及切回前台时）检查存活记录；`now - at > stallTimeout` 就以 `{ steal: true }` 重新请求锁接管。
  - 找不到存活记录、记录损坏、记录时间在未来（时钟回拨），都按「没停摆」处理。这样不写存活记录的旧实现（见 U3）不会被误抢。
  - 没有 localStorage 时不做停摆接管，属于已知限制。
- **R7** 被抢锁的旧 Leader：`request()` 以 `AbortError` 拒绝且代次未变时，失去 Leader（调 `onFollower`），然后重新排队。
- **R8** 其他拒绝（例如浏览器在页面卸载时清理）同样按失去 Leader 处理并重新排队；已暂停或已销毁则不再排队。

### 3.3 租约档

- **R9** 租约存在 `${name}:lease` = `{ tab, gen, exp }`；`tab` 和 `gen` 都是自己的、且 `exp > now` 才算持有。
- **R10** 抢租约：租约没有或已过期时写入自己的租约，等 `leaseConfirmDelay` 后读回，仍是自己的才成为 Leader（两个标签页同时写，以最后写入的为准）。触发时机：参选时、每 `leaseRenewInterval`、收到 `${name}:lease` 的 `storage` 事件时。
- **R11** 续期：Leader 每 `leaseRenewInterval` 先核对再续写；核对发现租约已不是自己的就失去 Leader；读写抛错就**降级为 solo**（先 `onFollower`，再以 solo 身份 `onLeader`）。Leader 收到租约的 `storage` 事件且发现不是自己的，也立即失去 Leader。
- 这一档只能**尽力保证**：localStorage 没有原子的「读、判断、写」，后台计时器也不保证按时运行，两个 Leader 同时存在的窗口能缩得很短，但不能完全排除。文档必须写明（§3.8）。

### 3.4 通用

- **R12** `relinquish()`：不是 Leader 时无效。是 Leader 时先放掉锁或删掉租约，调 `onFollower`，然后重新参选：
  - Web Locks 档：排到队尾；没有别的标签页在排队时会马上重新当选。
  - 租约档：等一个 `leaseRenewInterval` 再参选，让别的标签页先拿到。
  - solo 档：无效（没有别人可以接手）。
- **R13** 生命周期由库自己注册监听，`destroy()` 时全部移除：

  | 事件 | 处理 |
  |---|---|
  | `pagehide` | 暂停：代次 +1，清掉计时器，释放锁或删掉自己的租约；是 Leader 的话调 `onFollower` |
  | `pageshow` 且 `persisted` | 暂停中才重新参选，防止重复启动 |
  | `visibilitychange`（变为 visible）、窗口 `focus` | Leader 补写存活记录（Web Locks 档）或核对租约（租约档）；追随者检查停摆（R6） |
  | `storage`（key 为本名的租约） | 见 R10、R11 |

- **R14** **代次**：每次失去 Leader、暂停、销毁、降级，代次 +1。所有计时器回调、锁回调和锁拒绝的处理，执行前都比对自己记下的代次，不一致就直接退出，被浏览器延迟执行的旧任务因此不会起作用。
- **R15** **回调配对**：`onLeader` 和 `onFollower` 严格交替，第一次只会是 `onLeader`；同一状态不会重复通知。回调抛出的异常被捕获，用 `setTimeout` 异步重新抛出（控制台能看到），不打断状态机。
- **R16** 标签页 ID 用 `now().toString(36) + Math.random().toString(36).slice(2)`，不依赖 `crypto`。

### 3.5 存储 key 与迁移兼容

`name` **原样使用**，不加库前缀；避免与业务自己的 key 冲突由调用方负责。

| 用途 | key | 内容 |
|---|---|---|
| Web Locks 锁名 | `${name}` | — |
| 能力探测 | `${name}:probe` | `'1'`，用完即删 |
| 租约 | `${name}:lease` | `{ tab, gen, exp }` |
| 存活记录 | `${name}:alive` | `{ tab, at }` |
| 上次运行（上层） | `${name}:last` | `{ at, id }` |

这些格式与前身实现一致（存活记录除外，是新增的）。从前身实现迁移时沿用原来的 `name`，新旧标签页就会排同一把锁、读同一份租约和「上次运行」记录（U3）。旧实现的 Leader 不写存活记录，新版追随者因此不会去抢它（R6）；旧实现的追随者看「上次运行」判断停摆，新版 Leader 运行时照常写这条记录，也不会误判。

### 3.6 上层 `createTabInterval`

内部用同名的 `createTabLeader`：`onLeader` 时开始计时，`onFollower` 时清掉计时器。

- **I1** **到期判断**（每次 tick）：
  1. 不是 Leader 就返回；租约档先重新读一次租约核对所有权，不只看缓存状态；
  2. `id = key ? String(key()) : ''`；`key()` 抛错时沿用上次记录里的 `id`，不因抛错触发运行；
  3. 读 `${name}:last`。没有记录、`id` 和上次不同、或 `now - at >= interval` 时运行：**先**写入 `{ at: now, id }`，**再**调用 `run()`；
  4. **时钟回拨**：`now < last.at` 时不运行，只把记录的 `at` 改成 `now`，从现在起重新计时；
  5. 重新安排计时器：`delay = max(0, last.at + interval - now)`，同一时间只保留一个计时器。
- **I2** **间隔严格**：差 1 毫秒也不运行，没有容差；计时器提前触发只会重新安排。
- **I3** tick 的触发时机：成为 Leader、计时器到期、切回前台（visibilitychange 变为 visible、focus、pageshow persisted）、`check()`。tick 是同步的，几个事件同时触发也只运行一次。
- **I4** `run()` 同步抛错和返回的 Promise 拒绝都被吞掉，不重试，不影响下一个周期。
- **I5** 「上次运行」记录：localStorage 可用就放在 localStorage；不可用，或运行中读写抛错、内容损坏时，退回本页内存里的记录，不会因为读不到而提前运行。
- **I6** solo 档（没有存储）每个标签页各自按 `interval` 运行，这是唯一不满足「全浏览器只跑一次」的情况。

### 3.7 各档保证程度（对外文档必须有这张表）

| 档 | 同一时间只有一个 Leader | 冻结后接管 | 适用 |
|---|---|---|---|
| `locks` | 由浏览器保证；唯一例外是被抢锁的旧 Leader 恢复后的极短窗口（§3.8） | 有 localStorage 时支持（R6） | 一般业务 |
| `lease` | **尽力保证**，可能有极短的双 Leader 窗口 | 租约过期后接管 | 能容忍偶发重复的事 |
| `solo` | **不保证**，每个标签页都是 Leader | 不涉及 | 兜底 |

任何一档都**不适合**用来保证「绝对不能重复」的操作（扣款、下单）；这类需求要由后端幂等兜底。

### 3.8 已知限制（写进对外文档）

- 租约档只能尽力保证（§3.3）。
- 系统时钟往前跳会让间隔看起来提前满足，前端无法判断；需要严格限频时由后端按服务端时间兜底。
- 有 Web Locks 但没有 localStorage 时：不做停摆接管；上层「上次运行」只在内存里，每次刷新后会立即运行一次。
- 后台计时器会被节流（桌面 Chrome 后台最多延迟约 1 分钟），上层实际间隔落在 `interval` 到 `interval + 1 分钟` 之间。
- 被冻结的旧 Leader 恢复后的第一时间，可能还没收到 `AbortError`，也没轮到 R5 的检查，这期间它仍认为自己是 Leader。上层靠共享的「上次运行」记录保证不多跑；下层的业务回调需要自己能容忍这个短暂窗口。

---

## 4. 浏览器与运行环境

| 浏览器 | 最低版本 | 实际走哪一档 |
|---|---|---|
| Chrome／Edge | 80 | Web Locks（HTTPS）；HTTP 页面走租约 |
| Firefox | 74 | 租约（新版本支持 Web Locks 后走 Web Locks） |
| Safari（Mac） | 13.1 | 租约（同上） |
| iOS Safari | 12.4 | 租约（同上） |
| Android Chrome、App 内置 WebView | 跟随系统 | 按功能检测 |

各浏览器开始支持 Web Locks 的确切版本、每一行是「实测」还是「推断」，以[兼容性文档](../docs/compatibility.md)为准。

- 产物语法为 ES2017：不出现 `?.`、`??`、对象展开／剩余、class 字段、可选 catch 绑定等更新的语法；上述浏览器都不需要 polyfill，接入方也不需要转译。
- 运行时只用：`localStorage`、`navigator.locks`（可选）、`addEventListener`、`setTimeout`、`Promise`、`JSON`、`Date.now`、`Math.random`。不用 `crypto`、`BroadcastChannel`、`AbortController`。
- 服务端 import 安全：模块顶层只有函数和常量定义，不读 `window`，不读写存储。
- **兼容范围的唯一来源**是 `package.json` 的 browserslist：`chrome >= 80, edge >= 80, firefox >= 74, safari >= 13.1, ios_saf >= 12.4`。三道自动检查各管一类（详见 ADR-0005）：新语法由构建降级加 acorn 产物检查拦截；新的 JS 内置 API 由 tsconfig `lib: ["ES2017", "DOM"]` 在类型检查时拦截；新的浏览器 API 由 eslint-plugin-compat 按 browserslist 拦截。功能检测后有意使用的 API（目前只有 `navigator.locks`）登记在 eslint-plugin-compat 的 `settings.polyfills` 白名单里。

---

## 5. 技术栈

选型理由和备选方案见 [ADR-0005](../docs/adr/0005-toolchain.md)。版本取自 npm registry（2026-11-13）。

| 用途 | 选型 | 版本 |
|---|---|---|
| 语言 | TypeScript | 6.0.x（typescript-eslint 8.72 只支持 `<6.1.0`，所以暂不用 7.0） |
| 构建 | tsdown（rolldown + oxc），不用脚手架 | 0.23.x |
| 单测 | vitest + `@vitest/coverage-v8` | 5.1.x |
| 真实浏览器测试 | `@playwright/test`（Chromium、Firefox、WebKit 当前版本） | 1.65.x |
| 代码检查 | ESLint + `@eslint/js` + typescript-eslint + eslint-plugin-compat（浏览器 API 兼容检查） | 10.14.x、8.72.x、7.0.x |
| 兼容范围 | browserslist（写在 `package.json`），全仓唯一来源 | — |
| TS 内置库 | tsconfig `lib: ["ES2017", "DOM"]`，挡住 ES2017 以后的内置 API | — |
| 格式化 | Prettier | 3.10.x |
| 产物语法检查 | acorn，以 `ecmaVersion: 2017` 解析 `dist/*.js`、`dist/*.cjs` | 8.19.x |
| 包管理 | pnpm，`packageManager` 锁定 | 11.x（本机 11.18.0） |
| Node（开发和构建） | `>=22.18`（tsdown 的要求） | 本机 v24.18.0 |
| CI | GitHub Actions；推送远端后启用，建远端和推送都要先问 | — |
| 运行时依赖 | **无**，`dependencies` 必须为空 | — |

## 6. 命令

```bash
pnpm install
pnpm test                # vitest run（含覆盖率）
pnpm test:browser        # playwright test（Chromium、Firefox、WebKit）
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint . && prettier --check .
pnpm build               # tsdown && node scripts/check-dist.mjs（ES2017 解析 + 体积报告）
pnpm demo                # 本地起示例页（构建产物 + 静态服务器），多开标签页手动观察
pnpm pack                # 生成 tab-leader-<version>.tgz
pnpm verify:consumers    # 临时目录里用 tgz 构建 Vite5+legacy 与 Nuxt3 两个样例工程（需联网装依赖）
pnpm check:terms         # 扫描文件和 git 历史里的内部敏感词（词表在仓库外）
```

## 7. 目录结构

```
src/
  index.ts          公共导出（只有函数和类型）
  core.ts           状态机、代次、生命周期、按 strategy 选档（两层共用）
  leader.ts         createTabLeader：core 的公开外壳
  locks.ts          Web Locks 档（存活记录、停摆接管）
  lease.ts          租约档
  interval.ts       createTabInterval
  env.ts            浏览器环境组装、存储探测、安全读写 JSON
  types.ts          公开类型
test/
  world.ts          假浏览器环境（多标签页共享时钟、存储、锁；冻结；storage 事件；时钟跳变）
  *.test.ts         单测
e2e/
  *.spec.ts         Playwright：真实浏览器多标签页场景
demo/
  index.html        示例页：显示本标签页是否 Leader、当前档位、事件日志；支持 ?strategy=lease|solo
scripts/
  check-dist.mjs、verify-consumers.mjs、check-internal-terms.mjs
docs/
  research/selection.md      选型调研
  architecture/overview.md   架构与设计来源
  compatibility.md           浏览器兼容与证据
  guide/api.md               API 参考
  guide/recipes.md           场景示例（含配合 BroadcastChannel 分发消息）
  guide/migration.md         从自研实现迁移的通用说明
  release.md                 版本与发布策略
  adr/NNNN-*.md              架构决策记录
spec/CAPABILITY-MAP.md、spec/tab-leader.md   能力图与本需求文档
tasks/tab-leader/plan.md、todo.md            实现计划与任务清单
README.md（中文，默认）、README.en.md（英文，内容一致）
AGENTS.md（项目上下文）、CLAUDE.md（引用 AGENTS.md + Spec Guard 约定）
CHANGELOG.md、LICENSE（MIT, haigeerlab, 2026）、CONTRIBUTING.md、SECURITY.md、.github/ISSUE_TEMPLATE/
```

## 8. 代码风格

- 源码、标识符、代码注释用英文；Spec、计划、`docs/`、CHANGELOG 用中文；README 中英两版。
- 闭包工厂函数，不用 class；只有 `start()` 会碰浏览器 API。
- 写 TS 时可以用 `?.`、`??`，由构建降级；产物检查兜底。
- 所有存储读写都经过 `env.ts` 里的安全函数，异常不往外抛。

```ts
export function createTabLeader(options: TabLeaderOptions): TabLeader {
  const { name, strategy = 'auto', aliveInterval = 60_000 } = options
  let gen = 0
  let state: State = 'idle'

  function schedule(fn: () => void, ms: number): void {
    const myGen = gen
    timer = env.setTimeout(() => {
      // Stale tasks from a previous generation must not act.
      if (myGen === gen) fn()
    }, ms)
  }
  // ...
}
```

## 9. 测试策略

验证分两层：**每次提交自动跑**，**每次发版前手动实测旧版本**。

### 9.1 单测（vitest，每次提交）

用假浏览器环境驱动多个标签页（从前身实现的测试环境移植并改成 TS）。必须覆盖：

| 分组 | 场景 |
|---|---|
| Web Locks | 5 个标签页只有一个 Leader；Leader 关闭后其他标签页接手；排队中被暂停的标签页拿到锁后立即释放；Leader 被冻结超过 `stallTimeout` 后被接管；短暂挂起（未超过阈值）不被抢；被抢的旧 Leader 解冻后收到 `onFollower`、回到排队；R5：旧 Leader 发现存活记录不是自己的就先让出；没有存活记录时不抢 |
| 租约 | 3 个标签页只有一个 Leader；正常关闭删掉租约、其他标签页立即接手；挂起超过有效期后被接手；旧 Leader 恢复后放弃；运行中存储失效降级为 solo；pagehide 时删掉租约 |
| 通用 | 能力四种组合（有无 Web Locks × 有无 localStorage）；`strategy` 起始档；bfcache 暂停与恢复、重复 pageshow、普通加载的 pageshow；回调严格配对；回调抛错不打断状态机；`relinquish` 三档；`destroy` 移除全部监听、之后 `start` 无效；不同 `name` 互不影响 |
| 上层 | 每个间隔只运行一次；接手时距上次不满间隔不运行；间隔严格（差 1 毫秒）；刷新 5 次只运行 1 次；key 变了立即运行；`check()`；切回前台、聚焦、计时器同时触发只运行一次；`run` 失败或抛错不影响下个周期；`key()` 抛错不触发运行；时钟回拨；运行中存储抛错 |
| 迁移兼容 | 用旧格式的 `:lease`、`:last` 记录启动，行为正确；不写存活记录的旧 Leader 不被抢 |
| 环境 | 无 `window` 时 import 和 `start()` 都不报错，`mode` 为 `'none'`；创建时不访问任何浏览器 API |

- **变异检查**：手动进行，每条变异都要有用例失败，结果记进计划文件。至少包括：去掉停摆接管；去掉被抢后让出；去掉 R5 的存活记录核对；停摆阈值改为 0；去掉时钟回拨保护；去掉租约降级；去掉排队时的代次检查；去掉 tick 前的租约核对；间隔判断从 `>=` 改成 `>` 或带容差；去掉回调配对保护；去掉 `destroy` 里移除监听的代码。
- **覆盖率**：语句和分支都 ≥ 90%（v8），没覆盖到的行要说明原因。

### 9.2 真实浏览器测试（Playwright，每次提交）

在 Chromium、Firefox、WebKit **当前版本**里，用同一浏览器上下文开多个页面，加载示例页（基于构建产物）：

| 场景 | 三个引擎 | 说明 |
|---|---|---|
| `locks` 档：多页只有一个 Leader；关掉 Leader 页后另一页接手 | ✅ | — |
| `lease` 档（`strategy: 'lease'`）：同上 | ✅ | 用强制起始档模拟旧浏览器的租约路径 |
| `solo` 档：每页都是 Leader | ✅ | — |
| 上层：多页时一个间隔只运行一次 | ✅ | 间隔用很短的值 |
| 冻结接管：Leader 页被冻结后由另一页接手，解冻后旧 Leader 让出 | 仅 Chromium | 通过 CDP `Page.setWebLifecycleState` 冻结；其他引擎没有对应能力 |
| bfcache：`pagehide`／`pageshow` 后行为正确 | 尽力 | 自动化环境里 bfcache 是否生效因引擎而异，不生效时测试标记跳过并说明 |

这一层证明三档逻辑在三大引擎的**当前版本**上行为一致，**不能**证明旧版本可用。

### 9.3 旧版本手动实测（每次发版前）

用示例页在 Chrome 80、Firefox 74、Safari 13.1、iOS 12.4（真机或云真机）上按清单手动走一遍：多开标签页只有一个 Leader、关闭后接手、后台一段时间后回到前台、刷新。结果写进[兼容性文档](../docs/compatibility.md)，每行标明浏览器版本、日期、结论；没测过的标「推断」，不能写成「支持」。不接入 BrowserStack 一类的自动化服务。

## 10. 边界

- **一定要做**：提交前跑 `pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm check:terms`；`dependencies` 保持为空；模块顶层不能有副作用；公开 API 有变化时同步更新 Spec、API 参考和两版 README。
- **先问再做**：新增任何运行时依赖；改变公开 API 或存储 key 格式；在 GitHub 上创建 `haigeerlab/tab-leader`；任何 `git push`；`npm publish`（用户本人在交互终端完成 2FA）；打 `latest` 标签；重写 git 历史。
- **不能做**：仓库的任何文件、提交信息和 git 历史里出现内部项目信息（首个接入方一律称「首个接入方」）；改动首个接入方的仓库和其他项目的文件；复制其他库的代码；产物超出 ES2017 语法；用 UA 判断浏览器；未登记白名单就使用 browserslist 范围外的浏览器 API；修改全局对象（比如给 `navigator.locks` 打补丁）。
- **0.x 不做**：标签页之间的消息分发（文档给出配合 `BroadcastChannel` 或 `storage` 事件的示例）；旧版本浏览器的自动化测试。

## 11. 成功标准

本模块完成时必须全部满足（对应[发布策略](../docs/release.md#验证阶段)的 V1～V3；模块完成即可交出 tgz 包给首个接入方联调，**不等于可以发布**）：

- **AC1** `pnpm test` 全部通过；§9.1 的场景都有对应用例；变异清单逐条验证，每条都有用例失败；覆盖率达标。
- **AC2** `pnpm test:browser` 在 Chromium、Firefox、WebKit 上全部通过（§9.2 中标「仅 Chromium」「尽力」的按说明处理）。
- **AC3** `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；`dist/` 有 ESM（`.js`）、CJS（`.cjs`）、类型声明（`.d.ts`／`.d.cts`），全部能用 acorn 以 ES2017 解析。
- **AC4** `package.json`：`dependencies` 为空，`sideEffects: false`，`exports` 提供 `import`／`require`／`types` 三种条件，`files` 只含 `dist`、两版 README、LICENSE、CHANGELOG，有 `publishConfig`（公共 registry、`access: public`）。
- **AC5** `pnpm pack` 的包在两个临时样例工程里都能 import 并构建通过：Vite 5 + `@vitejs/plugin-legacy` 5.4.1（用 TypeScript ~5.2 做类型检查）；Nuxt 3.11（含服务端渲染时 import 不报错）。
- **AC6** 报告包体积：tgz 大小、`dist` 各文件原始和 gzip 大小、两层合计 minify + gzip 大小。目标 ≤ 3 KB，超出要说明原因，不卡交付。
- **AC7** 文档齐全且一致：两版 README 内容一致；API 参考与类型定义一致；兼容性文档的每一行都有证据标注；选型调研、架构、发布策略、ADR、`AGENTS.md`、`CONTRIBUTING.md`、`SECURITY.md`、Issue 模板都在。
- **AC8** `pnpm check:terms --history` 通过：工作区和全部 git 历史里没有内部敏感词。
- **AC9** 示例页 `pnpm demo` 能在本地打开，多开标签页能看到 Leader 切换。

- **AC10** 交出可供联调的 tgz 包和通用的迁移说明 `docs/guide/migration.md`（从自研实现迁移：怎么沿用旧的 `name` 和存储格式、新旧实现混开时的行为、`checkNow` 改为 `check` 这类差异的通用写法）。

发 `next` 的条件是 V1～V5 全部通过（V4 首个接入方本地联调、V5 旧版本实测在本模块之外进行），打 `latest` 的条件是 V6、V7 通过，详见[发布策略](../docs/release.md#验证阶段)。

## 12. 待定问题

不阻塞实现，结论写回本文：

- **Q1** tsdown 用 TS 6 生成的 d.ts 能否被 TS 5.2 读取（AC5）。不行的话，调整 d.ts 的生成方式，比如降低声明文件里用到的类型语法。
- **Q2** 体积目标 3 KB 是估计值，实现后按实测调整。
- **Q3** 各引擎在 Playwright 下 bfcache 是否可测（§9.2），不可测的场景标记跳过并写明原因。

---

## 附录 A：已确认事项（2026-11-13）

**第一轮 ASSUMPTIONS（全部按默认）**：单模块；本地 `main` 上可按任务提交，远端写入先问；pnpm、Node ≥ 22、`sideEffects: false`、`publishConfig`、版本 `0.1.0`；TypeScript + tsdown，ESM、CJS、d.ts，ES2017，产物语法检查；vitest，手动变异检查；样例工程验证打包；体积目标 3 KB；`name` 原样用作锁名和 key 前缀；降级顺序 Web Locks → 租约 → solo；回调严格配对，v1 不提供 `AbortSignal`；存活记录 60 秒写一次、180 秒停摆阈值、无记录不抢；`relinquish` 排到队尾；库自己注册生命周期事件，`destroy` 全部移除；时长可配置；无 `window` 时 `mode` 为 `'none'`；上层记录 `{ at, id }`；严格间隔、时钟回拨只重置、吞掉 `run` 的错误、存储不可用退回内存；`runNow` 改名 `check`；业务逻辑不进库；浏览器下限 Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4；代码和注释用英文；MIT、haigeerlab、2026。

**后续确认**：

- 使用 Spec Guard：能力图只有一个模块 `tab-leader`。
- 定位：认真面向社区，希望外部开发者使用。
- 验证两层：每次提交 CI 跑 Chromium、Firefox、WebKit 当前版本；每次发版前在旧版本上手动实测并记录。
- 验证分七个阶段（发布策略 V1～V7）：本模块完成 V1～V3 并交出 tgz；首个接入方用 tgz 本地联调（V4）和旧版本实测（V5）都通过后，才发 0.1.0 到 `next`（V6）；接入方线上稳定两周后打 `latest`（V7）；API 稳定前保持 0.x。（2026-11-13 调整：原为「先发 `next` 再给接入方试用」）
- 0.x 不做消息分发。
- 工具链按 ADR-0005：TypeScript 6.0（不用 7.0，因为 typescript-eslint 不支持）、tsdown、vitest、Playwright、ESLint + typescript-eslint + eslint-plugin-compat + Prettier，不用脚手架；代码检查选 ESLint 而不是 oxlint，因为 oxlint 加载 eslint-plugin-compat 只能走 alpha 的 JS 插件机制。
- 兼容范围以 `package.json` 的 browserslist 为唯一来源；tsconfig `lib` 设为 `["ES2017", "DOM"]`。
- README 中英两版、内容一致、默认中文；`docs/` 首版只写中文；`AGENTS.md` 为主，`CLAUDE.md` 引用它；发版前补齐 CONTRIBUTING、SECURITY、Issue 模板，不承诺响应时限。
- 仓库任何地方（含 git 历史）都不出现内部项目信息。

---

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-13 | 初稿；按需求拷问的结论补充真实浏览器测试、示例页、发版前旧版本实测、三步发布、0.x 不做消息分发、文档与治理文件、不出现内部信息等要求 |
| 2026-11-13 | 补充工具链选型（ADR-0005）：TypeScript 由 7.0 改为 6.0，新增 ESLint、Prettier 与 `pnpm lint`，Node 下限改为 22.18，Q1 随之改写 |
| 2026-11-13 | 代码检查确定用 ESLint（不用 oxlint），新增 eslint-plugin-compat、browserslist 唯一来源、tsconfig `lib: ["ES2017", "DOM"]`；ADR-0005 改正「oxlint 没有类型规则」的错误描述 |
| 2026-11-13 | 按七个验证阶段调整发布节奏：发 `next` 之前先完成首个接入方本地联调（V4）和旧版本实测（V5）；§11 改为本模块完成时的标准，新增 AC10（交出 tgz 与迁移说明） |
| 2026-11-13 | 实现中修订（C3 交审）：§2.3 `TabLeaderEnv` 改为只声明实际用到的最小接口，新增公开类型 `TabLeaderLockManager`；§7 新增 `src/core.ts`（两层共用的状态机） |
