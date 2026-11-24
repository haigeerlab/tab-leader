# 任务清单：request-leadership（0.3.0）

> 计划：[plan.md](plan.md)　｜　需求：[spec/request-leadership.md](../../spec/request-leadership.md)
> 每个任务完成时记：提交号、文件数、验证结果。

- [ ] T1 选主核心与 Web Locks 档（R17 第 1、2、4～6 条；Spec §7.1 Web Locks 各行与通用各行）
- [ ] T2 租约档（R17 第 3 条；Spec §7.1 租约各行）
- [ ] T3 变异检查（9 条）与覆盖率 ≥ 90%
- [ ] 检查点 C1（report）：lint、typecheck、test、build 全部通过
- [ ] T4 示例页按钮与真实浏览器场景（含 UI 自验）
- [ ] T5 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考（含「快速接管」）、两版 README、兼容性清单
- [ ] T6 版本号、CHANGELOG `[0.3.0]` 与发布记录（`package.json` 经公共变更请求）
- [ ] T7 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms --history`）
- [ ] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
