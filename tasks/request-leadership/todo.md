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
- [ ] T4 示例页按钮与真实浏览器场景（含 UI 自验）
- [ ] T5 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考（含「快速接管」）、两版 README、兼容性清单
- [ ] T6 版本号、CHANGELOG `[0.3.0]` 与发布记录（`package.json` 经公共变更请求）
- [ ] T7 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms --history`）
- [ ] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
