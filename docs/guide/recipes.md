# 场景示例

> 状态：**草案**。示例代码在 0.1.0 实现后逐个实跑验证再定稿。

## 1. 定时上报（在线状态、埋点）

```ts
const task = createTabInterval({
  name: 'my-app:presence',
  interval: 3 * 60 * 1000,
  key: () => auth.userId ?? 'guest',
  run: () => api.reportPresence(),
})
task.start()
auth.onChange(() => task.check())
```

- 刷新、开新标签页都不会提前上报；换了登录身份会立即补一次。
- 后台计时器会被节流，实际间隔在 3～4 分钟之间。需要严格限频时，后端按服务端时间去重。

## 2. 只让一个标签页轮询

```ts
let timer: ReturnType<typeof setInterval> | undefined
const leader = createTabLeader({
  name: 'my-app:unread',
  onLeader() { timer = setInterval(fetchUnread, 30_000) },
  onFollower() { clearInterval(timer) },
})
leader.start()
```

## 3. 只建一条 WebSocket，再分发给其他标签页

本库 0.x **不做消息分发**。Leader 在 `onLeader` 里建立连接，自己把收到的数据广播出去：

```ts
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('my-app:feed') : null

function broadcast(data: unknown) {
  if (channel) channel.postMessage(data)
  else localStorage.setItem('my-app:feed:msg', JSON.stringify({ data, at: Date.now() }))
}

let ws: WebSocket | undefined
createTabLeader({
  name: 'my-app:feed',
  onLeader() {
    ws = new WebSocket(url)
    ws.onmessage = (e) => { render(e.data); broadcast(e.data) }
  },
  onFollower() { ws?.close() },
}).start()

// 所有标签页（包括追随者）接收：
channel?.addEventListener('message', (e) => render(e.data))
window.addEventListener('storage', (e) => {
  if (e.key === 'my-app:feed:msg' && e.newValue) render(JSON.parse(e.newValue).data)
})
```

- `BroadcastChannel` 在 Safari 15.4 以前没有，旧浏览器退回 localStorage 的 `storage` 事件（只会通知其他标签页，不通知自己）。
- 需要完整的跨标签页消息能力，可以考虑 [broadcast-channel](https://github.com/pubkey/broadcast-channel)。

## 4. 令牌刷新只让一个标签页去做

```ts
createTabLeader({
  name: 'my-app:token-refresh',
  onLeader() { scheduleRefresh() },
  onFollower() { cancelRefresh() },
}).start()
```

刷新结果通过 localStorage 共享给其他标签页。注意：租约档可能有极短的双 Leader 窗口，刷新接口要能容忍偶尔被调用两次。

## 5. 测试旧浏览器路径

在新浏览器里用 `strategy: 'lease'` 强制走租约档，用 `strategy: 'solo'` 强制各自运行，可以在不装旧浏览器的情况下验证业务在这些档位下的表现。
