# 任务清单：tab-leader 0.1.0

> 计划：[plan.md](plan.md)　｜　需求：[spec/tab-leader.md](../../spec/tab-leader.md)
> 每个任务完成时记：提交号、文件数、验证结果。

## 阶段 0：工程与工具链

- [x] T1 构建链与产物检查（含 Q1：TS 5.2 读取 d.ts 实测）— `ee8bc91`，10 个文件。验证：`Object.hasOwn` 触发类型错误；`?.`、`??` 被降级；ES2020 产物被 check-dist 拦下。**Q1 通过**：TypeScript 5.2.2 在 `bundler`、`node16`、`node10` 三种解析方式、`skipLibCheck: false` 下都能读取 d.ts
- [x] T2 质量链（ESLint + compat、Prettier、vitest 覆盖率）— 提交见 git log。验证：`crypto.randomUUID()` 被 compat 报错（列出 Safari 13.1、iOS 12.2～12.5、Firefox 74、Edge 80、Chrome 80）；覆盖率阈值 90% 配在 `pnpm test:coverage`，T9 起并入 `pnpm test`
- [x] 检查点 C1（report）：lint、typecheck、build、test 全部通过；Q1 通过（见 T1）

## 阶段 1：下层 `createTabLeader`

- [x] T3 假浏览器环境与 env — `cf4ab26`，4 个文件，13 个用例
- [x] T4 状态机、生命周期与 solo 档 — `855bf75`，11 个用例。说明：`core.ts` 一次写完了三档的调度框架，`locks.ts`、`lease.ts` 的驱动也在这个提交里，由 T5～T7 的用例覆盖
- [x] T5 Web Locks 档：基本选主 — `8ed8dd3`，11 个用例
- [x] T6 Web Locks 档：存活记录与停摆接管 — `a88fc81`，10 个用例
- [x] T7 租约档 — 本提交，15 个用例（一处断言写错：A 删租约后 B 立即写入自己的租约，改为断言「不再属于 A」）
- [x] 检查点 C2（report）：下层 61 个用例全部通过；lint、typecheck、build 通过；覆盖率语句 91.8%、分支 85.3%（T9 补到 90%）；产物未压缩 13.5 KB、gzip 3.9 KB（T12 测 minify 后体积）

## 阶段 2：上层与质量

- [ ] T8 `createTabInterval`（含迁移兼容）
- [ ] T9 变异检查（11 条）与覆盖率 ≥ 90%
- [ ] 检查点 C3（gate）：核心库完成，停下交审

## 阶段 3：示例页与真实浏览器测试

- [ ] T10 示例页（含 UI 自验截图）
- [ ] T11 Playwright 三引擎（连续 3 次通过）
- [ ] 检查点 C4（report）：结果写进兼容性文档

## 阶段 4：交付

- [ ] T12 打包验证（Vite 5 + legacy + TS 5.2、Nuxt 3.11）与体积报告
- [ ] T13 文档定稿、迁移说明与治理文件
- [ ] T14 CI 配置文件（只写不推）
- [ ] 检查点 C5（gate）：最终验收（AC1～AC10），交出 tgz，通知开始 V4 联调
