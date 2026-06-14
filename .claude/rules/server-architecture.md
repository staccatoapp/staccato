---
paths:
  - "apps/server/src/**/*.ts"
---

# Server Architecture

## SPA Serving

In development, Vite runs its dev server and proxies `/api` to the Fastify backend. In production, Fastify serves the built React app as static files via `@fastify/static`, with a catch-all handler that serves `index.html` for non-API routes (client-side routing). API routes are mounted under `/api`.

## Multi-User Model

The app supports multiple users (target: 5–15) sharing a single music library. This is baked into the data model from day one.

- **Shared data** (no user_id): tracks, albums, artists, MusicBrainz mappings, cover art cache, fingerprint data
- **Per-user data** (scoped by user_id): playlists, listening history, ListenBrainz credentials, recommendation cache, playlist suggestions cache, playback state, download requests

## Static Assets

Cover art and artist images are served from `/metadata/` via `@fastify/static` (`$STACCATO_DATA_DIR/metadata/`). This route is registered inside the `protectedApp` scope and requires a valid session — unauthenticated requests get 401. The SPA sends the session cookie with same-origin image requests automatically.

## Testing

All server route tests use fixtures from `apps/server/src/routes/__fixtures__/app.ts`. Always check there before writing any test setup from scratch.

`buildApp(plugin, userId?)` — use for authenticated route tests (albums, playlists, settings, etc.). Stamps `req.userId` unconditionally; all DB calls must be `vi.mock()`'d.

`buildSessionApp(plugin, userId?)` — use when the test involves the session itself (auth routes, or anything that calls `requireAuth`). Injects a fake `request.session` with `vi.fn()` mocks for `get`/`set`/`delete`; `session.get("userId")` returns the passed `userId` (or `undefined` for unauthenticated). Returns `{ app, session }` so tests can assert on `session.set`, etc.

Neither fixture hits a real database — mock all DB and service modules with `vi.mock()` at the top of the test file and `vi.clearAllMocks()` in `beforeEach`.

## Server Config

Server-wide settings (Lidarr credentials, `metadataConfidenceThreshold`, and the Last.fm application `apiKey`/`secret` under the `lastfm` section) live in a YAML file, not the database. The Last.fm app key is server-global rather than per-user because public Last.fm reads need only the application key; future per-user Last.fm session keys (for scrobbling) would live in `user_settings` instead. The singleton `serverConfig` from `apps/server/src/config/server-config.ts` owns this file. Use `serverConfig.get()` for synchronous reads and `await serverConfig.set(partial)` to persist changes — `set()` updates in-memory state and writes atomically to disk. File path defaults to `$STACCATO_DATA_DIR/config.yaml` (falls back to `config.yml` if that file already exists) and can be overridden with `STACCATO_SERVER_CONFIG_PATH`. The service watches the file with chokidar and hot-reloads when it changes externally. In route tests, mock the entire module: `vi.mock("../../config/server-config.js", () => ({ serverConfig: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) } }))`.

## External URL Fetching (SSRF Guard)

Any code that fetches a user-supplied or DB-cached external URL must use the `isPublicHost` helper from `apps/server/src/lib/ssrf.ts`. It DNS-resolves the hostname and rejects loopback, RFC1918, link-local, and cloud-metadata addresses. Always pair it with `redirect: "manual"` so a 3xx cannot redirect to an internal address after the host check. The coverart `cacheCoverFromUrl` and the preview stream route both follow this pattern and serve as reference implementations.

## Authentication

- Session-based auth (`@fastify/secure-session`) for web — cookie `staccato-session`, 7-day maxAge, httpOnly, sameSite strict
- Long-lived opaque API tokens (Bearer header) for mobile clients — `auth_tokens` rows store only the sha-256 hash; `POST /api/auth/token` returns the raw token once plus its `tokenId` (the row id), which mobile reuses as its Staccato Connect device id. `requireAuth` stamps `req.tokenId` on bearer requests; web cookie requests have no `tokenId`.
- Admin user created on first launch, can invite/create additional accounts
- OIDC will be implemented at a later date.

## Real-Time Playback Channel (Staccato Connect)

A WebSocket route `GET /api/playback/ws` inside the `protectedApp` scope is the live, bidirectional playback channel. Authority is split by whether a thing needs a running clock: the single active device owns live position and play-state (it drives its real player and is the only writer of playback state), while the server owns the active-device pointer, the queue, and durable last-known state, and relays commands between devices. The active device sends `state-report` messages (its authoritative position/isPlaying/index, plus a monotonic `seq`); any device sends `command` messages (`setPlaying`/`seek`/`next`/`prev`/`jumpToIndex`, absolute not relative so they are idempotent under reconnect). The server enforces a single-writer rule — it drops any `state-report` whose sender `deviceId` is not the current `activeDeviceId`, and drops a report whose `seq` is not greater than the row's `stateSeq`. A `command` is relayed via `deviceRegistry.sendTo` to the active device (which executes it on real audio and reports the result back); when no device is active the server applies the command to the durable row directly. The handler logic is the exported `handleDeviceConnect` / `handleClientMessage` / `handleDeviceDisconnect` functions; the WS closure is thin glue around them. There is no REST `PUT /session/state` — state writes are WS-only (a device can only report while it holds the socket that makes it active). The other mutating REST routes (`PUT /session/play`, `POST|PUT /session/queue`) still broadcast their result.

Device presence is held in memory by the `deviceRegistry` singleton (`apps/server/src/playback/device-registry.ts`) keyed off the socket lifecycle — a device is online only while its socket is open, and nothing is persisted (`sendTo` targets one device, `broadcast` fans out to all of a user's). Every registration is stamped with a monotonic `connId`; `unregister` only evicts when the stored connection's `connId` matches the one that closed, so a fast reconnect (same device id) that has already replaced the socket isn't torn down by the stale socket's late close. Each user's `playback_session` row carries an `activeDeviceId` pointer, plus `playbackUpdatedAtMs` (server receipt time of the last accepted report) and `stateSeq` (the monotonic guard, reset to 0 whenever `activeDeviceId` changes). On connect the pointer is auto-claimed when null or pointing at an offline device; a *different* device claiming an unowned/offline session resumes paused (no live clock to inherit), but the original owner reconnecting after a brief drop reclaims its session and keeps its play state (the server remembers the last-active device id across the release, so a momentary network blip doesn't force-pause its local audio). On disconnect the pointer is released to null so the next connector claims it. Device handoff is orchestrated, not immediate: `PUT /api/playback/devices/active` against a still-online active device records a pending handoff, sends the outgoing device a `yield` (pause, flush one final exact-position report, go passive) and the incoming device an `assume-active` (pre-warm: load + seek the track, then resume on the next authoritative session-updated); the pointer flips when that flush arrives (or when the outgoing device disconnects), keeping the single-writer rule intact. Every `session-updated` broadcast carries `serverTimeMs` so passive devices dead-reckon position free of clock skew.

Mobile connections are identified by `req.tokenId`; web connections (cookie auth, no token) send a client-generated `deviceId` on the handshake query string because browser sockets cannot set headers. Because WebSocket handshakes bypass the same-origin policy yet still carry the session cookie, cookie-authenticated upgrades are guarded against Cross-Site WebSocket Hijacking: the handler rejects (close 1008) any web connection whose `Origin` host does not match the resolved request host (`req.host` — derived from `X-Forwarded-Host` because `trustProxy` is enabled app-wide, so it equals the external URL the browser used even behind a reverse proxy that rewrites `Host`; and it keeps the port, unlike `req.hostname`), missing, or unparseable. Bearer (mobile) connections are exempt since a foreign page cannot forge the Authorization header. On connect the server sends that connection a `connected` message carrying its own device id, then session and devices snapshots. The shared message envelopes are `ServerMessageSchema` and `ClientMessageSchema` in `packages/shared` (`packages/shared/src/playback/protocol.ts`); the device-list and active-device switch also have REST endpoints at `GET /api/playback/devices` and `PUT /api/playback/devices/active`. Both web and mobile clients drive their player through one shared `PlaybackController` (`packages/shared/src/playback/controller.ts`) parameterised over a thin per-app `PlayerAdapter`, so the active/passive state machine lives once.
