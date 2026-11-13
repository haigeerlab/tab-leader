# 版本与发布策略

## 版本号

- 遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
- **API 稳定之前保持 0.x**。0.x 期间，次版本号（0.**y**.0）可以包含破坏性变更，会在 CHANGELOG 里单独标出；修订号（0.y.**z**）只修 bug。
- 以下都算破坏性变更：公开 API 签名或行为变化、存储 key 或记录格式变化（[ADR-0003](adr/0003-name-as-key-and-record-compat.md)）、浏览器下限提高、产物语法超过 ES2017。
- 外部用户反馈让 API 稳定下来以后，再发 `1.0.0`。

## 验证阶段

一个版本从开发完成到可用于生产，要依次走过 7 个阶段。前一个阶段没通过，不进入下一个。

| 阶段 | 验证什么 | 在哪里 | 证明了什么 |
|---|---|---|---|
| **V1 库内逻辑** | 单测（假浏览器环境）、变异检查、覆盖率 ≥ 90% | 本仓库 | 规则按需求文档实现 |
| **V2 当前浏览器** | Playwright 在 Chromium、Firefox、WebKit 当前版本上跑三档逻辑；Chromium 上测冻结接管 | 本仓库（CI） | 三大引擎的当前版本行为一致 |
| **V3 打包形态** | `pnpm pack` 的包能被 Vite 5 + `@vitejs/plugin-legacy`（TypeScript 5.2 类型检查）和 Nuxt 3（含服务端渲染）引用并构建 | 本仓库的临时样例工程 | 装得上、编得过；**不证明行为正确** |
| **V4 首个接入方本地联调** | 用 tgz 包（**不发布到 npm**）替换接入方的自研实现：① 接入方原有单测和构建通过；② 在接入方的调试环境里验证多标签页、不同 `name` 互不干扰、新旧实现混开不重复、后台冻结后接管；③ 业务行为与自研实现一致 | 首个接入方的仓库 | 在真实业务里能替换掉原实现 |
| **V5 旧版本浏览器** | Chrome 80、Firefox 74、Safari 13.1、iOS 12.4 上按[兼容性文档](compatibility.md#4-手动实测清单)的清单手动实测，用示例页和接入方页面 | 真机或云真机 | 声称支持的最低版本确实可用 |
| **V6 发 `next`、接入方提测** | 发布到 `next` 标签；接入方改为依赖 npm 包，进测试环境提测 | npm、接入方测试环境 | 从 npm 安装的版本与联调的 tgz 一致，提测通过 |
| **V7 上线观察、打 `latest`** | 接入方线上稳定运行两周：没有重复执行、没有停摆 | 线上 | 可用于生产 |

- V1～V3 由本仓库的实现计划完成，模块完成即走完这三个阶段。
- V4～V7 属于发布流程。V4 的具体联调计划由接入方自己维护，不放进本仓库。
- 后续版本按改动范围决定要走哪些阶段：只改文档可以只走 V1、V2；改了选主逻辑或存储格式，要从 V1 走到 V7。

## npm 标签

| 标签 | 含义 | 条件 |
|---|---|---|
| `next` | 试用版，不对外推荐 | **V1～V5 全部通过** |
| `latest` | 可用于生产 | V6、V7 通过：接入方提测通过，并且线上稳定运行两周 |

0.1.0 的节奏：

1. 本仓库完成 V1～V3，交出 tgz 包和迁移说明。
2. 首个接入方用 tgz 本地联调（V4），同时做旧版本实测（V5），结果写进[兼容性文档](compatibility.md)。发现问题就回到本仓库修复，重新出 tgz。
3. V1～V5 通过后发 `0.1.0` 到 `next`，接入方改用 npm 包提测（V6）。
4. 上线并稳定两周（V7）后，把 `latest` 指向这个版本，README 写明「可用于生产」。
5. 在 API 稳定之前，一直保持 0.x。

## 发布流程

由仓库所有者本人在**交互终端**里执行（npm 账号开了 2FA，非交互 shell 会报 `ERR_PNPM_OTP_NON_INTERACTIVE`）：

1. 从干净的克隆、`main` 分支最新提交开始，`git status` 为空。
2. `npm whoami` 确认账号；`npm view tab-leader versions` 确认目标版本不存在。
3. 确认 V1～V5 都有记录（兼容性文档、实现计划的 todo）；`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm test`、`pnpm test:browser`、`pnpm build`、`pnpm verify:consumers`、`pnpm check:terms --history`。
4. 更新 CHANGELOG、版本号，提交并打 tag `v<版本>`。
5. `pnpm publish --access public --tag next`。
6. 到 registry 读回：`npm view tab-leader@<版本>`，确认 `dist-tags`、文件列表、`dependencies` 为空。
7. 满足 `latest` 条件后：`npm dist-tag add tab-leader@<版本> latest`，再读回确认。

推送、发布、打 `latest` 每一步都需要所有者明确同意。
