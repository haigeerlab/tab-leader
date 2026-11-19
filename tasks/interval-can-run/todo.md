# 任务清单：interval-can-run（0.2.0）

> 计划：[plan.md](plan.md)　｜　需求：[spec/interval-can-run.md](../../spec/interval-can-run.md)
> 每个任务完成时记：提交号、文件数、验证结果。

- [x] T1 实现 `canRun` 与单测（I7；Spec §6 全部场景）— `2ad6919`，3 个文件，新增 13 个用例（先 10 个失败，实现后全部通过）；`test/interval.test.ts` 未改动，全部 120 个用例通过。UI 未涉及
- [x] T2 变异检查（7 条）与覆盖率 ≥ 90% — 本提交，1 个测试文件。Spec 的 7 条拆成 8 个变异（重试间隔拆成「改 0」和「改到期时间」两个），在 `test/interval.can-run.test.ts` + `test/interval.test.ts`（37 个用例）上逐条验证，全部有用例失败：
  - M1 去掉 `canRun` 调用：10 个失败
  - M2 `canRun` 挪到 `readLast()`／`key()` 之后：1 个
  - M3 跳过时仍写记录：5 个
  - M4a 重试间隔改 0：12 个（含超时）
  - M4b 重试间隔改为到期时间：2 个
  - M5 去掉重试的代次检查：1 个。最初没被杀死：失去 Leader、`pagehide`、`destroy()` 都先 `clearTimeout`，假环境里旧计时器不会再触发。补了用例「clearTimeout 之后仍触发的过期重试不起作用（R14）」，用 `clearTimeout` 为空操作的环境模拟浏览器仍执行已排队的任务
  - M6 抛错按 `false`：1 个
  - M7 假值即跳过（`!canRun()`）：1 个
  - 覆盖率：语句 98.98%、分支 97.02%、行 100%（`interval.ts` 语句 100%、分支 97.77%）。UI 未涉及
- [x] 检查点 C1（report）：lint、typecheck、test、build 全部通过 — 121 个用例通过；`pnpm lint`、`pnpm typecheck` 通过；`pnpm build` 产物 ES2017 解析通过，`index.js` 16432 字节（gzip 4756）
- [x] T3 文档同步：`spec/tab-leader.md`（含变更记录）、API 参考、两版 README — 本提交，5 个文件。`spec/tab-leader.md`：§2.2 加字段、§3.6 新增 I7 并在 I1 第 1 步引用、§9.1 加场景与变异条目、变更记录追加一行；API 参考选项表加 `canRun` 并写明说明四条；两版 README 示例加 `canRun`（通用场景「本页身份与共享身份不一致时跳过」）并写明与 `key` 抛错处理相反，中英文逐句对照一致。`pnpm lint`、`pnpm check:terms` 通过。UI 未涉及
- [x] T4 版本号、CHANGELOG `[0.2.0]` 与发布记录（`package.json` 经公共变更请求）— `caf518d`，2 个文件（CHANGELOG `[0.2.0] - 待发布`、发布记录 0.2.0 行写明 V5 不重做）；`package.json` 的 `version` 经公共变更请求 C10 由模块协调在集成分支提交 `a1fb80f`，`module-crew sync` 合入（`1a8d8d0`）。UI 未涉及
- [ ] T5 `module-crew sync` 合入集成分支并全量检查（含 `pnpm test:browser`、`pnpm check:terms`）
- [ ] 检查点 C2（gate）：最终验收，按 AC1～AC8 给证据，发最终验收【交审】
