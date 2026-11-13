# 版本与发布策略

## 版本号

- 遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
- **API 稳定之前保持 0.x**。0.x 期间，次版本号（0.**y**.0）可以包含破坏性变更，会在 CHANGELOG 里单独标出；修订号（0.y.**z**）只修 bug。
- 以下都算破坏性变更：公开 API 签名或行为变化、存储 key 或记录格式变化（[ADR-0003](adr/0003-name-as-key-and-record-compat.md)）、浏览器下限提高、产物语法超过 ES2017。
- 外部用户反馈让 API 稳定下来以后，再发 `1.0.0`。

## npm 标签

| 标签 | 含义 | 条件 |
|---|---|---|
| `next` | 试用版，不对外推荐 | 单测、真实浏览器测试（CI）、打包验证全部通过 |
| `latest` | 可用于生产 | `next` 版本的旧浏览器手动实测通过，**并且**首个接入方线上稳定运行两周 |

0.1.0 的节奏：

1. 发 `0.1.0` 到 `next`，只给首个接入方试用，不对外宣传。
2. 旧版本（Chrome 80、Firefox 74、Safari 13.1、iOS 12.4）手动实测通过，结果写进[兼容性文档](compatibility.md)；首个接入方线上稳定两周。然后把 `latest` 指向这个版本，README 写明「可用于生产」。
3. 保持 0.x，直到 API 稳定。

## 发布流程

由仓库所有者本人在**交互终端**里执行（npm 账号开了 2FA，非交互 shell 会报 `ERR_PNPM_OTP_NON_INTERACTIVE`）：

1. 从干净的克隆、`main` 分支最新提交开始，`git status` 为空。
2. `npm whoami` 确认账号；`npm view tab-leader versions` 确认目标版本不存在。
3. `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm test:browser`、`pnpm build`、`pnpm check:terms --history`。
4. 更新 CHANGELOG、版本号，提交并打 tag `v<版本>`。
5. `pnpm publish --access public --tag next`。
6. 到 registry 读回：`npm view tab-leader@<版本>`，确认 `dist-tags`、文件列表、`dependencies` 为空。
7. 满足 `latest` 条件后：`npm dist-tag add tab-leader@<版本> latest`，再读回确认。

推送、发布、打 `latest` 每一步都需要所有者明确同意。
