# ADR-0002：降级链 Web Locks → localStorage 租约 → solo

- 状态：已提议（随需求文档一起审批）
- 日期：2026-11-13

## 背景

浏览器下限是 Chrome／Edge 80、Firefox 74、Safari 13.1、iOS 12.4。其中只有 Chrome／Edge 80 有 Web Locks（且仅限 HTTPS）；其余浏览器要到较新版本才支持（见[兼容性文档](../compatibility.md)）。

## 决定

按 `locks` → `lease` → `solo` 的顺序只做功能检测、逐档降级（需求文档 R1、R2）；租约档运行中存储失效时降级为 solo（R11）。`strategy` 只能指定起始档，不能禁止降级。

## 备选方案

- **只支持 Web Locks**：最简单，但覆盖不了目标浏览器。
- **BroadcastChannel 选举作为中间档**：Safari 15.4 以前没有；多轮消息加超时判断，在后台节流时更容易误判。
- **IndexedDB 事务当锁**：各引擎跨标签页行为不一，复杂度高。
- **给 `navigator.locks` 打 polyfill**：改写全局对象，违背「无全局副作用」。

## 影响

- 租约档只能尽力保证，必须在对外文档里写明（需求文档 §3.7）。
- solo 档不保证唯一，是最后的兜底。
- 新浏览器支持 Web Locks 后自动升档，不需要改代码。
