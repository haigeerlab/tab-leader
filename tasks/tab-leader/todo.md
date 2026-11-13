# 任务清单：tab-leader 0.1.0

> 计划：[plan.md](plan.md)　｜　需求：[spec/tab-leader.md](../../spec/tab-leader.md)
> 每个任务完成时记：提交号、文件数、验证结果。

## 阶段 0：工程与工具链

- [ ] T1 构建链与产物检查（含 Q1：TS 5.2 读取 d.ts 实测）
- [ ] T2 质量链（ESLint + compat、Prettier、vitest 覆盖率）
- [ ] 检查点 C1（report）：lint、typecheck、build、test 通过；Q1 结论

## 阶段 1：下层 `createTabLeader`

- [ ] T3 假浏览器环境与 env
- [ ] T4 状态机、生命周期与 solo 档
- [ ] T5 Web Locks 档：基本选主
- [ ] T6 Web Locks 档：存活记录与停摆接管
- [ ] T7 租约档
- [ ] 检查点 C2（report）：下层用例全部通过

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
- [ ] T13 文档定稿与治理文件
- [ ] T14 CI 配置文件（只写不推）
- [ ] 检查点 C5（gate）：最终验收（AC1～AC9）
