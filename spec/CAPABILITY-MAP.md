# Capability Map: tab-leader

> 状态：待审阅（2026-11-13）

## 目标

做一个开源、零运行时依赖的 npm 库 `tab-leader`：同一浏览器里同名的多个标签页只选一个 Leader 做事，Leader 关闭、崩溃、进入前进／后退缓存或被浏览器冻结后由其他标签页接手；没有 Web Locks 的旧浏览器（下限 Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4）依次降级到 localStorage 租约、各自运行。面向社区，首个接入方是一个业务系统的 PC 站和 H5 站。

<!-- 这一段是 Proposal 审查的目标指纹底本（`spec-digest.py` 计算）。
     改写目标会让已发布的 Proposal 被判为过期，所以改了先人工审阅；追加模块不需要改这里。
     标题必须是 `## 目标`（或 `## Goal`）—— 指纹脚本按标题定位这一节。 -->

## 模块

| Module id | Responsibility | Depends on |
|---|---|---|
| tab-leader | 两层 API：通用选主 `createTabLeader`（Web Locks → 租约 → solo、停摆接管、失去 Leader 通知）和跨标签页限频的定时任务 `createTabInterval`；含工程、构建产物、单测与真实浏览器测试、示例页、文档与打包验证。 | — |

Build order: tab-leader

<!-- Spec Guard 按严格串行推进。为兼容上游格式，逗号分组会按左到右顺序展开为单模块步骤，不代表并行授权。 -->

<!-- 为什么只有一个模块：上层 createTabInterval 只是下层的薄封装，单独拆模块的话两份 Spec 要来回引用同一套状态机和存储 key，
     而且两层要在同一个包、同一个版本里发布，不能分开交付。 -->

---

## 审阅记录

<!-- 第一次审能力图时的自查清单：勾不勾都行，spec-guard 的工具不读也不校验这一节；能力图是否批准以对话里用户的答复为准。 -->

- [ ] 模块边界确认（砍掉或替换一个模块，不需要重写其他模块的需求）
- [ ] 依赖方向单向无环（互相依赖 = 它们本来就是一个模块）
- [ ] module id 已定稿（kebab-case，之后绝不改名 —— 同一个 id 同时是
      `spec/<id>.md`、`tasks/<id>/`、`.agent/state.json` 的 `activeModule` 和 Proposal 中的模块名，
      已发布的 Proposal 改不动）
- [ ] 构建顺序符合依赖拓扑

审阅人：
日期：
