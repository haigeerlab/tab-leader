# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。0.x 期间次版本号可能包含破坏性变更，会在对应版本下单独标出，见[发布策略](docs/release.md)。

## [0.3.0] - 2026-11-25

试用版，发布到 npm `next` 标签，不移动 `latest`。没有破坏性变更：不调用新方法、不改时长参数时行为与 0.2.0 完全一致。这次改了选主逻辑，发布前要走完 V1～V5（见[发布策略](docs/release.md)）。

### 新增

- `createTabLeader` 返回的对象新增 `requestLeadership()`：本标签页不是 Leader 时主动抢主，Web Locks 档抢锁、租约档覆盖租约，原 Leader 让出并收到 `onFollower`。结果是异步的；已是 Leader、solo 档、`start()` 之前、bfcache 暂停期间、`destroy()` 之后调用无效。推荐在 `visibilitychange` 变为 `visible` 时调用，不要在 `focus` 里无条件调用。原 Leader 正被系统暂停时，恢复后、让出前可能与新 Leader 短暂同时存在。`createTabInterval` 没有这个方法。
- API 参考新增「快速接管」一节：经旧版本浏览器实测的推荐时长参数（`leaseTtl` 6000、`leaseRenewInterval` 2000、`aliveInterval` 2000、`stallTimeout` 6000）、参数下限和尚未验证的风险。默认值不变。
- 示例页新增 `requestLeadership()` 按钮；兼容性文档的手动实测清单新增抢主一步。

### 修正

- 示例页在 `onFollower` 里刷新显示时仍读到 `isLeader` 为 `true`，原 Leader 页面会一直显示「Leader」；改为让出完成后再刷新显示。只改示例页，库的行为不变。

## [0.2.0] - 2026-11-19

试用版，发布到 npm `next` 标签，不移动 `latest`。没有破坏性变更：不传新参数时行为与 0.1.0 完全一致。

### 新增

- `createTabInterval` 新增可选参数 `canRun: () => boolean`：每次检查时、读上次运行记录之前调用，只有返回 `false` 才跳过；跳过时本轮不读写运行记录、不调用 `key` 和 `run`，固定 1 秒后再检查，条件恢复后按原规则补上。适合「本页身份与共享身份不一致时先不运行」这类场景。`canRun` 抛错按 `true` 处理，与 `key` 抛错时不运行相反。

## [0.1.0] - 2026-11-14

首个试用版，发布到 npm `next` 标签。

### 新增

- `createTabLeader`：同名标签页之间选一个 Leader；Web Locks → localStorage 租约 → 各自运行（solo）逐层降级；Leader 关闭、崩溃、进入 bfcache 或被冻结后由其他标签页接手；`onLeader`／`onFollower` 严格交替。
- `createTabInterval`：只在 Leader 上运行、跨标签页和刷新都保持严格间隔的定时任务；`key` 变化立即补一次，`check()` 立即检查。
- ESM、CommonJS 和类型声明，产物为 ES2017，零运行时依赖，import 无副作用。
