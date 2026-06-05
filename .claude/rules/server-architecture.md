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
- **Per-user data** (scoped by user_id): playlists, listening history, ListenBrainz credentials, recommendation cache, playback state, download requests

## Static Assets

Cover art and artist images are served from `/metadata/` via `@fastify/static` (`$STACCATO_DATA_DIR/metadata/`). This route is registered inside the `protectedApp` scope and requires a valid session — unauthenticated requests get 401. The SPA sends the session cookie with same-origin image requests automatically.

## Testing

All server route tests use fixtures from `apps/server/src/routes/__fixtures__/app.ts`. Always check there before writing any test setup from scratch.

`buildApp(plugin, userId?)` — use for authenticated route tests (albums, playlists, settings, etc.). Stamps `req.userId` unconditionally; all DB calls must be `vi.mock()`'d.

`buildSessionApp(plugin, userId?)` — use when the test involves the session itself (auth routes, or anything that calls `requireAuth`). Injects a fake `request.session` with `vi.fn()` mocks for `get`/`set`/`delete`; `session.get("userId")` returns the passed `userId` (or `undefined` for unauthenticated). Returns `{ app, session }` so tests can assert on `session.set`, etc.

Neither fixture hits a real database — mock all DB and service modules with `vi.mock()` at the top of the test file and `vi.clearAllMocks()` in `beforeEach`.

## Server Config

Server-wide settings (Lidarr credentials, `metadataConfidenceThreshold`) live in a YAML file, not the database. The singleton `serverConfig` from `apps/server/src/config/server-config.ts` owns this file. Use `serverConfig.get()` for synchronous reads and `await serverConfig.set(partial)` to persist changes — `set()` updates in-memory state and writes atomically to disk. File path defaults to `$STACCATO_DATA_DIR/config.yaml` (falls back to `config.yml` if that file already exists) and can be overridden with `STACCATO_SERVER_CONFIG_PATH`. The service watches the file with chokidar and hot-reloads when it changes externally. In route tests, mock the entire module: `vi.mock("../../config/server-config.js", () => ({ serverConfig: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) } }))`.

## External URL Fetching (SSRF Guard)

Any code that fetches a user-supplied or DB-cached external URL must use the `isPublicHost` helper from `apps/server/src/lib/ssrf.ts`. It DNS-resolves the hostname and rejects loopback, RFC1918, link-local, and cloud-metadata addresses. Always pair it with `redirect: "manual"` so a 3xx cannot redirect to an internal address after the host check. The coverart `cacheCoverFromUrl` and the preview stream route both follow this pattern and serve as reference implementations.

## Authentication

- Session-based auth (`@fastify/secure-session`) for web — cookie `staccato-session`, 7-day maxAge, httpOnly, sameSite strict
- Long-lived API tokens (Bearer header) for mobile clients (planned)
- Admin user created on first launch, can invite/create additional accounts
- OIDC will be implemented at a later date.
