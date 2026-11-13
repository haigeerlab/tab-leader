# tab-leader

English | [中文](README.md)

> **Status: 0.1.0 is implemented but not yet published to npm.** Before publishing, it still has to pass integration in its first consumer and manual testing on old browsers; see the [release policy](docs/release.md#验证阶段) (in Chinese).

When a site is open in several tabs of the same browser, **let exactly one tab do a given job**; when that tab is closed, crashes, enters the back/forward cache or is frozen by the browser, **another tab takes over automatically**. Older browsers without Web Locks fall back step by step.

- Zero runtime dependencies, no side effects on import, safe to import during SSR
- Supports Chrome/Edge 80, Firefox 74, Safari 13.1, iOS 12.4; ships ES2017, no polyfills needed
- Takes over when the leader is frozen by the browser (lock not released, no `pagehide`)
- Tells you when this tab loses leadership, so your code can stop immediately

## Use cases

| Scenario | Only one tab does |
|---|---|
| Presence reporting, analytics | Periodic requests |
| Unread counts, notifications | Polling |
| WebSocket / SSE | A single connection (fan-out to other tabs is up to you, see the [recipe](docs/guide/recipes.md#3-只建一条-websocket再分发给其他标签页)) |
| Token refresh | Refreshing the token |
| Background sync, cache warm-up | Running the job |

## Install

```bash
npm install tab-leader
```

## Quick start

### Leader election: `createTabLeader`

```ts
import { createTabLeader } from 'tab-leader'

const leader = createTabLeader({
  name: 'my-app:poller',               // tabs with the same name elect one leader
  onLeader() { startPolling() },       // became leader: start working
  onFollower() { stopPolling() },      // lost leadership: stop now
})
leader.start()

leader.isLeader      // whether this tab is the leader
leader.mode          // 'locks' | 'lease' | 'solo' | 'none'
leader.relinquish()  // step down voluntarily
leader.destroy()     // stop
```

### Periodic task: `createTabInterval`

Runs at most once per `interval` across the whole browser; reloading a page or changing the leader does not break the interval:

```ts
import { createTabInterval } from 'tab-leader'

const task = createTabInterval({
  name: 'my-app:presence',
  interval: 3 * 60 * 1000,
  key: () => currentUserId(),   // run again right away when the identity changes
  run: () => reportPresence(),  // failures are not retried and do not affect the next cycle
})
task.start()
task.check()   // check now (runs only if due or the key changed; never forces a run)
```

See the [API reference](docs/guide/api.md) for every option and the [recipes](docs/guide/recipes.md) for more usage.

## How it works

It picks the strongest mechanism the browser supports, using feature detection only (no UA sniffing):

```
Web Locks (locks) ──unsupported──▶ localStorage lease (lease) ──storage unavailable──▶ every tab runs (solo)
```

- **locks**: the browser guarantees a single holder. The leader periodically writes an alive record; if the leader is frozen and the record goes stale, another tab takes over with `steal`.
- **lease**: a lease with an expiry is written to localStorage and read back to confirm; the leader renews it, and other tabs take over once it expires.
- **solo**: when storage is unavailable too, every tab runs on its own so the work never stalls.

See the [architecture document](docs/architecture/overview.md) for details.

## Guarantees

| Mode | Only one leader at a time | Takeover after freeze |
|---|---|---|
| `locks` | Guaranteed by the browser (a stolen leader has a very short window right after it unfreezes) | Yes (requires localStorage) |
| `lease` | **Best effort**; a very short window with two leaders is possible | After the lease expires |
| `solo` | **Not guaranteed**; every tab is a leader | n/a |

**No mode is suitable for operations that must never run twice** (payments, orders). Make those idempotent on the server.

## Browser support

| Browser | Minimum | Mode |
|---|---|---|
| Chrome / Edge | 80 | `locks` (HTTPS); `lease` on plain HTTP |
| Firefox | 74 | `lease` before 96, `locks` from 96 |
| Safari | 13.1 | `lease` before 15.4, `locks` from 15.4 |
| iOS Safari | 12.4 | `lease` before 15.4, `locks` from 15.4 |

Which versions have been tested and which are inferred is recorded in the [compatibility document](docs/compatibility.md).

## Why not an existing library

We compared 11 candidates on npm; none meets all of "old browsers, takeover after freeze, notification on losing leadership, zero dependencies and no side effects". The two closest:

- [broadcast-channel](https://github.com/pubkey/broadcast-channel): the most mature and covers old browsers, but in browsers with Web Locks it cannot take over from a frozen leader, does not report losing leadership, and has 4 runtime dependencies.
- [tab-election](https://github.com/dabblewriter/tab-election): a complete design for modern browsers, but it requires Web Locks and BroadcastChannel and ships ES2020.

**You may not need this library if:**

- You only target modern browsers and need a single lock → use `navigator.locks.request` directly
- You only target modern browsers and need the leader to talk to other tabs → [tab-election](https://github.com/dabblewriter/tab-election)
- You need messaging between tabs → [broadcast-channel](https://github.com/pubkey/broadcast-channel)

The full comparison, and which ideas we borrowed from which library, are in the [selection research](docs/research/selection.md) and [section 7 of the architecture document](docs/architecture/overview.md#7-设计来源) (both in Chinese).

## Known limitations

- `lease` mode only guarantees a single leader on a best-effort basis.
- A forward jump of the system clock makes an interval look elapsed early; deduplicate on the server by server time if you need strict rate limiting.
- Browsers throttle background timers, so the actual interval of `createTabInterval` can be up to about one minute longer than configured.
- With Web Locks but no usable localStorage, there is no freeze takeover, and `createTabInterval` runs once immediately on every reload.
- 0.x does not provide messaging between tabs.

## Documentation

The documents below are written in Chinese.

| Document | Contents |
|---|---|
| [API reference](docs/guide/api.md) | Every function, option and default |
| [Recipes](docs/guide/recipes.md) | Presence reporting, polling, WebSocket, token refresh |
| [Migration guide](docs/guide/migration.md) | Moving from a home-grown implementation: reusing names and storage formats, old and new code side by side |
| [Architecture](docs/architecture/overview.md) | Layers, fallback chain, state machine, freeze takeover, design sources |
| [Selection research](docs/research/selection.md) | Multi-dimensional comparison with 11 existing options |
| [Compatibility](docs/compatibility.md) | Supported browsers and test evidence |
| [Release policy](docs/release.md) | Versioning, `next` / `latest` tags |
| [Decision records](docs/adr/) | Key decisions and their reasons |

## Contributing

Issues and pull requests are welcome; please read the [contributing guide](CONTRIBUTING.md) first (in Chinese, English is fine in issues and PRs). Report security problems privately as described in the [security policy](SECURITY.md), not in a public issue.

## License

[MIT](LICENSE) © 2026 haigeerlab
