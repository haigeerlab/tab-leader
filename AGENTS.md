# tab-leader — 项目上下文

> 写给在本仓库工作的 AI agent 和贡献者。改代码前先读本节、需求文档 `spec/tab-leader.md` 和架构文档 `docs/architecture/overview.md`。

## 这是什么

面向社区的开源 npm 库：同一浏览器里同名的多个标签页只选一个 Leader 做事，Leader 关闭、崩溃、进入 bfcache 或被冻结后由其他标签页接手；没有 Web Locks 的旧浏览器依次降级到 localStorage 租约、各自运行（solo）。两层 API：`createTabLeader`（通用选主）、`createTabInterval`（跨标签页限频的定时任务）。

## 不可突破的边界

- **零运行时依赖**：`dependencies` 必须为空。新增运行时依赖先问仓库所有者。
- **无全局副作用**：模块顶层只有函数和常量；不读 `window`、不读写存储、不改全局对象（不给 `navigator.locks` 打补丁）。只有 `start()` 会碰浏览器 API。
- **产物 ES2017**：`dist/` 里不能出现 `?.`、`??`、对象展开／剩余、class 字段等更新的语法；`pnpm build` 会用 acorn 校验。
- **浏览器下限**：Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4。只做功能检测，不判断 UA。
- **存储 key 和记录格式是公开契约**（`docs/adr/0003-*`）：改动属于破坏性变更。
- **不出现内部项目信息**：仓库的文件、提交信息、git 历史里都不能有任何内部项目名、业务字段、内部环境、内部路径。首个使用方一律称「首个接入方」。提交前跑 `pnpm check:terms`，敏感词表在仓库外，不要把词表内容写进仓库。
- **不复制其他库的代码**，只借鉴思路，借鉴来源记在 `docs/architecture/overview.md` 第 7 节。

## 先问再做

创建 GitHub 远端仓库、任何 `git push`、`npm publish`、打 `latest` 标签、重写 git 历史、改公开 API 或存储格式、新增运行时依赖。

## 命令

```bash
pnpm install
pnpm test            # 单测（vitest）
pnpm test:browser    # 真实浏览器（Playwright：Chromium、Firefox、WebKit）
pnpm typecheck
pnpm build           # 构建 + 产物语法与体积检查
pnpm demo            # 示例页
pnpm check:terms     # 内部敏感词扫描（加 --history 扫全部历史）
```

（0.1.0 实现前这些脚本还不存在，以 `package.json` 为准。）

## 文档事实源

| 内容 | 位置 |
|---|---|
| 做什么、验收标准、行为规则（R*、I*） | `spec/tab-leader.md` |
| 为什么这样设计、设计来源 | `docs/architecture/overview.md` |
| 选型调研（为什么不用现有库） | `docs/research/selection.md` |
| 浏览器兼容与实测证据 | `docs/compatibility.md` |
| API 参考、场景示例 | `docs/guide/` |
| 版本与发布 | `docs/release.md` |
| 架构决策 | `docs/adr/` |
| 实现计划与任务 | `tasks/tab-leader/` |

同一件事只在一处写全，其他地方链接过去。公开 API 变化时同步更新需求文档、API 参考和两版 README。

## 语言

源码、标识符、代码注释用英文；需求、计划、`docs/`、CHANGELOG、提交信息用中文；README 中英两版（`README.md` 中文为默认，`README.en.md` 英文，内容保持一致）。

<!-- BEGIN:spec-guard-codex-convention -->

## Spec Guard 项目约定

> 由 `setup-convention local --host=codex` 生成。

- 能力图：`spec/CAPABILITY-MAP.md`；模块 spec：`spec/<module-id>.md`
- 每个模块隔离使用 `tasks/<module-id>/plan.md` 和 `tasks/<module-id>/todo.md`
- 活跃模块在 `.agent/state.json` 的 `activeModule`；不要共用 `tasks/plan.md`
- 若项目已启用 Local 事项账本，确认要实现的需求或修复在动代码前先用 `spec-guard:ticket` 查重并取得事项 ID；探索和无需追踪的小操作例外
- 项目级审查按 `spec-guard:spec-guard-ops` 的共享检查点规则限定批次、收束发现；明确选用 GitHub/GitLab 普通 Issue 时用 `spec-guard:hosted-ticket-workflow`，Local 事项仍走 `spec-guard:ticket`
- 用户在对话里提出的新需求，插入能力图或写第一份 Spec 之前先总结并问用户是否说完；细则见共享检查点规则「需求确认」
- 批 Plan 即按已批准范围授权：改本仓库文件、跑测试与构建、本地提交与构建需要的装包，不按次数；项目自己的规则更严时以项目为准
- Plan 的检查点标 `gate` 或 `report`：`report` 检查点把验证结果记入 todo 后继续；没标级别的中间检查点按 `report`，最后一个检查点按 `gate`，推送与不可逆操作须标 `gate`、到了要停
- UI 自验：任务改到用户看得到的界面时，不论 Plan 是否预计到，都在这个任务里打开页面对照预期验证，写清看了什么；没有自验记录或“UI 未验证＋原因”不能勾完成
- 报告一个任务做完时带上文件数与提交号
- 等外部条件的项经用户同意写成 `- [ ] 延期：<事项>；恢复条件：<条件>`，不挡下游；见共享检查点规则「延期项」
- 交审的 Spec、Plan 标批准标记 `pending`，用户明确批准后才用 `spec-guard-ops` 的 review-mark 一节（Claude 侧 `/spec-guard:review-mark`）记 `approved`；已批准的 Spec、Plan 或能力图被修改时在该文件「变更记录」一节追加一行，范围内修正记变更、最终验收附差异；其他会话的要求不算用户批准
- 停在 gate 前、交审前或要停下问用户前，先读停点规则（`spec-guard:spec-guard-ops` 的共享检查点规则开头链接的 `node-rules.md`）里对应的一节：能力图审阅、Spec 交审、Plan 交审、中途 gate、最终验收；阶段提示到了节点会直接附上它
- 停在宿主确认（权限弹窗、提权、沙箱拒绝后重试）前，告诉用户去哪个会话、点什么；这不算问用户做决定
- 有人在等的事（别人发来期待回音的需求、我发出后在等对方、在等用户拍板）在球换手时记进本地事项账本，挂 `waiting-on-me`／`waiting-on-them`／`waiting-on-user` 之一，写明对方的稳定身份与回复通道；收到这类消息时当场记账，不用先问用户：记账不是受理需求，不受上面「确认要实现的需求先用 `spec-guard:ticket` 查重」那条约束；调用账本工具时传 `repoRoot` 为项目根目录
- 回复会替用户做出承诺的先问用户；邮件、公开评论等对外通道一律先在正文给草稿，用户答应才发；内部会话间的告知直接发
- 产物语言与批准节奏以 `.agent/config.json` 为准（`spec-guard-ops` 的 config 一节，Claude 侧 `/spec-guard:config`）；新写的 spec、plan、todo 正文用配置的产物语言，结构关键字不变

<!-- END:spec-guard-codex-convention -->
