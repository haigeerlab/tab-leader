# Spec：request-leadership

<!-- spec-guard: review pending -->

> 状态：**待批准**　｜　日期：2026-11-24　｜　版本目标：`0.3.0`（npm `next`）　｜　依赖模块：`tab-leader`
> 接口方向已由仓库所有者在 2026-11-24 批准（见 §1.3）；本文把它写成可验证的规则与验收标准。
> 规则编号沿用 [spec/tab-leader.md](tab-leader.md)：本模块新增的规则记为 **R17**，构建时写进那份 Spec 的 §3.4。

---

## 1. 目标

### 1.1 要解决的问题

`createTabLeader` 选出谁当 Leader 完全由先来后到决定：Web Locks 档按排队顺序，租约档按谁先写到租约。调用方没有办法让**某个指定的标签页**成为 Leader。

常见的需要：多个标签页共用一条长连接（WebSocket、SSE）或一份实时状态时，希望由用户正在看的那个标签页（前台标签页）来持有它，这样前台页面的计时器不被节流、连接断开能马上重连，后台标签页被浏览器冻结也不影响用户眼前的页面。0.2.0 只能 `relinquish()` 让当前 Leader 让出，但让出后由谁接手仍然不可控。

此外，默认的时长参数（租约 150 秒、停摆阈值 180 秒）偏保守，Leader 被冻结后要几分钟才有人接手；调用方想缩短接手时间，但文档没有给出可以放心使用的参数和下限。

### 1.2 做什么

1. `createTabLeader` 返回的对象新增公开方法 `requestLeadership()`：本标签页不是 Leader 时主动抢主，原 Leader 让出并收到 `onFollower`。
2. API 参考新增「快速接管」一节：给出经过旧浏览器实测的推荐参数、参数下限规则和尚未验证的风险。
3. 随 `0.3.0` 发布到 npm `next`。

### 1.3 已确认的接口方向（仓库所有者，2026-11-24）

- 只给 `createTabLeader` 加 `requestLeadership()`；`createTabInterval` 不加。
- 语义：本标签页不是 Leader 时主动抢主；已是 Leader、solo 档、未 `start()`、已 `destroy()` 时无效。
- Web Locks 档用 `navigator.locks.request(name, { steal: true }, ...)` 抢锁，被抢的旧 Leader 走现有「被抢」路径（R7）收到 `onFollower`。
- 租约档直接覆盖 `${name}:lease`，旧 Leader 在 `storage` 事件或下次核对时让出。
- 旧 Leader 被系统暂停时可能短暂出现两个 Leader，调用方能容忍；本文与对外文档都要写明。
- 不做「页面可见时自动当主」的选项：并排可见的几个窗口会互相抢。由调用方自己在 `visibilitychange` 里调用。
- API 参考补「快速接管」一节：推荐 `leaseTtl` 6000、`leaseRenewInterval` 2000、`aliveInterval` 2000、`stallTimeout` 6000；依据是 [兼容性文档](../docs/compatibility.md) 3.2 节的 V5 实测（Chrome 80 冻结后约 5 秒接手；Firefox 74、Safari 13.1 窗口最小化 60 秒不误换 Leader）；下限规则：间隔不低于 1 秒，`leaseTtl` ≥ 3 倍续租间隔，`stallTimeout` ≥ 3 倍存活间隔；未验证的风险：后台超过 5 分钟的强力节流与 iOS 后台暂停下，所有标签页都在后台时可能每分钟换一次 Leader。
- 发 `0.3.0` 到 npm `next`，不动 `latest`。这次改了选主逻辑，按 [发布策略](../docs/release.md#验证阶段) 要走 V1～V7；V5 旧浏览器手动实测（至少 Safari 13.1 `lease` 档）是发布前置条件，不由本模块执行。

### 1.4 用户故事

- **U1** 作为调用方，我在页面变为可见时调用 `requestLeadership()`，用户正在看的标签页很快成为 Leader，原 Leader 收到 `onFollower` 停手，之后同一时间仍只有一个 Leader。
- **U2** 作为调用方，我在已是 Leader、solo 档、还没 `start()` 或已 `destroy()` 的标签页上调用它，什么都不会发生，不需要自己先判断状态。
- **U3** 作为调用方，我按「快速接管」一节设置时长参数，Leader 被冻结后几秒内由别的标签页接手，后台节流不会让桌面浏览器误换 Leader；我也知道哪些情况还没验证过。
- **U4** 不调用 `requestLeadership()`、不改时长参数的现有调用方升级到 0.3.0 后行为不变。

## 2. 公共 API

`TabLeader` 新增一个方法，其余不变：

```ts
export interface TabLeader {
  start(): void
  relinquish(): void
  /**
   * 本标签页不是 Leader 时主动抢主（R17）：Web Locks 档抢锁，租约档覆盖租约；
   * 原 Leader 让出并收到 onFollower。结果是异步的：成为 Leader 时照常调用 onLeader。
   * 已是 Leader、solo 档、start() 之前、destroy() 之后、页面暂停（bfcache）期间调用无效。
   */
  requestLeadership(): void
  destroy(): void
  readonly isLeader: boolean
  readonly mode: TabLeaderMode
}
```

- 返回 `void`，与 `relinquish()` 一致；是否成功通过 `onLeader` 或 `isLeader` 观察。
- `TabInterval`、`createTabInterval`、`TabLeaderOptions`、存储 key 与记录格式都不变。
- 这是新增方法，不是破坏性变更，版本号按次版本升到 `0.3.0`。

## 3. 行为规则

**R17** **主动抢主**（写进 [spec/tab-leader.md](tab-leader.md) §3.4，位于 R12 之后）：

1. **何时有效**：只在本标签页处于「参选中、还不是 Leader」时有效，包括 Web Locks 档排队中、正在停摆接管（R6）中、租约档等待或确认租约中、`relinquish()` 之后等待重新参选的那段时间。以下情况调用无效，不改任何状态、不读写存储、不请求锁、不通知：已是 Leader；`mode` 为 `solo`；`start()` 之前或非浏览器环境（`mode` 为 `'none'`）；`pagehide` 暂停期间；`destroy()` 之后。
2. **Web Locks 档**：代次 +1（R14，让排队中的普通请求和挂着的停摆检查失效），然后以 `{ steal: true }` 请求锁，做法与 R6 的停摆接管相同。
   - 拿到锁后按 R4、R5 成为 Leader：调 `onLeader`，立即写存活记录。
   - 原 Leader 的 `request()` 以 `AbortError` 拒绝，按 R7 失去 Leader（调 `onFollower`）并重新排队；在 `AbortError` 投递之前，原 Leader 下一次写存活记录时也会按 R5 发现记录已不是自己的而先让出。
   - 抢锁请求还没拿到锁就被拒绝时按 R8a 降级；拿到过锁之后被拒绝按 R8 处理。
   - 失效的普通请求以后被授予时按 R4 立即放掉锁。
3. **租约档**：代次 +1（取消挂着的重新参选、续期和确认计时器），**不看现有租约是否有效**，直接写入自己的 `{ tab, gen, exp }`（格式同 R9），等 `leaseConfirmDelay` 后读回：
   - 仍是自己的就成为 Leader，此后照常续期（R11）；
   - 已不是自己的（别的标签页在这段时间里又写了租约）就**保持追随者**，照常按 R10 参选，不自动重试抢主；
   - 写入或读回抛错按 R11 降级为 solo。
   - 原 Leader 收到 `${name}:lease` 的 `storage` 事件、下一次续期核对、或上层 tick 前的核对（I1 第 1 步）发现租约已不是自己的，按 R11 失去 Leader（调 `onFollower`）并重新参选；新租约有效，所以它不会立刻抢回。原 Leader 离开时（R12、R13、`destroy`）只删属于自己的租约，不会删掉新 Leader 的租约。
4. **结果是异步的**：调用返回时 `isLeader` 仍为 `false`。Web Locks 档在浏览器授予锁之后、租约档在 `leaseConfirmDelay` 之后才成为 Leader 并调 `onLeader`；R15 的回调配对照常成立。
5. **重复调用**：抢主还没有结果时再次调用，会按第 2、3 条再发起一次；无论调用几次，最终只有本标签页成为 Leader 一次，`onLeader` 只调用一次。
6. **多个标签页互相抢**：不做退避和限流。几个标签页先后调用时，最后一次抢主的标签页成为 Leader，之前的依次让出，每次让出都调 `onFollower`。所以调用方不应在多个窗口可能同时触发的事件（例如几个并排窗口的 `focus`）里无条件调用；推荐只在 `visibilitychange` 变为 `visible` 时调用。

**已知影响**（写进 [spec/tab-leader.md](tab-leader.md) §3.8 和 API 参考）：

- 原 Leader 被系统暂停（后台冻结、iOS 切到后台）时收不到 `AbortError` 和 `storage` 事件，恢复后、让出前的短暂时间里它仍认为自己是 Leader，与新 Leader 同时存在。这是 §3.8 最后一条已有限制的另一种触发方式；`createTabInterval` 靠共享的「上次运行」记录不多跑，`createTabLeader` 的业务回调需要自己能容忍。
- 租约档的抢主和普通参选一样只能尽力保证（§3.3）：两个标签页几乎同时写租约时，以最后写入的为准，另一个保持追随者。

## 4. 「快速接管」文档内容

写进 [docs/guide/api.md](../docs/guide/api.md) 新增的「快速接管」一节（放在 `createTabLeader` 一节之后），两版 README 的快速上手各加一句链接过去。内容必须包括：

1. **适用场景**：Leader 被冻结或关闭后希望几秒内有人接手（例如共用的长连接），可以接受更频繁的存储读写。默认值偏保守，不改参数时行为与以前相同。
2. **推荐参数**，`createTabLeader` 和 `createTabInterval` 都适用：

   ```ts
   const fastTakeover = {
     leaseTtl: 6000,
     leaseRenewInterval: 2000,
     aliveInterval: 2000,
     stallTimeout: 6000,
   }
   ```

3. **依据**：[兼容性文档](../docs/compatibility.md) 3.2 节的 V5 实测用的就是这组参数——Chrome 80 冻结 Leader 后约 5 秒（`locks` 4.8 秒、`lease` 5.1 秒）由别的标签页接手；Firefox 74、Safari 13.1 把 Leader 窗口最小化 60 秒，没有误换 Leader。
4. **下限规则**：
   - `leaseRenewInterval`、`aliveInterval` 不低于 1000 毫秒：后台标签页的计时器每秒最多执行一次，更短会把正常的后台 Leader 误判成停摆；
   - `leaseTtl` ≥ 3 × `leaseRenewInterval`；
   - `stallTimeout` ≥ 3 × `aliveInterval`。
5. **尚未验证的风险**：
   - 浏览器对后台超过 5 分钟的页面做强力节流（计时器约每分钟才执行一次）时，续租和存活记录会晚于 6 秒；所有标签页都在后台时，可能每分钟换一次 Leader。
   - iOS Safari 把后台标签页暂停时同理。
   - 每次换 Leader 都会调 `onFollower`／`onLeader`，业务侧要能承受；前台标签页在可见时调用 `requestLeadership()` 可以把 Leader 稳定在前台。
6. **配合 `requestLeadership()` 的示例**：在 `document` 的 `visibilitychange` 变为 `visible` 时调用，并说明不放在 `focus` 里的原因（R17 第 6 条）。

## 5. 改动范围

| 文件 | 改什么 |
|---|---|
| `src/types.ts` | `TabLeader` 新增 `requestLeadership()`，英文 JSDoc |
| `src/core.ts` | `Driver` 新增抢主入口；`CoreHandle` 新增 `requestLeadership`，按 R17 第 1 条判断是否有效 |
| `src/locks.ts` | 抢主：代次 +1 后 `request(true)`（与停摆接管共用） |
| `src/lease.ts` | 抢主：代次 +1 后无条件写租约、确认、恢复续期循环 |
| `src/leader.ts` | 把 `requestLeadership` 暴露到 `TabLeader` |
| `test/`（新增 `leader.request.test.ts`） | §7 的单测 |
| `e2e/leader.spec.ts` | §7 的真实浏览器场景 |
| `demo/index.html` | 新增 `requestLeadership()` 按钮，供 V5 手动实测和 e2e 使用 |
| `spec/tab-leader.md` | §2.1 加方法；§3.4 新增 R17；§3.8 加已知影响；§9.1 通用分组加场景、变异清单加条目；§9.2 加场景；「变更记录」追加一行 |
| `docs/guide/api.md` | `TabLeader` 成员表加 `requestLeadership()`；新增「快速接管」一节（§4）；对应版本改为 0.3.0 |
| `docs/compatibility.md` | 4.3 节手动实测清单新增一步：在追随者标签页点 `requestLeadership()`，它成为 Leader、原 Leader 日志有 `onFollower`、任何时候只有一个 Leader。只加清单，不填实测结果 |
| `README.md`、`README.en.md` | 快速上手的 `createTabLeader` 示例加 `leader.requestLeadership()` 一行，并链接「快速接管」；两版内容一致 |
| `CHANGELOG.md` | 新增 `[0.3.0]` 条目，「新增」一节 |
| `docs/release.md` | 发布记录加 0.3.0 一行：标签 `next`，日期「待发布」；写明改了选主逻辑、要走 V1～V7，V5 至少重测 Safari 13.1 `lease` 档（含新增的抢主步骤）后才能发 |
| `package.json` | `version` 改为 `0.3.0`（公共文件，构建时发【公共变更请求】，批准后再改） |

不改：`src/interval.ts`、`createTabInterval` 的接口、存储 key 与记录格式、默认时长参数、浏览器下限。

## 6. 命令

沿用 [spec/tab-leader.md](tab-leader.md) §6：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms`。提交前全部通过。

## 7. 测试策略

### 7.1 单测（vitest，沿用 `test/world.ts` 的假环境）

| 场景 | 期望 |
|---|---|
| Web Locks：3 个标签页，追随者调用 | 该标签页成为 Leader、`onLeader` 一次；原 Leader 收到 `onFollower` 一次并重新排队；任何时刻只有一个 Leader |
| Web Locks：原 Leader 被冻结时有人抢主 | 抢主的标签页立即成为 Leader；原 Leader 解冻后让出（收到 `onFollower`），最终只有一个 Leader |
| Web Locks：`AbortError` 晚到 | 原 Leader 先在写存活记录时按 R5 让出 |
| Web Locks：没有 localStorage | 抢主照常成功，原 Leader 按 R7 让出 |
| Web Locks：抢主后新 Leader 关闭 | 排队中的标签页照常接手，失效的旧请求不会造成第二个 Leader |
| Web Locks：抢锁请求未授予就被拒绝 | 按 R8a 降级，不重试 |
| 租约：3 个标签页，追随者调用 | `leaseConfirmDelay` 之后成为 Leader；原 Leader 收到 `storage` 事件后让出；`${name}:lease` 属于新 Leader |
| 租约：原 Leader 收不到 `storage` 事件（冻结） | 原 Leader 在下一次续期核对时让出 |
| 租约：确认前被别的标签页覆盖 | 调用方保持追随者，不重试；最终只有一个 Leader |
| 租约：写入抛错 | 降级为 solo |
| 租约：原 Leader 让出后 | 不删新 Leader 的租约，也不会在租约有效期内抢回 |
| `relinquish()` 后等待重新参选期间调用 | 取消等待，按 R17 立即抢主 |
| 无效情况 | 已是 Leader、solo 档、`start()` 之前、无 `window`、`pagehide` 暂停中、`destroy()` 之后调用：状态、回调、存储、锁请求次数都不变 |
| 重复调用 | 连续调用两次：最终本标签页是 Leader，`onLeader` 只调用一次 |
| 两个标签页先后调用 | 后调用的成为 Leader，先调用的收到 `onFollower`；回调严格配对 |
| 不调用 `requestLeadership()` | 现有单测全部不改就通过 |

- **变异检查**（手动，结果记进 plan）：去掉「已是 Leader 时无效」的判断；去掉 solo 档的无效判断；Web Locks 档去掉代次 +1；Web Locks 档改为不带 `steal`；租约档去掉代次 +1；租约档改为先看现有租约（有效就不写）；租约档去掉读回确认；租约档确认失败后改为自动重试；去掉 `destroy()`／暂停后的无效判断。每条都要有用例失败。
- **覆盖率**：语句和分支保持 ≥ 90%（v8）。

### 7.2 真实浏览器测试（Playwright）

在 Chromium、Firefox、WebKit 当前版本上，`locks` 档和 `lease` 档（`strategy: 'lease'`）各加一个场景：三个页面里，在一个追随者页面点 `requestLeadership()`，它成为 Leader，原 Leader 的日志有 `onFollower`，整个过程只有一个 Leader。现有场景照常通过。

### 7.3 旧版本手动实测（V5）

**不由本模块执行**，是发布 `0.3.0` 到 `next` 的前置条件：至少在 Safari 13.1（`lease` 档）上按 [兼容性文档](../docs/compatibility.md) 第 4 节的清单（含本模块新增的抢主步骤）重测，结果写进 3.2 节。本模块只负责在清单里加上这一步，并在发布记录里写明这个前置条件。

## 8. 代码风格

沿用 [spec/tab-leader.md](tab-leader.md) §8：代码和注释用英文；闭包工厂函数；不引入运行时依赖；产物保持 ES2017；不新增导出的函数。

## 9. 边界

- **一定要做**：公开 API 变化同步更新本文、`spec/tab-leader.md`、API 参考、两版 README、CHANGELOG；改 `spec/tab-leader.md` 时在其「变更记录」追加一行（这份文件在集成分支上因上一个模块新增 I7 处于「批准后已修订、待复审」，本模块的改动在交审时一并说明）；提交前跑 `pnpm check:terms`。
- **先问再做**：改 `package.json` 等公共文件（发【公共变更请求】）；超出 §5 的任何改动；任何推送、`npm publish`、移动 `latest`（由仓库所有者在交互终端完成，不在本模块里做）。
- **不能做**：文档、注释、提交信息里出现任何接入方的内部项目名、分支、环境或业务字段，一律写通用场景；改存储 key 或记录格式；改默认时长参数；给 `createTabInterval` 加抢主方法；做「可见时自动当主」的选项；为抢主加退避或限流。

## 10. 成功标准

- **AC1** 三档行为符合 R17：`locks` 档抢锁成功、原 Leader 收到 `onFollower` 并重新排队；`lease` 档覆盖租约后确认成为 Leader、原 Leader 在 `storage` 事件或下次核对时让出；确认失败时保持追随者（§7.1 对应用例通过）。
- **AC2** R17 第 1 条列出的无效情况全部无副作用；重复调用和多个标签页互抢时回调严格配对、最终只有一个 Leader。
- **AC3** 不调用 `requestLeadership()` 时现有单测全部不改就通过。
- **AC4** §7.1 的变异清单逐条验证，每条都有用例失败；覆盖率 ≥ 90%。
- **AC5** §7.2 的真实浏览器场景在三个引擎、两档上通过；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms` 全部通过。
- **AC6** 文档一致：`spec/tab-leader.md`（含变更记录）、API 参考（含「快速接管」一节，§4 的六项内容都在）、两版 README、CHANGELOG `[0.3.0]`、兼容性文档的新增清单步骤、发布记录 0.3.0 行（写明 V5 前置条件）都已更新；两版 README 内容一致；API 参考写明双 Leader 窗口和不要在 `focus` 里无条件调用。
- **AC7** 示例页有 `requestLeadership()` 按钮，`pnpm demo` 多开标签页时点击能看到 Leader 切换。
- **AC8** `package.json` 的 `version` 为 `0.3.0`（经公共变更请求批准）。

发布本身（V4 首个接入方联调、V5 旧浏览器实测、`pnpm publish --tag next`、读回 registry）按 [docs/release.md](../docs/release.md) 由仓库所有者安排，不属于本模块的完成条件。

## 11. 假设（交审时请确认）

- **A1** `requestLeadership()` 返回 `void`，不返回 Promise 或布尔值；结果通过 `onLeader`／`isLeader` 观察，与 `relinquish()` 风格一致。
- **A2** 「无效」的范围比批准方向多列了两种：`pagehide` 暂停期间（bfcache 里的页面不该抢主）、非浏览器环境（`mode` 为 `'none'`，等同未 `start()`）。
- **A3** `relinquish()` 之后等待重新参选的那段时间里调用**有效**：取消等待、立即抢主。理由是那时本页已不是 Leader；调用方主动要当主，以调用方为准。
- **A4** 租约档读回确认发现被别的标签页覆盖时，保持追随者、不自动重试；调用方需要的话自己再调一次。
- **A5** 不做退避和限流（R17 第 6 条）；并排窗口互抢的风险靠文档引导调用方只在 `visibilitychange` 里调用。
- **A6** 「快速接管」推荐参数写在文档里，不改默认值，也不新增「快速模式」之类的选项。
- **A7** 示例页加按钮、兼容性文档 4.3 节加一步、e2e 加场景都算在本模块内：V5 要在旧浏览器上手动测抢主，示例页必须能触发它。
- **A8** `package.json` 的版本号改动按公共文件处理，构建时发【公共变更请求】；本模块只准备版本号、CHANGELOG 和发布记录，不执行发布；发布记录 0.3.0 行的日期在仓库所有者实际发布时填写。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | 初稿，按仓库所有者 2026-11-24 批准的接口方向编写 |
