# 实现计划：request-leadership（0.3.0）

<!-- spec-guard: review approved -->

> 需求文档：[spec/request-leadership.md](../../spec/request-leadership.md)（已批准，2026-11-25）　｜　任务清单：[todo.md](todo.md)
> 本计划只写「按什么顺序做、怎么验证」；行为规则引用 Spec 编号（R17、AC*、A*）。

## 概述

给 `createTabLeader` 加 `requestLeadership()`（R17）：先用 TDD 写选主核心与 Web Locks 档，再写租约档，然后做变异检查；接着给示例页加按钮、补真实浏览器场景并打开页面自验；再同步文档（`spec/tab-leader.md`、API 参考含「快速接管」、两版 README、兼容性清单），最后准备 0.3.0 的版本号、CHANGELOG 和发布记录。推送、发布、移动 `latest`、V5 旧浏览器实测不在本计划内。

## 架构决定

| 决定 | 依据 |
|---|---|
| `Driver` 接口新增 `takeOver(): void`；`CoreHandle` 新增 `requestLeadership()`：只在 `state === 'waiting'` 且 `mode !== 'solo'` 时调用 `driver.takeOver()`，其他状态（`idle`、`leader`、`suspended`、`destroyed`）直接返回 | R17 第 1 条；`relinquish()` 后等待重新参选时 `state` 也是 `'waiting'`（A3） |
| Web Locks 档：把 `checkStall()` 里「`core.newGeneration(); request(true)`」抽成 `steal()`，停摆接管和 `takeOver()` 共用 | R17 第 2 条「做法与 R6 相同」 |
| 租约档：把 `tryAcquire()` 里「等 `leaseConfirmDelay` 读回、`mine` 就当选、`failed` 就降级」抽成 `confirmLater()`；`takeOver()` = `core.newGeneration()` → `competing = true`、`acquiring = false` → 不看现有租约直接 `writeLease()`（失败降级）→ `confirmLater()` → `loop()` 重启续期循环 | R17 第 3 条；代次 +1 已清掉旧的续期、确认和重新参选计时器，所以要重启 `loop()` |
| 确认失败时什么都不多做：`loop()` 已在跑，下一轮照常按 R10 参选 | R17 第 3 条、A4 |
| 不加退避、不加「抢主进行中」标志：重复调用再走一遍第 2、3 条，代次保证旧的那次不起作用 | R17 第 5、6 条、A5 |
| `src/leader.ts` 把 `core.requestLeadership` 暴露到 `TabLeader`；`src/interval.ts` 不动 | Spec §1.3 |
| 新用例放新文件 `test/leader.request.test.ts`，复用 `test/world.ts`、`test/helpers.ts`；现有测试文件不改 | AC3 |
| 示例页按钮 `id="request-leadership"`，与 `relinquish()` 按钮并排；e2e 通过点击这个按钮触发 | A7、Spec §7.2 |

## 任务

每个代码任务：先写测试并看到它失败，再实现，跑通该任务的验证，然后本地提交一次。

**T1 选主核心与 Web Locks 档**（S）
- 内容：`src/types.ts` 给 `TabLeader` 加 `requestLeadership()` 和英文 JSDoc；`src/core.ts` 加 `Driver.takeOver` 与 `CoreHandle.requestLeadership`（solo 驱动的 `takeOver` 为空操作）；`src/locks.ts` 抽出 `steal()` 并实现 `takeOver`；`src/lease.ts` 先放一个空的 `takeOver` 让类型通过；`src/leader.ts` 暴露方法。单测覆盖 Spec §7.1 的 Web Locks 各行（3 标签页抢主、原 Leader 冻结时抢主、`AbortError` 晚到由 R5 先让出、没有 localStorage、抢主后新 Leader 关闭、抢锁未授予即被拒绝降级）以及与档无关的各行（无效情况、重复调用、两个标签页先后调用、`relinquish()` 后等待期间调用）。
- 验收：新用例实现前失败、实现后通过；现有测试文件未改动且全部通过。
- 文件：`src/types.ts`、`src/core.ts`、`src/locks.ts`、`src/lease.ts`、`src/leader.ts`、`test/leader.request.test.ts`

**T2 租约档**（S）
- 内容：`src/lease.ts` 抽出 `confirmLater()` 并按架构决定实现 `takeOver`。单测覆盖 Spec §7.1 的租约各行（3 标签页抢主、原 Leader 收不到 `storage` 事件时在续期核对让出、确认前被覆盖则保持追随者不重试、写入抛错降级 solo、原 Leader 让出后不删新租约且不抢回），并在 `strategy: 'lease'` 下重跑无效情况、重复调用、`relinquish()` 后等待期间调用三行。
- 验收：新用例实现前失败、实现后通过；现有测试全部通过。
- 文件：`src/lease.ts`、`test/leader.request.test.ts`

**T3 变异检查与覆盖率**（S）
- 内容：按 Spec §7.1 的 9 条变异逐条手动改源码，记下每条失败的用例数，改回；跑覆盖率。没被杀死的变异补用例。
- 验收：9 条变异都有用例失败；语句、分支覆盖率 ≥ 90%；结果记进 todo。
- 文件：只有补用例时改 `test/leader.request.test.ts`；更新 `tasks/request-leadership/todo.md`

**检查点 C1（report）**：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过，结果记进 todo 后继续。

**T4 示例页按钮与真实浏览器场景**（S）
- 内容：`demo/index.html` 加 `requestLeadership()` 按钮（日志照现有 `onLeader`／`onFollower` 记录，不另加日志项）；`e2e/leader.spec.ts` 在现有 `locks`／`lease` 循环里各加一个场景：三个页面，在一个追随者页面点按钮，它成为 Leader、原 Leader 日志有 `onFollower`、轮询期间始终只有一个 Leader。
- 验收：`pnpm test:browser` 在 Chromium、Firefox、WebKit 上通过（新场景 6 个）；**UI 自验**：`pnpm demo` 起示例页，在浏览器里开两个标签页，在 Follower 标签页点按钮，确认它变成 Leader、另一页显示 Follower 且日志有 `onFollower`，`?strategy=lease` 再看一遍；把看到的写进 todo。
- 文件：`demo/index.html`、`e2e/leader.spec.ts`

**T5 文档同步**（M）
- 内容：
  - `spec/tab-leader.md`：§2.1 `TabLeader` 加方法；§3.4 在 R12 之后新增 R17；§3.8 加原 Leader 被系统暂停时的双 Leader 窗口；§9.1「通用」分组加抢主场景、变异清单加 R17 条目；§9.2 加抢主场景；「变更记录」追加一行。
  - `docs/guide/api.md`：对应版本改为 0.3.0；`TabLeader` 成员表加 `requestLeadership()`（异步、无效情况、双 Leader 窗口、不要在 `focus` 里无条件调用）；`createTabLeader` 一节之后新增「快速接管」，含 Spec §4 的六项内容。
  - `README.md`、`README.en.md`：快速上手的 `createTabLeader` 示例加 `leader.requestLeadership()` 一行并链接「快速接管」；两版内容一致。
  - `docs/compatibility.md`：4.3 节清单新增一步（在追随者标签页点 `requestLeadership()`，它成为 Leader、原 Leader 日志有 `onFollower`、任何时候只有一个 Leader），4.4 节说明不变；不填实测结果。
- 验收：`pnpm lint`（Prettier）、`pnpm check:terms` 通过；两版 README 逐句对照一致；API 参考的「快速接管」逐项对照 Spec §4。
- 文件：`spec/tab-leader.md`、`docs/guide/api.md`、`README.md`、`README.en.md`、`docs/compatibility.md`

**T6 版本号、CHANGELOG 与发布记录**（XS）
- 内容：`CHANGELOG.md` 新增 `[0.3.0] - 待发布`（「新增」一节写 `requestLeadership()` 和「快速接管」文档）；`docs/release.md` 发布记录加 0.3.0 一行：标签 `next`、日期「待发布」，写明改了选主逻辑、要走 V1～V7、V5 至少重测 Safari 13.1 `lease` 档（含新增的抢主步骤）后才能发 `next`；`package.json` 的 `version` 改为 `0.3.0`：发【公共变更请求】（A8），批准后照答复由模块协调落地，再 `module-crew sync` 合入。
- 验收：`pnpm build`、`pnpm check:terms` 通过；`package.json` 改动按公共变更请求的答复落地。
- 文件：`CHANGELOG.md`、`docs/release.md`、`package.json`（经公共变更请求）

**T7 合入集成分支并全量检查**（XS）
- 内容：`module-crew sync`；然后跑 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms --history`。
- 验收：全部通过（AC5）。
- 文件：无（合并提交除外）

**检查点 C2（gate）：最终验收**。按 Spec AC1～AC8 逐条给证据，附改动统计与越界检查，并说明 `spec/tab-leader.md` 本模块的改动（便于与上个模块的 I7 一并复审），发最终验收【交审】给模块协调。**不含推送和发布。**

## 风险

| 风险 | 应对 |
|---|---|
| 租约档 `takeOver` 代次 +1 会清掉 `relinquish()` 挂着的重新参选计时器和续期循环，漏重启会让新 Leader 不续期 | 架构决定里明确 `takeOver` 末尾重启 `loop()`；T2 用例检查抢主成功后续期照常、到期不丢 Leader |
| 被抢的 Web Locks 请求在测试假环境里 `AbortError` 的投递时机与真实浏览器不同 | 单测覆盖「`AbortError` 晚到由 R5 先让出」；T4 在三个真实引擎上再验一次 |
| e2e 在 Firefox／WebKit 上 `locks` 档抢锁的时序不稳定导致偶发失败 | 用轮询等待最终状态，不用固定延时；连续跑 3 次都通过才算 |
| `package.json` 的版本号改动是公共文件，等待答复会挡住 T6 | T6 的其他文件先做；版本号等答复，必要时经用户同意记为延期项 |
| 文档里写出接入方的具体信息 | 只写通用场景；每次提交前跑 `pnpm check:terms` |

## 不做

推送、开 PR、`npm publish`、移动 `latest`；V4 接入方联调、V5 旧浏览器手动实测；改存储格式或默认时长；给 `createTabInterval` 加抢主；「可见时自动当主」选项；抢主退避或限流。

## UI 自验

T4 改示例页，在该任务里打开页面验证（见 T4 验收）；其他任务不涉及 UI，todo 里记「UI 未涉及」。
