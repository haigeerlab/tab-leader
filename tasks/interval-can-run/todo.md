# 任务清单：interval-can-run（0.2.0）

> 计划：[plan.md](plan.md)　｜　需求：[spec/interval-can-run.md](../../spec/interval-can-run.md)
> 每个任务完成时记：提交号、文件数、验证结果。

- [x] T1 实现 `canRun` 与单测（I7；Spec §6 全部场景）— 3 个文件，新增 13 个用例（先 10 个失败，实现后全部通过）；`test/interval.test.ts` 未改动，全部 120 个用例通过。UI 未涉及
- [ ] T2 变异检查（7 条）与覆盖率 ≥ 90%
- [ ] 检查点 C1（report）：lint、typecheck、test、build 全部通过
- [ ] T3 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考、两版 README
- [ ] T4 版本号、CHANGELOG `[0.2.0]` 与发布记录（`package.json` 经公共变更请求）
- [ ] T5 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms`）
- [ ] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
