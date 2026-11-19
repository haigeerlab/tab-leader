# Spec：interval-can-run

<!-- spec-guard: review approved f4d3089a650b -->

> 状态：**待批准**　｜　日期：2026-11-19　｜　版本目标：`0.2.0`（npm `next`）　｜　依赖模块：`tab-leader`
> 接口方向已由仓库所有者在 2026-11-19 批准（见 §1.3）；本文把它写成可验证的规则与验收标准。
> 规则编号沿用 [spec/tab-leader.md](tab-leader.md)：本模块新增的规则记为 **I7**，构建时写进那份 Spec 的 §3.6。

---

## 1. 目标

### 1.1 要解决的问题

`createTabInterval` 只在 Leader 上运行。Leader 接手时（原 Leader 关闭、冻结后被接管、刷新），新 Leader 所在的标签页可能还处在「不适合运行」的状态：最常见的是本页持有的身份和其他标签页共享的身份不一致（比如别的标签页已经切换了登录身份，本页还没刷新）。0.1.0 里新 Leader 会按本页的旧状态执行一次，调用方无从阻止。

`key` 解决不了这个问题：`key` 变化会**触发**运行，而这里需要的是**跳过**运行，并在条件满足后尽快补上。

### 1.2 做什么

`createTabInterval` 新增可选参数 `canRun?: () => boolean`：每轮检查前问一次「本页现在能不能运行」，返回 `false` 就本轮什么都不做，1 秒后再问；返回 `true`（或不传）时行为与 0.1.0 完全一致。

### 1.3 已确认的接口方向（仓库所有者，2026-11-19）

- 调用位置：`tick()` 里确认 `core.isLeader` 且 `core.verify()` 通过之后、`readLast()` 之前。
- 返回 `false`：本轮不读写 `${name}:last`、不调 `run`、不改内存记录；key 变化立即补发、间隔到期、时钟回拨改写记录三条分支都受它控制。
- 跳过后固定 1 秒再 tick，不开放配置；`check()` 和切回前台照常重新判断；`destroy()` 之后不再重试；Leader 身份变化（代次 +1）让挂着的重试失效。
- `canRun` 抛异常按 `true` 处理（与 `key()` 抛异常时不运行相反，README 写明这个差别）。
- 不传时行为与 0.1.0 完全一致。
- 发 0.2.0 到 npm `next`，不动 `latest`；只改调度逻辑，不重做旧浏览器手动实测，在发布记录里写明。

### 1.4 用户故事

- **U1** 作为调用方，我在本页身份与共享身份不一致时让 `canRun` 返回 `false`，接手的 Leader 不会按旧身份执行任务，也不会把「上次运行」记录推后。
- **U2** 身份恢复一致后（比如本页刷新或同步完成），约 1 秒内任务按原规则补上：没有记录、`key` 变了或已到期就运行，否则继续等到期。
- **U3** 不用 `canRun` 的现有调用方升级到 0.2.0 后行为不变。

## 2. 公共 API

`TabIntervalOptions` 新增一个可选字段，其余不变：

```ts
export interface TabIntervalOptions
  extends Omit<TabLeaderOptions, 'onLeader' | 'onFollower'> {
  interval: number
  run: () => unknown
  key?: () => string
  /**
   * 可选：本页现在能不能运行。每轮检查（tick）时、读「上次运行」记录之前调用；
   * 返回 false 时本轮什么都不做（不读写记录、不运行），1 秒后再检查。
   * 抛错按 true 处理。应当是同步、便宜的判断。
   */
  canRun?: () => boolean
}
```

`TabInterval`、`createTabLeader`、存储 key 与记录格式都不变。这是新增可选参数，不是破坏性变更，版本号按次版本升到 `0.2.0`。

## 3. 行为规则

**I7** **执行前跳过**（写进 [spec/tab-leader.md](tab-leader.md) §3.6，并在 I1 第 1 步之后插入一步引用它）：

1. **调用时机**：每次 tick 在 I1 第 1 步（是 Leader，租约档已核对所有权）通过之后、读 `${name}:last` 和调用 `key()` 之前调用 `canRun()`。不是 Leader 时不调用。
2. **返回 `false`**：本轮直接结束。不读也不写 `${name}:last`，不调用 `key()` 和 `run()`，不改本页内存里的记录；I1 第 3 步（没有记录、`id` 变了、到期）和第 4 步（时钟回拨改写记录）都不发生。然后按第 4 条安排重试。
3. **返回其他值或抛错**：照 I1 往下走，与 0.1.0 相同。只有严格等于 `false` 才跳过；抛出的异常被吞掉，不重新抛出。
4. **重试**：跳过后把唯一的计时器改成 **1000 毫秒**后再 tick（替换原来的到期计时器，同一时间仍只有一个计时器）。间隔固定，不提供配置项。重试触发的 tick 按完整的 I1 + I7 重新判断，可能再次跳过、再次排 1 秒。
5. **其他触发照常**：`check()`、切回前台、成为 Leader（I3）触发的 tick 都照常先问 `canRun()`；它们重新安排的计时器取代挂着的重试。
6. **重试失效**：失去 Leader、暂停（`pagehide`）、销毁时代次 +1 并清掉计时器（R14），挂着的重试不会再执行；`destroy()` 之后不再调用 `canRun()`。
7. **不传 `canRun`**：等同于始终返回 `true`，不多安排任何计时器，行为与 0.1.0 逐条一致。

`canRun` 抛错按 `true`、`key()` 抛错不触发运行，两者方向相反，原因是：`key()` 抛错时无法判断身份变没变，宁可不补；`canRun` 是调用方额外加的闸门，闸门自己坏了不应让任务永远停住。API 参考和两版 README 都要写明这个差别。

**已知影响**（写进 API 参考）：`canRun()` 一直返回 `false` 期间，Leader 每秒调用一次 `canRun()`，任务不运行；后台计时器节流（§3.8）同样会拉长这个 1 秒。

## 4. 改动范围

| 文件 | 改什么 |
|---|---|
| `src/types.ts` | `TabIntervalOptions` 新增 `canRun?`，英文 JSDoc |
| `src/interval.ts` | `tick()` 按 I7 调用 `canRun`、安排 1 秒重试 |
| `test/interval.test.ts`（或新增 `test/interval.can-run.test.ts`） | §6 的用例 |
| `spec/tab-leader.md` | §2.2 加字段；§3.6 新增 I7、I1 插入引用；§9.1「上层」加场景、变异清单加条目；「变更记录」追加一行 |
| `docs/guide/api.md` | 选项表加 `canRun`，写明抛错按 `true`、与 `key()` 的差别、跳过时每秒调用一次 |
| `README.md`、`README.en.md` | 快速上手的 `createTabInterval` 示例加 `canRun`（通用场景：本页身份与共享身份不一致时跳过），两版内容一致 |
| `CHANGELOG.md` | 新增 `[0.2.0]` 条目，「新增」一节 |
| `docs/release.md` | 发布记录加 0.2.0 一行：标签 `next`，只改调度逻辑，不重做 V5 旧浏览器手动实测 |
| `package.json` | `version` 改为 `0.2.0`（公共文件，构建时发【公共变更请求】，批准后再改） |

不改：`src/core.ts`、`src/leader.ts`、选主逻辑、存储 key 与记录格式、示例页、Playwright 测试、`docs/compatibility.md`。

## 5. 命令

沿用 [spec/tab-leader.md](tab-leader.md) §6：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms`。提交前全部通过。

## 6. 测试策略

单测（vitest，沿用 `test/interval-helpers.ts` 的假环境）必须覆盖：

| 场景 | 期望 |
|---|---|
| `canRun` 返回 `false`，没有记录 | 不调用 `run`；`${name}:last` 不存在；`key` 不被调用 |
| `canRun` 返回 `false`，已有记录且已到期 | 不调用 `run`；记录内容与之前完全相同 |
| `canRun` 返回 `false`，`key` 已变化 | 不调用 `run`；记录不变 |
| `canRun` 返回 `false`，时钟回拨 | 记录的 `at` 不被改写 |
| `canRun` 由 `false` 转 `true` | 1000 毫秒时运行一次（999 毫秒时还没运行），记录随之写入 |
| 转 `true` 时未到期 | 不运行，按 I1 第 5 步排到到期时间 |
| `canRun` 抛错 | 按 `true` 处理：照常运行，异常不外抛 |
| 返回 `false` 后调用 `check()` | `check()` 照常重新问 `canRun`，为 `true` 时立即运行 |
| 返回 `false` 后 `destroy()` | 之后推进时间，`canRun` 和 `run` 都不再被调用 |
| 返回 `false` 后失去 Leader | 挂着的重试不执行；新 Leader 所在标签页按自己的 `canRun` 判断 |
| 多标签页：Leader 的 `canRun` 为 `false` | 其他标签页（追随者）不运行，整个浏览器不运行 |
| 不传 `canRun` | 现有上层用例全部不改就通过 |

- **变异检查**（手动，结果记进 plan）：去掉 `canRun` 调用；把 `canRun` 调用挪到 `readLast()` 之后；跳过时仍写记录；重试间隔改成 0 或改成到期时间；去掉重试的代次检查；`canRun` 抛错改为按 `false` 处理；判断由 `=== false` 改为假值。每条都要有用例失败。
- **覆盖率**：语句和分支保持 ≥ 90%（v8）。
- **真实浏览器测试**：不新增场景，现有 `pnpm test:browser` 照常通过。
- **旧版本手动实测（V5）**：不重做。理由：只改上层的调度判断，不涉及选主、存储和浏览器 API；在发布记录里写明。

## 7. 代码风格

沿用 [spec/tab-leader.md](tab-leader.md) §8：代码和注释用英文；不引入运行时依赖；产物保持 ES2017；不新增导出。

## 8. 边界

- **一定要做**：公开 API 变化同步更新本文、`spec/tab-leader.md`、API 参考、两版 README、CHANGELOG；改已批准的 `spec/tab-leader.md` 时在其「变更记录」追加一行；提交前跑 `pnpm check:terms`。
- **先问再做**：改 `package.json` 等公共文件（发【公共变更请求】）；超出 §4 的任何改动；任何推送、`npm publish`、移动 `latest`（这些由仓库所有者在交互终端完成，不在本模块里做）。
- **不能做**：文档、注释、提交信息里出现任何接入方的内部项目名、分支、环境或业务字段，一律写通用场景；改选主逻辑或存储格式；把重试间隔做成配置项。

## 9. 成功标准

- **AC1** `canRun` 返回 `false` 时不读写 `${name}:last`、不调用 `run`、不改内存记录；key 变化、到期、时钟回拨三条分支都被跳过（§6 对应用例通过）。
- **AC2** `canRun` 由 `false` 转 `true` 后 1000 毫秒内按 I1 补上（没有记录、`key` 变了或到期时运行）。
- **AC3** `canRun` 抛错按 `true` 处理；`destroy()` 后和失去 Leader 后挂着的重试不执行。
- **AC4** 不传 `canRun` 时现有单测全部不改就通过。
- **AC5** §6 的变异清单逐条验证，每条都有用例失败；覆盖率 ≥ 90%。
- **AC6** `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:browser`、`pnpm check:terms` 全部通过。
- **AC7** 文档一致：`spec/tab-leader.md`（含变更记录）、API 参考、两版 README、CHANGELOG `[0.2.0]`、发布记录 0.2.0 行都已更新，README 写明 `canRun` 与 `key()` 抛错处理的差别；两版 README 内容一致。
- **AC8** `package.json` 的 `version` 为 `0.2.0`（经公共变更请求批准）。

发布本身（`pnpm publish --tag next`、读回 registry）按 [docs/release.md](../docs/release.md) 的发布流程由仓库所有者执行，不属于本模块的完成条件。

## 10. 假设（交审时请确认）

- **A1** 只有 `canRun()` 严格返回 `false` 才跳过；返回 `undefined`、`0` 等其他值按运行处理，与「抛错按 `true`」同方向（宁可运行，不让任务停住）。
- **A2** 跳过时也不调用 `key()`（批准方向写的是「`readLast()` 之前调用」，`key()` 在 `readLast()` 之后，本文据此明确）。
- **A3** 跳过期间 Leader 每秒调用一次 `canRun()`，不做退避；这是「固定 1 秒、不开放配置」的直接结果，写进 API 参考。
- **A4** 本模块只准备 0.2.0 的版本号、CHANGELOG 和发布记录，不执行发布；发布记录里 0.2.0 那一行的日期在仓库所有者实际发布时填写（构建时先写「待发布」）。
- **A5** `package.json` 的版本号改动按公共文件处理，构建时发【公共变更请求】。
- **A6** 发布记录写明：0.2.0 只改上层调度逻辑，V1～V3 在本仓库完成，V5 旧浏览器手动实测不重做，沿用 0.1.0 的结论与延后补测项。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初稿，按仓库所有者 2026-11-19 批准的接口方向编写 |
