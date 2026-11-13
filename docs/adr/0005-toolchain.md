# ADR-0005：工具链选型

- 状态：已提议（随需求文档一起审批）
- 日期：2026-11-13
- 版本数据：npm registry `/<包名>/latest`，2026-11-13 查询

## 背景

库要同时产出 ESM、CJS 和类型声明，语法降到 ES2017；要做单测、在三个浏览器引擎里做真实浏览器测试；作为社区项目，还要让外部贡献者拿到就能上手。

## 决定

| 项目 | 选型 | 版本 |
|---|---|---|
| 语言 | TypeScript | **6.0.x**（6.0.3） |
| 构建 | tsdown | 0.23.x（0.23.7） |
| 单测 | vitest + `@vitest/coverage-v8` | 5.1.x |
| 真实浏览器测试 | `@playwright/test` | 1.65.x |
| 代码检查 | ESLint + `@eslint/js` + typescript-eslint + eslint-plugin-compat | ESLint 10.14.x、typescript-eslint 8.72.x、eslint-plugin-compat 7.0.x |
| 兼容范围 | browserslist 配置（写在 `package.json`），全仓唯一来源 | — |
| TS 内置库 | tsconfig `lib: ["ES2017", "DOM"]` | — |
| 格式化 | Prettier | 3.10.x |
| 产物语法检查 | acorn | 8.19.x |
| 包管理 | pnpm（`packageManager` 锁定） | 11.x |
| Node（开发和构建） | `>=22.18` | 由 tsdown 的 `engines`（`^22.18.0 \|\| ^24.11.0 \|\| >=26`）决定 |
| 脚手架 | 不用，手写配置 | — |

## 各项的备选方案与理由

### 语言：TypeScript，而不是纯 JS + JSDoc

公开库的类型声明是给使用者的契约。用 TS 写，类型和实现在同一处，不会脱节。纯 JS 加 JSDoc 也能生成 d.ts，但复杂类型写起来啰嗦，也不好表达。

### TS 版本：6.0，而不是 7.0

最初倾向用 7.0（最新版，构建更快），查询依赖时发现：**typescript-eslint 8.72.2 的 peer 依赖要求 `typescript >=4.8.4 <6.1.0`，不支持 TS 7**。要用 TS 7，代码检查就得换成 oxlint（它的类型规则基于 TS 7）。代码检查选 ESLint 的理由见下文，TS 版本跟着这个选择走。

选 6.0 的理由：

- 和 ESLint 生态兼容，社区贡献者最熟悉；
- 与 pwa-platform 一致（`^6.0.2`）；
- 降低风险：TS 7 太新，tsdown 用它生成的类型声明能否被旧版 TS 读取，还没有验证。

typescript-eslint 支持 TS 7 之后，再评估升级。届时编译器版本只影响开发，不影响使用者，升级不算破坏性变更。

### 构建：tsdown

| 备选 | 为什么不选 |
|---|---|
| Vite 库模式（vite 8.3） | 主要为应用设计，生成 d.ts 要另装 `vite-plugin-dts`；同时出 ESM 和 CJS 两种格式需要额外配置 |
| tsup 9 | tsdown 的前身，tsdown 已经接替它 |
| 只用 tsc | 要同时出 ESM 和 CJS，就得维护两份 tsconfig，`.cjs` 扩展名和 `exports` 映射也要自己处理，容易出错 |
| rollup + 插件 | 要自己拼 TS 转译、d.ts 和多格式输出，tsdown 已经把这些打包好了 |

tsdown 一条命令同时出 ESM、CJS 和 d.ts，`target: 'es2017'` 负责降级语法。它目前还是 0.x，配置项可能变化。产物另有 acorn 按 ES2017 解析来兜底，即使它的降级出了问题，也会在构建时暴露出来。

### 单测：vitest，而不是 `node:test`

vitest 自带 TS 支持和 v8 覆盖率，和 pwa-platform 一致。`node:test` 零依赖，前身实现用的就是它，但直接跑 TS 和统计覆盖率都要额外配置。前身实现的假浏览器环境与测试框架无关，可以直接移植。

### 真实浏览器测试：Playwright

| 备选 | 为什么不选 |
|---|---|
| Cypress | 不支持 WebKit 的多标签页场景，测不了 Safari 引擎 |
| WebdriverIO | 能力够用，但模拟冻结页面这类 CDP 操作不如 Playwright 直接 |

Playwright 一套测试就能跑 Chromium、Firefox、WebKit。在 Chromium 上，它可以通过 CDP 让页面停止运行，冻结接管的测试必须用到这个能力（实测 `Page.setWebLifecycleState` 只冻结后台页，自动化页面始终在前台，所以改用 `Debugger.pause` 暂停页面脚本来模拟冻结）。

### 代码检查：ESLint，而不是 oxlint

先说明 linter 在低版本兼容里的位置。兼容问题分三类，各有把关的手段：

| 风险 | 例子 | 由谁拦 |
|---|---|---|
| 新语法 | `?.`、`??`、class 字段 | tsdown 降级到 ES2017，acorn 按 ES2017 解析产物兜底 |
| 新的 JS 内置 API | `Array.prototype.at`、`Object.hasOwn`、`structuredClone` | tsconfig `lib: ["ES2017", "DOM"]`，类型检查报错（构建降级不会补 API） |
| 新的浏览器 API | `crypto.randomUUID`、`BroadcastChannel`、`AbortController` | **只有 eslint-plugin-compat** 能按 browserslist 检查；TS 的 DOM 类型不区分浏览器版本 |

最后还有真实浏览器测试和旧版本手动实测兜底。所以 linter 的选择，关键在第三类。

| | ESLint + typescript-eslint | oxlint（含类型规则 tsgolint） |
|---|---|---|
| 浏览器 API 兼容检查 | ✅ eslint-plugin-compat 7.0.2，稳定，周下载约 167 万 | ⚠️ 只能通过 JS 插件机制加载 ESLint 插件，官方标注 **alpha、不受语义化版本约束** |
| 类型规则 | ✅ | ✅ 2026-07-22 宣布稳定，实现 typescript-eslint 61 条类型规则中的 59 条 |
| TypeScript 版本 | 只能用 `<6.1.0` | 基于 TS 7（typescript-go） |
| 速度 | 慢 | 官方基准快 10～20 倍；本库只有几百行源码，体会不到 |
| 贡献者熟悉程度、生态 | 最高；与 pwa-platform 一致 | 较新 |

结论：本库的卖点是旧浏览器兼容，浏览器 API 检查应该是稳定的一等能力，不能跑在 alpha 机制上。oxlint 的速度优势对这么小的库没有意义，TS 7 只改善开发体验、不影响使用者。所以选 ESLint，TS 用 6.0。

eslint-plugin-compat 的用法：
- 读 `package.json` 里的 browserslist：`chrome >= 80, edge >= 80, firefox >= 74, safari >= 13.1, ios_saf >= 12.4`；
- 本库**有意**在功能检测之后使用的 API（目前只有 `navigator.locks`），在插件的 `settings.polyfills` 里逐个登记，并注释说明检测位置。登记清单就是「功能检测白名单」，新增条目要在代码评审时说明理由。

oxlint 的 JS 插件转正，或 typescript-eslint 支持 TS 7 以后，可以重新评估。

### 格式化：Prettier

格式化单独用 Prettier，不在 ESLint 里管格式。Biome 能同时管检查和格式化，但贡献者不如对 Prettier 熟。

### 脚手架：不用

总共只需要这几个配置文件：`package.json`、`tsconfig.json`、`tsdown.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`eslint.config.js`、`.prettierrc`。脚手架模板会带进用不到的依赖和文件。

## 影响

- 只增加开发依赖，运行时依赖仍然为空。
- 产物要能被首个接入方使用的 TS 5.2 读取（需求文档 AC5），计划的第一个任务就验证这一点。
- 工具链升级（包括升到 TS 7）不影响使用者，但要在 CHANGELOG 里记录。
