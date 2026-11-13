# 实现计划：tab-leader 0.1.0

<!-- spec-guard: review pending -->

> 需求文档：[spec/tab-leader.md](../../spec/tab-leader.md)（已批准）　｜　任务清单：[todo.md](todo.md)
> 本计划只写「按什么顺序做、怎么验证」；行为规则引用 Spec 编号（R*、I*、AC*）。

## 概述

从空仓库做到「库本身可以交给首个接入方联调」，即[发布策略](../../docs/release.md#验证阶段)的 V1～V3：工程与工具链 → 下层 `createTabLeader`（solo → locks → 停摆接管 → lease）→ 上层 `createTabInterval` → 变异检查 → 示例页与 Playwright → 打包验证、体积报告 → 文档定稿与治理文件。V4（首个接入方用 tgz 本地联调）、V5（旧版本实测）、V6（发 `next`）、V7（打 `latest`）**不在本计划内**；建远端仓库、推送、发布到时另问。

## 架构决定

| 决定 | 依据 |
|---|---|
| 闭包工厂函数，不用 class；只有 `start()` 碰浏览器 API | Spec §8、R1、R3 |
| 三档各自一个文件（`locks.ts`、`lease.ts`），由 `leader.ts` 的状态机统一调度；档位只通过一个小接口（参选、放弃、核对所有权）与状态机交互 | 便于单独测试，降级时只换档位实现 |
| 代次（generation）在状态机里统一维护，所有异步回调都经同一个 `guard(gen, fn)` 包装 | R14；避免每处手写比对漏掉 |
| 上层只通过下层的公开回调 + 一个内部「核对所有权」函数协作，不读下层私有状态 | I1 第 1 步；公开 API 不暴露这个函数 |
| 所有存储读写走 `env.ts` 的安全函数，异常不外抛 | Spec §8、I5 |
| 测试先移植假浏览器环境，再按场景写用例；每个任务先写失败的用例（TDD） | Spec §9.1 |
| 工具链按 ADR-0005：TS 6.0、tsdown、vitest、Playwright、ESLint + typescript-eslint + eslint-plugin-compat、Prettier | ADR-0005 |
| 示例页和 Playwright 共用同一个页面（`demo/index.html`，加载 `dist/` 的 ESM 产物），静态服务器用 Node 自带模块写，不加依赖 | Spec §9.2、AC9 |

## 任务

每个任务：先写测试（或检查脚本），再实现，跑通该任务的验证，然后本地提交一次。

### 阶段 0：工程与工具链（高风险先做）

**T1 构建链与产物检查**（M）
- 内容：`package.json`（`type: module`、`exports` 三条件、`files`、`sideEffects: false`、`publishConfig`、`packageManager`、`engines`、browserslist、空 `dependencies`）、`tsconfig.json`（`lib: ["ES2017", "DOM"]`、strict）、`tsdown.config.ts`（ESM + CJS + d.ts，`target: es2017`）、`scripts/check-dist.mjs`（acorn 以 ES2017 解析产物、打印体积）、`src/types.ts` 与 `src/index.ts`（先只导出类型和占位函数）。
- 验收：`pnpm build` 产出 `dist/index.js`、`index.cjs`、`index.d.ts`、`index.d.cts`；`check-dist` 通过；故意在源码里写一个 ES2017 以后的内置 API（如 `Object.hasOwn`），`pnpm typecheck` 报错。
- **Q1 实测**：在临时目录用 TypeScript 5.2 对 `dist/index.d.ts` 做 `tsc --noEmit`，结果写进 todo。
- 文件：`package.json`、`tsconfig.json`、`tsdown.config.ts`、`scripts/check-dist.mjs`、`src/types.ts`、`src/index.ts`、`pnpm-lock.yaml`

**T2 质量链**（S）
- 内容：`eslint.config.js`（`@eslint/js` + typescript-eslint + eslint-plugin-compat，`settings.polyfills` 只登记 `navigator.locks` 并注释）、`.prettierrc`、`.prettierignore`、`vitest.config.ts`（v8 覆盖率，阈值 90%）、`package.json` 脚本（`lint`、`test`、`typecheck`、`check:terms`）。
- 验收：`pnpm lint` 通过；源码里临时写 `crypto.randomUUID()`，`pnpm lint` 报兼容错误；`pnpm test` 能跑（空用例集通过）。
- 文件：`eslint.config.js`、`.prettierrc`、`.prettierignore`、`vitest.config.ts`、`package.json`

**检查点 C1（report）**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全通过；Q1 结论记入 todo。Q1 不通过时按 Spec Q1 调整 d.ts 生成方式，仍不通过则停下问用户（属于「结果未知」）。

### 阶段 1：下层 `createTabLeader`

**T3 假浏览器环境与 env**（M）
- 内容：把前身实现的假浏览器环境移植为 `test/world.ts`（多标签页共享时钟、localStorage、Web Locks；`steal` 与 `AbortError`；冻结时任务排队、解冻后投递；只给其他标签页派发 `storage` 事件；关闭标签页时清掉它的锁；时钟跳变）。`src/env.ts`：组装浏览器环境、存储探测（R1）、安全读写 JSON。
- 验收：`test/world.test.ts` 覆盖假环境自身的关键行为（锁排队、steal、冻结排队、storage 事件只发给他人）；`env.ts` 单测覆盖读 `window.localStorage` 抛错、探测失败、JSON 损坏。
- 文件：`test/world.ts`、`test/world.test.ts`、`src/env.ts`、`test/env.test.ts`

**T4 状态机、生命周期与 solo 档**（M）
- 内容：`src/leader.ts`：状态（idle／waiting／leader／suspended／destroyed）、代次与 `guard`、回调配对与异步重抛（R15）、`start`／`destroy`／`relinquish` 骨架、生命周期监听注册与移除（R13）、`strategy` 选档（R2）、非浏览器环境（R3）、solo 档。
- 验收用例：solo 下每个标签页都是 Leader；无 `window` 时 `mode === 'none'`、不报错；创建时不访问任何浏览器 API；回调严格交替、抛错不打断；`destroy` 移除全部监听、之后 `start` 无效；bfcache 暂停与恢复、重复 `pageshow`、普通加载的 `pageshow`。
- 文件：`src/leader.ts`、`src/index.ts`、`test/leader.solo.test.ts`、`test/ssr.test.ts`

**T5 Web Locks 档：基本选主**（M）
- 内容：`src/locks.ts`：R4、R7、R8；`relinquish` 的 Web Locks 行为（R12）。
- 验收用例：5 个标签页只有一个 Leader；Leader 关闭后接手；排队中被暂停的标签页拿到锁后立即释放；被 steal 后收到 `onFollower` 并重新排队；`relinquish` 后排到队尾；不同 `name` 互不影响。
- 文件：`src/locks.ts`、`src/leader.ts`、`test/leader.locks.test.ts`

**T6 Web Locks 档：存活记录与停摆接管**（M）
- 内容：R5、R6；切回前台时的检查（R13）。
- 验收用例：Leader 冻结超过 `stallTimeout` 后被接管；短暂挂起不被抢；旧 Leader 解冻后先读存活记录就让出（不等 `AbortError`）；没有存活记录、记录损坏、记录时间在未来都不抢；没有 localStorage 时不接管。
- 文件：`src/locks.ts`、`test/leader.stall.test.ts`

**T7 租约档**（M）
- 内容：`src/lease.ts`：R9～R11、`storage` 事件、`relinquish` 的租约行为（R12）、运行中存储失效降级为 solo。
- 验收用例：3 个标签页只有一个 Leader；正常关闭删租约后立即接手；挂起超过有效期后被接手；旧 Leader 恢复后放弃；pagehide 删租约；存储失效降级（先 `onFollower` 再 `onLeader`）；能力四种组合；`strategy: 'lease'` 在有 Web Locks 时也走租约。
- 文件：`src/lease.ts`、`src/leader.ts`、`test/leader.lease.test.ts`

**检查点 C2（report）**：下层全部用例通过；`pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；覆盖率先记录不卡。

### 阶段 2：上层与质量

**T8 `createTabInterval`**（M）
- 内容：`src/interval.ts`：I1～I6；内部核对所有权函数；迁移兼容（旧格式 `:lease`、`:last`）。
- 验收用例：Spec §9.1「上层」与「迁移兼容」两组全部场景。
- 文件：`src/interval.ts`、`src/index.ts`、`test/interval.test.ts`、`test/compat.test.ts`

**T9 变异检查与覆盖率**（S）
- 内容：按 Spec §9.1 的 11 条变异逐条改坏源码、跑测试、还原，结果写进 todo（变异、失败的用例名）；覆盖率达到语句、分支 ≥ 90%，没覆盖的行写原因。没被抓到的变异要补用例。
- 验收：11 条全部有用例失败；覆盖率达标；源码还原后 `git diff src/` 为空（除补的用例）。
- 文件：`test/*.test.ts`（补用例）、`tasks/tab-leader/todo.md`

**检查点 C3（gate）**：核心库完成。停下交给你看：单测与变异结果、覆盖率、实际 API 与 Spec 是否有出入、Q1 结论、产物体积。批准后再做浏览器测试和文档。**不含推送和开 PR。**

### 阶段 3：示例页与真实浏览器测试

**T10 示例页**（S）
- 内容：`demo/index.html`（显示本标签页是否 Leader、`mode`、事件日志；`?strategy=lease|solo`、`?interval=` 参数；一个 `createTabInterval` 区块）、`scripts/serve.mjs`（Node 自带 `http` 模块的静态服务器）、`pnpm demo`。
- 验收：本地打开 3 个标签页，看到只有一个 Leader，关掉后切换；`?strategy=lease` 时 `mode` 显示 `lease`。**UI 自验**：用浏览器打开页面截图，写清看了什么。
- 文件：`demo/index.html`、`scripts/serve.mjs`、`package.json`

**T11 Playwright 三引擎**（M）
- 内容：`playwright.config.ts`（Chromium、Firefox、WebKit；`webServer` 用 `scripts/serve.mjs`）、`e2e/leader.spec.ts`（Spec §9.2 的场景）。冻结接管只在 Chromium 上用 CDP `Page.setWebLifecycleState` 做；bfcache 尽力，测不了的标记跳过并写原因（Q3）。
- 验收：`pnpm test:browser` 三个引擎全部通过（跳过的有说明）；同一套用例连续跑 3 次都通过（防偶发失败）。
- 需要下载 Playwright 的浏览器（`pnpm exec playwright install chromium firefox webkit`，从 Playwright 官方源下载，约数百 MB）。
- 文件：`playwright.config.ts`、`e2e/leader.spec.ts`、`package.json`

**检查点 C4（report）**：三引擎结果写进 `docs/compatibility.md` 3.1 节。

### 阶段 4：交付

**T12 打包验证与体积报告**（S）
- 内容：`scripts/verify-consumers.mjs`：`pnpm pack` 后在临时目录建两个最小工程并安装 tgz：① Vite 5 + `@vitejs/plugin-legacy` 5.4.1，TypeScript ~5.2 类型检查 + 构建；② Nuxt 3.11，构建并确认服务端渲染时 import 不报错。体积：tgz、`dist` 各文件原始与 gzip、两层合计 minify + gzip（用 tsdown 自带的 minify 另出一份临时产物来测）。
- 验收：两个工程都通过；体积报告写进 todo（≤ 3 KB 或说明原因）。
- 文件：`scripts/verify-consumers.mjs`、`package.json`

**T13 文档定稿与治理文件**（M）
- 内容：新增 `docs/guide/migration.md`（从自研实现迁移的通用说明，AC10）；API 参考按 `src/types.ts` 定稿（去掉「草案」）；场景示例逐个实跑；两版 README 同步并去掉「开发中」里与实际不符的说法（仍注明未发布）；`AGENTS.md` 命令段去掉「还不存在」；新增 `CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/`（bug、功能建议）。
- 验收：AC7 逐项核对；相对链接检查无断链；两版 README 段落一一对应。
- 文件：`docs/guide/migration.md`、`docs/guide/api.md`、`docs/guide/recipes.md`、`README.md`、`README.en.md`、`AGENTS.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/*`

**T14 CI 配置文件**（XS）
- 内容：`.github/workflows/ci.yml`：Node 22 与 24；`pnpm install --frozen-lockfile`、`lint`、`typecheck`、`test`、`build`、`test:browser`。**只写文件，不推送**；推送后才会生效，到时另问。
- 验收：用 `actionlint` 不可用时，至少人工核对 YAML 语法与命令与 `package.json` 一致。
- 文件：`.github/workflows/ci.yml`

**检查点 C5（gate）：最终验收**。按 AC1～AC10 逐条给证据，附改动文件表、新增依赖表、提交表；交出 tgz 包（放在仓库外的共享目录，不提交进仓库）。**不含推送、建远端仓库和发布**。验收通过后，通知负责首个接入方的会话开始 V4 联调；联调发现的问题回到本仓库，按修复走一轮 V1～V3 再出新的 tgz。

## 会改哪些文件

- 全部在本仓库内；不碰首个接入方和其他项目。
- 新增目录：`src/`、`test/`、`e2e/`、`demo/`、`scripts/`（已有）、`.github/`、`tasks/tab-leader/`。
- 修改：`package.json`（新建）、文档（T13）、`docs/compatibility.md`（C4）。
- **新增开发依赖**（运行时依赖仍为空）：`typescript@~6.0.3`、`tsdown@~0.23.7`、`vitest@~5.1.0`、`@vitest/coverage-v8@~5.1.0`、`@playwright/test@~1.65.0`、`eslint@~10.14.0`、`@eslint/js@^10.0.1`、`typescript-eslint@~8.72.2`、`eslint-plugin-compat@~7.0.2`、`globals`（ESLint 浏览器全局，版本装时查）、`prettier@~3.10.1`、`acorn@~8.19.0`。T12 的样例工程依赖装在临时目录，不进本仓库。

## 文档交付

| 文档 | 任务 | 动作 |
|---|---|---|
| `docs/guide/api.md`、`docs/guide/recipes.md` | T13 | 草案 → 定稿 |
| `README.md`、`README.en.md` | T13 | 同步实际实现 |
| `docs/compatibility.md` | C4、T13 | 补 CI 三引擎结果；旧版本行仍为「推断」，发版前手动实测再改 |
| `docs/guide/migration.md` | T13 | 新建 |
| `CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、Issue 模板 | T13 | 新建 |
| `AGENTS.md` | T13 | 命令段更新 |

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| TS 6 生成的 d.ts 不能被 TS 5.2 读取（Q1） | 高：首个接入方用不了 | T1 就实测；不行先调整声明生成，仍不行在 C1 停下问 |
| tsdown 0.x 的降级或配置与文档不符 | 中 | `check-dist` 用 acorn 兜底；版本锁 `~0.23.7` |
| 假浏览器环境移植走样，测试通过但真实浏览器不行 | 高 | T3 给假环境本身写用例；T11 用真实浏览器复核同样的场景 |
| Playwright 下冻结、bfcache 不可控，测试偶发失败 | 中 | 冻结只在 Chromium 用 CDP；bfcache 尽力并允许跳过；用短的时长参数、按事件等待而不是固定等待；连续 3 次通过才算 |
| WebKit 在 Playwright 下的 Web Locks／`storage` 事件行为与 Safari 不同 | 中 | 只把 CI 结果当「当前引擎」证据，兼容文档里旧版 Safari 仍标推断 |
| 体积超过 3 KB | 低 | 不卡交付，说明原因 |
| 样例工程安装依赖需要联网、可能慢 | 低 | T12 在后台跑；失败时报告原因，不改用别的版本凑通过 |

## 中途会停下来问你的地方

- **C3（gate）**：核心库完成后，看 API 与 Spec 的出入、单测与变异、Q1、体积，再继续。
- **C5（gate）**：最终验收，交出 tgz，之后进入 V4。
- 两个 gate 都**不含推送、建远端仓库、发布**。
- 另外只在这些情况停下：C1 的 Q1 不通过且调整无效；测试改不红；Spec 没覆盖的决定；同一目标第二次过不去；权限被拒。

## 待定问题

无新增。Spec 的 Q1（T1）、Q2（T12）、Q3（T11）在对应任务里给结论，写回 Spec。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-13 | 初稿 |
| 2026-11-13 | 按七个验证阶段调整：本计划覆盖 V1～V3；T13 新增迁移说明；C5 交出 tgz 并通知开始 V4 |
