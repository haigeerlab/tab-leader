# 贡献指南

感谢你愿意参与。Issue 和 PR 用中文或英文都可以（Issues and pull requests in English are welcome）。

## 开始之前

- **报 bug**：用 Issue 模板，写清浏览器和版本、`leader.mode` 的值、复现步骤。能用[示例页](#本地开发)复现最好。
- **提功能**：先开 Issue 讨论，再写代码。本库刻意保持很小，范围外的事情见 [README](README.md#为什么不用现有的库) 和[需求文档](spec/tab-leader.md)的「不做」。
- **安全问题**：不要开公开 Issue，按 [SECURITY.md](SECURITY.md) 私下报告。

## 本地开发

需要 Node 22.18 或更高版本（见 `.nvmrc`），以及 pnpm（版本见 `package.json` 的 `packageManager`）。这只是开发和构建的要求，发布的包不声明 `engines`，不限制接入方的 Node 版本。

```bash
pnpm install
pnpm exec playwright install chromium firefox webkit   # 首次跑浏览器测试前
pnpm demo                                               # 示例页 http://127.0.0.1:4789/demo/
```

提交前请确保下面这些都通过：

```bash
pnpm lint
pnpm typecheck
pnpm test            # 单测，覆盖率不低于 90%
pnpm test:browser    # Chromium、Firefox、WebKit
pnpm build           # 会检查产物是否是 ES2017
```

## 必须遵守的约束

- **零运行时依赖**，`dependencies` 保持为空。
- **import 无副作用**：模块顶层只有函数和常量，只有 `start()` 会碰浏览器 API。
- **产物 ES2017**，支持到 Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4。范围以 `package.json` 的 `browserslist` 为准，ESLint 会检查超出范围的浏览器 API。
- **存储 key 和记录格式是公开契约**（[ADR-0003](docs/adr/0003-name-as-key-and-record-compat.md)），改动算破坏性变更。
- **行为改动先改需求文档**：规则写在 [spec/tab-leader.md](spec/tab-leader.md)，测试按规则编号组织。公开 API 变化时同步更新 [API 参考](docs/guide/api.md)和两版 README。
- **不复制其他库的代码**，借鉴思路要在[架构文档第 7 节](docs/architecture/overview.md#7-设计来源)记下来源。

## 代码和提交风格

- 源码、标识符、注释用英文；`docs/` 用中文；README 中英两版内容保持一致。
- 格式由 Prettier 决定，`pnpm format` 自动整理。
- 提交信息用 `feat:`、`fix:`、`docs:`、`test:` 等前缀，一个提交只做一件事。

## 许可

提交的代码按本仓库的 [MIT 许可证](LICENSE) 发布。
