# ADR-0001：自己做选主库，而不是复用现有库

- 状态：已提议（随需求文档一起审批）
- 日期：2026-11-13

## 背景

需要一个多标签页选主方案，同时满足四个硬要求：支持没有 Web Locks 的旧浏览器（Safari 13.1、Firefox 74、iOS 12.4）、Leader 被冻结时能接管、失去 Leader 时通知、零运行时依赖且无全局副作用。

## 决定

自己做 `tab-leader`。只借鉴现有库的思路，不复制代码。

## 依据

[选型调研](../research/selection.md)对比了 npm 上的 11 个候选，没有一个同时满足四条：

- broadcast-channel 能覆盖旧浏览器，但在 Web Locks 模式下接管不了冻结的 Leader，也不通知失去；而且有 4 个运行时依赖。
- tab-election 在新浏览器里设计完整（Hub 层有心跳加 steal 的接管），但产物是 ES2020，并且离不开 Web Locks 和 BroadcastChannel。
- 两个 Web Locks polyfill 都会在 import 时改写全局对象。
- 其他候选要么停止维护，要么依赖 BroadcastChannel（Safari 15.4+），要么不是独立库。

## 备选方案

- **给 broadcast-channel 打补丁**：对它内部的锁名 `steal`，绕过公开 API，脆弱，并且依赖问题仍在。
- **tab-election + Web Locks polyfill**：polyfill 改写全局对象；tab-election 还需要 BroadcastChannel 和 ES2020。
- **只用原生 Web Locks，旧浏览器不管**：覆盖不了目标浏览器。

## 影响

- 要自己维护，并且对外声称的能力要有证据（真实浏览器测试、旧版本实测记录）。
- 文档要公正地写明什么场景应该用别的库（选型调研第 4 节）。
