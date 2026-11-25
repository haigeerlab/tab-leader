# 任务清单：request-leadership（0.3.0）

> 计划：[plan.md](plan.md)　｜　需求：[spec/request-leadership.md](../../spec/request-leadership.md)
> 每个任务完成时记：提交号、文件数、验证结果。

- [x] T1 选主核心与 Web Locks 档（R17 第 1、2、4～6 条；Spec §7.1 Web Locks 各行与通用各行）— `ac5ab7a`，6 个文件。`test/leader.request.test.ts` 新增 14 个用例（实现前 14 个全部失败，实现后通过）；现有测试文件未改动，全部 135 个用例通过。UI 未涉及
- [x] T2 租约档（R17 第 3 条；Spec §7.1 租约各行）— 本提交，2 个文件（`src/lease.ts` 抽出 `confirmLater()`、实现 `takeOver`；测试文件）。新增租约档 5 个用例，通用规则 7 个用例改为 `locks`／`lease` 两档都跑；实现前 7 个失败，实现后 26 个全部通过；全部 147 个用例通过。UI 未涉及
- [x] T3 变异检查（9 条）与覆盖率 ≥ 90% — 本提交，2 个文件（测试文件补断言、本清单）。在全部 147 个用例上逐条验证：
  - M1 已是 Leader 时仍生效：3 个失败
  - M2 去掉 solo 档的无效判断：**0 个失败，等价变异**。solo 档 `join()` 同步当选，`state` 不会停在 `'waiting'`（降级到 solo 也一样），`state !== 'waiting'` 已经挡住；`mode === 'solo'` 这一判断按 Plan 架构决定保留作防御，无法用行为区分
  - M3 Web Locks 档去掉代次 +1：2 个失败
  - M4 Web Locks 档不带 `steal`：9 个失败
  - M5 租约档去掉代次 +1：最初 0 个失败。补断言「`relinquish()` 后等待期间抢主，原定的重新参选计时器到点后仍是 Leader」后 1 个失败（不代次 +1 时重新参选计时器照样触发，`join()` 把状态改回 `'waiting'`，有约 50 毫秒 `isLeader` 为 false）
  - M6 租约档先看现有租约：6 个失败
  - M7 租约档去掉读回确认：2 个失败
  - M8 租约档确认失败后自动重试：2 个失败
  - M9 暂停／`destroy()` 后仍生效：2 个失败
  - 覆盖率：语句 99.01%、分支 97.09%、行 100%（`core.ts` 分支 94.17%，未覆盖的是原有的 `browserEnv` 外壳与 `destroy` 分支，本模块新增代码全覆盖）。UI 未涉及
- [x] 检查点 C1（report）：lint、typecheck、test、build 全部通过 — `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 147 个用例通过；`pnpm build` 产物 ES2017 解析通过，`index.js` 17264 字节（gzip 4994，0.2.0 为 16432／4756）
- [x] T4 示例页按钮与真实浏览器场景（含 UI 自验）— 本提交，3 个文件（`demo/index.html`、`e2e/leader.spec.ts`、本清单）。`pnpm test:browser` 连跑 3 次都是 19 个通过、5 个按 Spec §9.2 跳过（原 13 个通过，新增 `locks`／`lease` 抢主场景 × 3 个引擎 = 6 个）；示例页修改后再跑 1 次，结果相同。e2e 检查的是抢主后稳定只有一个 Leader、原 Leader 最后一条日志是 `onFollower`；`locks` 档抢锁与 `AbortError` 投递之间有 Spec 已写明的极短双 Leader 窗口，所以不在抢主过程中逐次采样断言
  - **UI 自验**（内置浏览器，`node scripts/serve.mjs`，两个标签页打开同一 `name` 的示例页）：`locks` 档在 Follower 页点 `requestLeadership()`，它显示 Leader、日志多一条 `onLeader`；原 Leader 显示 Follower、日志末尾 `onFollower`。`?strategy=lease` 再做一遍，结果相同（`mode` 显示 `lease`）
  - 自验发现：示例页在 `onFollower` 里立即 `render()`，此时库的 `isLeader` 仍为 `true`（`core.ts` 先通知再改状态，`relinquish()` 也一样，是 0.1.0 起的既有行为），原 Leader 页面会一直显示「Leader」，手动实测会误以为有两个 Leader。示例页改为 `setTimeout(render, 0)`，修改后复测上述两档均显示正确。库本身的这个时序不在本模块范围内，最终验收时作为后续事项报告
- [x] T5 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考（含「快速接管」）、两版 README、兼容性清单 — 本提交，6 个文件。`spec/tab-leader.md`：§2.1 加方法、R12 之后新增 R17、§3.8 加一条已知限制、§9.1「通用」加场景与变异条目、§9.2 加场景、变更记录追加一行（写明随本模块最终验收与 I7 一并复审）；API 参考：对应版本改为 0.3.0，成员表加 `requestLeadership()`，新增「主动抢主」小节（异步、原 Leader 怎么让出、租约档尽力保证、短暂双 Leader、不要在 `focus` 里调用）和「快速接管」一节（Spec §4 六项：适用场景、推荐参数、依据、下限、未验证风险、配合 `visibilitychange` 的用法）；两版 README 快速上手加 `visibilitychange` 示例和说明、已知限制加一条，中英逐句对照一致；兼容性文档 4.3 节加第 11 步。`pnpm lint`（Prettier）、`pnpm check:terms` 通过。UI 未涉及
- [x] T6 版本号、CHANGELOG `[0.3.0]` 与发布记录（`package.json` 经公共变更请求）— `defe17b`，2 个文件（CHANGELOG `[0.3.0] - 待发布`，含示例页显示修正；发布记录 0.3.0 行写明改了选主逻辑、要走 V1～V7、发 `next` 前至少重测 Safari 13.1 `lease` 档含第 11 步）；`package.json` 的 `version` 经公共变更请求 C32 由模块协调在集成分支提交 `3ab6178`，`module-crew sync` 合入（`f72d4d5`）。`pnpm check:terms` 通过。UI 未涉及
- [x] T7 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms --history`）— sync 到集成分支 `3ab6178`（HEAD `f72d4d5`）后：`pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 147 个用例通过，覆盖率语句 99.01%、分支 97.09%、行 100%；`pnpm build` 通过，产物 ES2017；`pnpm test:browser` 19 个通过、5 个按 Spec §9.2 跳过；`pnpm check:terms --history` 通过。`package.json` 版本为 0.3.0。UI 未涉及
- [x] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
