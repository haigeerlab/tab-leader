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

- [x] T8 `createTabInterval`（含迁移兼容）— 本提交，27 个用例（上层 23、迁移兼容 4）。发现并修正：`readJson` 把损坏内容当成「没有记录」，违反 I5，改为缺失返回 `null`、损坏返回 `undefined`
- [x] T9 变异检查（11 条）与覆盖率 ≥ 90% — 本提交。覆盖率：语句 98.94%、分支 96.52%、函数 99.01%、行 100%，阈值 90% 已并入 `pnpm test`。变异（12 条，含容差变体）全部有用例失败：
  - M1 去掉停摆接管：6 个失败
  - M2 去掉被抢后让出：2 个
  - M3 去掉 R5 存活记录核对：1 个
  - M4 停摆阈值改 0：7 个
  - M5 去掉时钟回拨保护：1 个
  - M6 去掉租约降级：5 个
  - M7 去掉排队时的代次检查：**第一轮没抓到**，补「bfcache 往返后遗留的锁请求不插队」后 1 个
  - M8 去掉 tick 前的租约核对：**第一轮没抓到**，补「错过 storage 事件的旧 Leader 运行前重读租约」后 1 个
  - M9a 间隔 `>=` 改 `>`：20 个；M9b 带 5 秒容差：1 个
  - M10 去掉回调配对保护：4 个
  - M11 去掉 destroy 移除监听：2 个
  - 未覆盖的分支：`core.ts` 计时器回调里的代次比对（计时器在代次变化时已被清除，属双保险）、`becomeLeader`／`lose` 在非预期状态下的提前返回、`interval.ts` 过期计时器的 term 比对，均为防御性判断，假环境里走不到
- [x] 检查点 C3（gate）：核心库完成，停下交审 — 104 个用例、两层合计 minify + gzip 2.65 KB；Spec 实现中修订两处（§2.3 环境类型、§7 core.ts），已随 C3 批准（2026-11-13）

## 阶段 3：示例页与真实浏览器测试

- [x] T10 示例页（含 UI 自验截图）— 内置浏览器（Chromium）自验：3 个标签页只有 1 个显示绿色「Leader」、其余「Follower」，mode 显示 locks；关掉 Leader 页后另一页立即变为 Leader 并记录 onLeader；`?strategy=lease` 时 mode 显示 lease、只有一个 Leader；interval 区块按 5 s 记录运行。默认端口用 4789（4173 在本机浏览器里被其他应用的缓存页占用）
- [x] T11 Playwright 三引擎（连续 3 次通过）— 18 个用例：13 通过、5 跳过（冻结接管在 Firefox、WebKit 跳过；bfcache 三引擎在自动化下都未从缓存恢复，按 Q3 跳过）；连续 3 次结果一致。冻结模拟改用 `Debugger.pause`，已记入 Spec、Plan 变更记录与 ADR-0005
- [x] 检查点 C4（report）：结果写进兼容性文档 — `docs/compatibility.md` §3.1：Chromium 158、Firefox 159、WebKit 27.2（Playwright 1.65.0），跳过项写明原因；`pnpm test` 104 个、lint、typecheck、build 通过

## 阶段 4：交付

- [x] T12 打包验证（Vite 5 + legacy + TS 5.2、Nuxt 3.11）与体积报告 — `pnpm verify:consumers`：Vite 5.4.21 + plugin-legacy 5.4.1 用 TS 5.2.2 类型检查、构建通过，legacy 产物含接入代码；Nuxt 3.11.2 构建通过，服务端渲染 200，服务端 `mode` 为 `none`、无报错。体积：tgz 14.62 KB；`dist/index.js` 15.39 KB（gzip 4.42 KB）；两层合计 minify + gzip **2.58 KB**（≤ 3 KB）。Nuxt 工程用 `npm install --before=2024-05-01` 安装：全新安装会拉到新版 nitropack 等间接依赖，连不含本库的空 Nuxt 3.11 工程都会 500，已用对照组确认与本库无关
- [ ] T13 文档定稿、迁移说明与治理文件
- [ ] T14 CI 配置文件（只写不推）
- [ ] 检查点 C5（gate）：最终验收（AC1～AC10），交出 tgz，通知开始 V4 联调
