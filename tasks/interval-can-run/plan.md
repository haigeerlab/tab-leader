# 实现计划：interval-can-run（0.2.0）

> 需求文档：[spec/interval-can-run.md](../../spec/interval-can-run.md)（已批准，2026-11-19）　｜　任务清单：[todo.md](todo.md)
> 本计划只写「按什么顺序做、怎么验证」；行为规则引用 Spec 编号（I7、AC*、A*）。

## 概述

给 `createTabInterval` 加 `canRun`（I7）：先用 TDD 写实现和单测，再做变异检查，然后同步文档（`spec/tab-leader.md`、API 参考、两版 README），最后准备 0.2.0 的版本号、CHANGELOG 和发布记录。只改上层调度逻辑，不碰 `core.ts`、`leader.ts`、存储格式、示例页和 Playwright 用例。推送、发布、移动 `latest` 不在本计划内。

## 架构决定

| 决定 | 依据 |
|---|---|
| `canRun` 的判断放在 `tick()` 开头，紧跟 `if (!core.isLeader \|\| !core.verify()) return` 之后、`readLast()` 之前；跳过时直接 `schedule(1000)` 并返回 | I7 第 1、2、4 条 |
| 重试复用现有 `schedule()`：它先清掉旧计时器，并带代次检查，失去 Leader、`pagehide`、`destroy()` 自然让重试失效，不另加计时器或状态 | I7 第 4、6 条；R14 |
| 只有 `=== false` 才跳过；调用包在 `try/catch` 里，抛错按运行处理 | I7 第 3 条；A1 |
| 重试间隔写成模块内常量 `RETRY_DELAY = 1000`，不加选项 | I7 第 4 条 |
| 新用例放在新文件 `test/interval.can-run.test.ts`，复用 `test/interval-helpers.ts`；现有 `test/interval.test.ts` 不改 | AC4：不传时现有用例不改就通过 |

## 任务

每个任务：先写测试，再实现，跑通该任务的验证，然后本地提交一次。

**T1 实现 `canRun` 与单测**（S）
- 内容：`src/types.ts` 给 `TabIntervalOptions` 加 `canRun?: () => boolean` 和英文 JSDoc；`src/interval.ts` 按 I7 实现；`test/interval.can-run.test.ts` 覆盖 Spec §6 的全部场景（false 时不写记录、不调 `key`/`run`；已到期、`key` 变了、时钟回拨三条分支都被跳过；转 true 后 999 毫秒未运行、1000 毫秒运行；转 true 时未到期按到期时间排；抛错按 true；`check()` 照常重新判断；`destroy()` 后不再调用；失去 Leader 后重试失效；多标签页时 Leader 跳过则整个浏览器不运行）。
- 验收：新用例先失败（实现前），实现后全部通过；`test/interval.test.ts` 未改动且通过。
- 文件：`src/types.ts`、`src/interval.ts`、`test/interval.can-run.test.ts`

**T2 变异检查与覆盖率**（S）
- 内容：按 Spec §6 的 7 条变异逐条手动改 `src/interval.ts`，记下每条失败的用例数，改回；跑覆盖率。
- 验收：7 条变异都有用例失败；语句、分支覆盖率仍 ≥ 90%；结果记进 todo。
- 文件：无代码改动（只更新 `tasks/interval-can-run/todo.md`）

**检查点 C1（report）**：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过，结果记进 todo 后继续。

**T3 文档同步**（S）
- 内容：
  - `spec/tab-leader.md`：§2.2 加 `canRun` 字段；§3.6 新增 I7，I1 第 1 步后加一句引用 I7；§9.1「上层」加 `canRun` 场景，变异清单加 I7 相关条目；「变更记录」追加一行。
  - `docs/guide/api.md`：选项表加 `canRun`，写明抛错按 `true`、与 `key()` 抛错不运行的差别、跳过期间每秒调用一次（A3）。
  - `README.md`、`README.en.md`：快速上手的 `createTabInterval` 示例加 `canRun`，用通用场景「本页身份与共享身份不一致时跳过」，并写明与 `key()` 抛错处理的差别；两版内容一致。
- 验收：`pnpm lint`（Prettier）通过；`pnpm check:terms` 通过；两版 README 对照一致。
- 文件：`spec/tab-leader.md`、`docs/guide/api.md`、`README.md`、`README.en.md`

**T4 版本号、CHANGELOG 与发布记录**（XS）
- 内容：`CHANGELOG.md` 新增 `[0.2.0]`（「新增」一节写 `canRun`）；`docs/release.md` 发布记录加 0.2.0 一行：标签 `next`、日期写「待发布」（A4），写明只改上层调度逻辑、V1～V3 在本仓库完成、V5 不重做、沿用 0.1.0 的结论与延后补测项（A6）；`package.json` 的 `version` 改为 `0.2.0`：先发【公共变更请求】（A5），批准后照答复处理。
- 验收：`pnpm build` 通过；`pnpm check:terms` 通过；`package.json` 改动按公共变更请求的答复落地。
- 文件：`CHANGELOG.md`、`docs/release.md`、`package.json`（经公共变更请求）

**T5 合入集成分支并全量检查**（XS）
- 内容：`module-crew sync`；然后跑 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms`。
- 验收：全部通过（AC6）。
- 文件：无（合并提交除外）

**检查点 C2（gate）：最终验收**。按 Spec AC1～AC8 逐条给证据，附改动统计与越界检查，发最终验收【交审】给模块协调。**不含推送和发布。**

## 风险

| 风险 | 应对 |
|---|---|
| 跳过时重排 1 秒计时器，改变了现有用例依赖的计时器时序 | 不传 `canRun` 时不走新分支（I7 第 7 条）；T1 验收要求 `test/interval.test.ts` 不改就通过 |
| `package.json` 的版本号改动属于公共文件，等待答复会挡住 T4 | T4 的其他文件先做；版本号等答复，必要时经用户同意记为延期项，不挡 T5 之前的检查 |
| 文档里写出接入方的具体信息 | 只写通用场景；每次提交前跑 `pnpm check:terms` |

## 不做

推送、开 PR、`npm publish`、移动 `latest`；改选主逻辑或存储格式；新增 Playwright 场景；V5 旧浏览器手动实测。

## UI 自验

本模块不改示例页或任何用户界面；T1～T4 都不涉及 UI，todo 里记「UI 未涉及」。
