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

For pure validation tests (routes that return 400 before touching the DB), mock all DB query modules with `vi.mock()` and `vi.clearAllMocks()` in `beforeEach`.

For integration-style tests that exercise real query logic against an in-memory SQLite DB, use `vi.mock("../db/client.js", () => ({ get db() { return testDb; } }))` with `createTestDb()` from `src/db/__fixtures__/db.js`, and mock only non-DB side effects (e.g. `../scrobbling/dispatch.js`, `../coverart/store.js`). See `playlists.test.ts` and `playback.test.ts` for examples.

## Authentication

- Session-based auth (`@fastify/secure-session`) for web — cookie `staccato-session`, 7-day maxAge, httpOnly, sameSite strict
- Long-lived API tokens (Bearer header) for mobile clients (planned)
- Admin user created on first launch, can invite/create additional accounts
- OIDC will be implemented at a later date.
