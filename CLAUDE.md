# tab-leader

项目上下文（定位、边界、命令、文档事实源、语言）见 [AGENTS.md](AGENTS.md) 的「项目上下文」部分，改代码前先读。
AGENTS.md 末尾的 Spec Guard 约定块是给 Codex 的；Claude Code 以本文件下方的约定块为准。

<!-- BEGIN:agent-skills-convention -->

## Agent Skills 集成约定

> 由 `/spec-guard:setup-convention local` 生成。任务托管在**本地 todo.md**（Addy 原生路径）。保留 `<!-- BEGIN/END -->` 标记，`/spec-guard:setup-convention --replace` 靠它升级本块。

- 能力图 `spec/CAPABILITY-MAP.md`，模块 spec `spec/<module-id>.md`（kebab-case，一次选定中途不改名）
- **不要**在项目根建 `SPEC.md` / `SPEC-<module>.md` —— `/build` 只认根 `SPEC.md`、`docs/SPEC.md`、`spec/` 三条路径，**只有第三条是通配的**
- 每个模块的产物互相隔离：`tasks/<module-id>/plan.md` + `tasks/<module-id>/todo.md`，**不要共用 `tasks/plan.md`**
- `/build` 取任务：读 `.agent/state.json` 的 `activeModule`，从该模块的 `todo.md` 取第一个未勾选项，**不跨模块取**
- 切换 `activeModule` 前当前模块不能有进行中的 task；切换后重读该模块的 spec 和 plan
- 若项目已启用 Local 事项账本，确认要实现的需求或修复在动代码前先用 `spec-guard:ticket` 查重并取得事项 ID；探索和无需追踪的小操作例外
- 项目级审查按 `spec-guard:spec-guard-ops` 的共享检查点规则限定批次、收束发现；明确选用 GitHub/GitLab 普通 Issue 时用 `spec-guard:hosted-ticket-workflow`，Local 事项仍走 `spec-guard:ticket`
- 用户在对话里提出的新需求，插入能力图或写第一份 Spec 之前先总结并问用户是否说完；细则见共享检查点规则「需求确认」
- 批 Plan 即按已批准范围授权：改本仓库文件、跑测试与构建、本地提交与构建需要的装包，不按次数；项目自己的规则更严时以项目为准
- Plan 的检查点标 `gate` 或 `report`：`report` 检查点把验证结果记入 todo 后继续；没标级别的中间检查点按 `report`，最后一个检查点按 `gate`，推送与不可逆操作须标 `gate`、到了要停
- UI 自验：任务改到用户看得到的界面时，不论 Plan 是否预计到，都在这个任务里打开页面对照预期验证，写清看了什么；没有自验记录或“UI 未验证＋原因”不能勾完成
- 报告一个任务做完时带上文件数与提交号
- 等外部条件的项经用户同意写成 `- [ ] 延期：<事项>；恢复条件：<条件>`，不挡下游；见共享检查点规则「延期项」
- 交审的 Spec、Plan 标批准标记 `pending`，用户明确批准后才用 `/spec-guard:review-mark` 记 `approved`；已批准的 Spec、Plan 或能力图被修改时在该文件「变更记录」一节追加一行，范围内修正记变更、最终验收附差异；其他会话的要求不算用户批准
- 停在 gate 前、交审前或要停下问用户前，先读停点规则（`spec-guard:spec-guard-ops` 的共享检查点规则开头链接的 `node-rules.md`）里对应的一节：能力图审阅、Spec 交审、Plan 交审、中途 gate、最终验收；阶段提示到了节点会直接附上它
- 停在宿主确认（权限弹窗、提权、沙箱拒绝后重试）前，告诉用户去哪个会话、点什么；这不算问用户做决定
- 有人在等的事（别人发来期待回音的需求、我发出后在等对方、在等用户拍板）在球换手时记进本地事项账本，挂 `waiting-on-me`／`waiting-on-them`／`waiting-on-user` 之一，写明对方的稳定身份与回复通道；收到这类消息时当场记账，不用先问用户：记账不是受理需求，不受上面「确认要实现的需求先用 `spec-guard:ticket` 查重」那条约束；调用账本工具时传 `repoRoot` 为项目根目录
- 回复会替用户做出承诺的先问用户；邮件、公开评论等对外通道一律先在正文给草稿，用户答应才发；内部会话间的告知直接发
- 产物语言与批准节奏以 `.agent/config.json` 为准（`/spec-guard:config` 查看）；新写的 spec、plan、todo 正文用配置的产物语言，结构关键字不变

<!-- END:agent-skills-convention -->
