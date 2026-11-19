# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。0.x 期间次版本号可能包含破坏性变更，会在对应版本下单独标出，见[发布策略](docs/release.md)。

## [0.2.0] - 待发布

试用版，发布到 npm `next` 标签，不移动 `latest`。没有破坏性变更：不传新参数时行为与 0.1.0 完全一致。

### 新增

- `createTabInterval` 新增可选参数 `canRun: () => boolean`：每次检查时、读上次运行记录之前调用，只有返回 `false` 才跳过；跳过时本轮不读写运行记录、不调用 `key` 和 `run`，固定 1 秒后再检查，条件恢复后按原规则补上。适合「本页身份与共享身份不一致时先不运行」这类场景。`canRun` 抛错按 `true` 处理，与 `key` 抛错时不运行相反。

## [0.1.0] - 2026-11-14

首个试用版，发布到 npm `next` 标签。

### 新增

- `createTabLeader`：同名标签页之间选一个 Leader；Web Locks → localStorage 租约 → 各自运行（solo）逐层降级；Leader 关闭、崩溃、进入 bfcache 或被冻结后由其他标签页接手；`onLeader`／`onFollower` 严格交替。
- `createTabInterval`：只在 Leader 上运行、跨标签页和刷新都保持严格间隔的定时任务；`key` 变化立即补一次，`check()` 立即检查。
- ESM、CommonJS 和类型声明，产物为 ES2017，零运行时依赖，import 无副作用。
