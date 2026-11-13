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
| 代码检查 | ESLint + `@eslint/js` + typescript-eslint | ESLint 10.14.x、typescript-eslint 8.72.x |
| 格式化 | Prettier | 3.10.x |
| 产物语法检查 | acorn | 8.19.x |
| 包管理 | pnpm（`packageManager` 锁定） | 11.x |
| Node（开发和构建） | `>=22.18` | 由 tsdown 的 `engines`（`^22.18.0 \|\| ^24.11.0 \|\| >=26`）决定 |
| 脚手架 | 不用，手写配置 | — |

## 各项的备选方案与理由

### 语言：TypeScript，而不是纯 JS + JSDoc

公开库的类型声明是给使用者的契约。用 TS 写，类型和实现在同一处，不会脱节。纯 JS 加 JSDoc 也能生成 d.ts，但复杂类型写起来啰嗦，也不好表达。

### TS 版本：6.0，而不是 7.0

最初倾向用 7.0（最新版，构建更快），查询依赖时发现：**typescript-eslint 8.72.2 的 peer 依赖要求 `typescript >=4.8.4 <6.1.0`，不支持 TS 7**。要用 TS 7，就只能放弃 ESLint 的 TS 规则，改用 oxlint 这类不依赖 TS 的检查器。

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

Playwright 一套测试就能跑 Chromium、Firefox、WebKit。在 Chromium 上，它可以通过 CDP（`Page.setWebLifecycleState`）冻结页面，冻结接管的测试必须用到这个能力。

### 代码检查和格式化：ESLint + typescript-eslint + Prettier

| 备选 | 为什么不选 |
|---|---|
| Biome 2.6 | 一个工具同时管检查和格式化，速度快；但社区贡献者不如对 ESLint 熟，规则生态也小一些 |
| oxlint 1.93 | 很快，也不依赖 TS 版本；但缺 typescript-eslint 那种基于类型信息的规则 |

ESLint 与 pwa-platform 一致。格式化单独用 Prettier，不在 ESLint 里管格式。

### 脚手架：不用

总共只需要这几个配置文件：`package.json`、`tsconfig.json`、`tsdown.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`eslint.config.js`、`.prettierrc`。脚手架模板会带进用不到的依赖和文件。

## 影响

- 只增加开发依赖，运行时依赖仍然为空。
- 产物要能被首个接入方使用的 TS 5.2 读取（需求文档 AC5），计划的第一个任务就验证这一点。
- 工具链升级（包括升到 TS 7）不影响使用者，但要在 CHANGELOG 里记录。
