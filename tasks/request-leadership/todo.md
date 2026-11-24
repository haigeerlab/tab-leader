# 任务清单：request-leadership（0.3.0）

> 计划：[plan.md](plan.md)　｜　需求：[spec/request-leadership.md](../../spec/request-leadership.md)
> 每个任务完成时记：提交号、文件数、验证结果。

- [x] T1 选主核心与 Web Locks 档（R17 第 1、2、4～6 条；Spec §7.1 Web Locks 各行与通用各行）— `ac5ab7a`，6 个文件。`test/leader.request.test.ts` 新增 14 个用例（实现前 14 个全部失败，实现后通过）；现有测试文件未改动，全部 135 个用例通过。UI 未涉及
- [x] T2 租约档（R17 第 3 条；Spec §7.1 租约各行）— 本提交，2 个文件（`src/lease.ts` 抽出 `confirmLater()`、实现 `takeOver`；测试文件）。新增租约档 5 个用例，通用规则 7 个用例改为 `locks`／`lease` 两档都跑；实现前 7 个失败，实现后 26 个全部通过；全部 147 个用例通过。UI 未涉及
- [ ] T3 变异检查（9 条）与覆盖率 ≥ 90%
- [ ] 检查点 C1（report）：lint、typecheck、test、build 全部通过
- [ ] T4 示例页按钮与真实浏览器场景（含 UI 自验）
- [ ] T5 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考（含「快速接管」）、两版 README、兼容性清单
- [ ] T6 版本号、CHANGELOG `[0.3.0]` 与发布记录（`package.json` 经公共变更请求）
- [ ] T7 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms --history`）
- [ ] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
