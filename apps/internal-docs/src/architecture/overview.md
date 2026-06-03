# Architecture Overview

Staccato is a self-hosted music player and discovery app for home labs. It plays a local
music library, manages playlists, serves tailored recommendations, previews tracks via
30-second clips, and requests new downloads through Lidarr. It does **not** download music
itself.

This page maps the moving parts so the rest of the docs have somewhere to anchor.

## Tech stack at a glance

- **Monorepo:** Turborepo + pnpm workspaces. Deployable apps in `apps/`, shared libraries in
  `packages/`.
- **Language:** TypeScript everywhere.
- **Backend:** Node.js + Fastify.
- **Database:** SQLite (WAL mode) via Drizzle ORM on the `better-sqlite3` driver.
- **Web:** React SPA built with Vite, shadcn/ui + Tailwind, data fetching via TanStack Query,
  routing via TanStack Router.
- **Deployment:** Docker (a single container running the server, which serves the built web app).

## The workspaces

| Workspace                    | Package                       | Purpose                                                                                                                              | Entry point                               |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `apps/server`                | `@staccato/server`            | Primary Fastify backend: REST API, the music import/resolution pipeline, the SQLite DB, and (in prod) serving the web SPA.           | `apps/server/src/index.ts`                |
| `apps/web`                   | `@staccato/web`               | The React SPA — the user-facing player and library browser.                                                                          | `apps/web/src/main.tsx`                   |
| `apps/mobile`                | `@staccato/mobile`            | Expo (React Native) mobile client, built with Expo Router. Scaffold only — default template, no app functionality yet.               | `apps/mobile/src/app/_layout.tsx`         |
| `apps/metadata-service`      | `@staccato/metadata-service`  | A Fastify façade in front of a MusicBrainz mirror. Normalises MB wire shapes to shared DTOs, throttles, and adds popularity ranking. | `apps/metadata-service/src/index.ts`      |
| `apps/docs`                  | `@staccato/docs`              | **Public** VitePress site (user docs). Deployed separately; not in the Docker image.                                                 | `apps/docs/.vitepress/config.ts`          |
| `apps/internal-docs`         | `@staccato/internal-docs`     | **This** site. Local-only developer docs. Never deployed.                                                                            | `apps/internal-docs/.vitepress/config.ts` |
| `packages/shared`            | `@staccato/shared`            | Cross-app types: zod schemas for API and metadata-service DTOs, plus pure TS domain types.                                           | `packages/shared/src/index.ts`            |
| `packages/eslint-config`     | `@staccato/eslint-config`     | Shared ESLint flat-config presets (`./base`, `./react-internal`).                                                                    | —                                         |
| `packages/typescript-config` | `@staccato/typescript-config` | Shared `tsconfig` bases.                                                                                                             | —                                         |

::: tip Type boundaries
Anything crossing an app boundary (e.g. `server` → `web`, or `server` → `metadata-service`)
is a zod schema in `packages/shared/src/types/zod`. Server-internal row types (`*Row`,
`New*Row`) stay inside `apps/server` and never leak into `@staccato/shared`.
:::

::: tip Mobile tooling divergence
`apps/mobile` deliberately does **not** extend `@staccato/typescript-config` or
`@staccato/eslint-config`. Those presets target Node/web (`module: NodeNext`, DOM libs) and
break Metro. The mobile app keeps Expo's own `expo/tsconfig.base` and `eslint-config-expo`
instead. It still consumes `@staccato/shared` via `workspace:*` like every other app — Metro
bundles the shared package's compiled `dist/` through its standard package-exports resolution.
Its `check-types` runs `expo customize tsconfig.json` first to regenerate the (git-ignored)
`expo-env.d.ts` so `tsc` resolves Expo's CSS-module and typed-route declarations in CI.
:::

## Request and data flow

### Development

`apps/web` runs the Vite dev server. Its `vite.config.ts` proxies API traffic to the backend
so the browser only ever sees same-origin relative URLs:

```text
/api      -> http://localhost:8280
/metadata -> http://localhost:8280
```

The web app's auth guard (`apps/web/src/routes/__root.tsx`) calls `/api/auth/me` on route
load; everything else is TanStack Query wrapping `fetch`.

### Production

There is no separate web server. `apps/server` serves the built SPA itself: when
`STACCATO_ENV !== "development"` it registers `@fastify/static` over `apps/web/dist` and adds a
catch-all not-found handler that returns `index.html` for non-`/api` routes (client-side
routing). See `apps/server/src/index.ts`.

### API surface

Routes are mounted in `apps/server/src/index.ts`. `/api/health` and `/api/auth/*` are
unauthenticated; everything else is registered inside a scope with a `requireAuth` preHandler
(`apps/server/src/plugins/session.ts`):

```text
/api/library      scan + library status      /api/search       search
/api/albums       albums                      /api/preview      30s preview clips
/api/artists      artists                     /api/recommendations  recs
/api/playback     playback/session state      /api/downloads    Lidarr requests
/api/playlists    playlists                   /api/settings     server + user settings
/api  (tracks)    track endpoints
```

Cached metadata assets (cover art, artist images) are served as static files from
`${STACCATO_DATA_DIR}/metadata/` at `/metadata/*`.

## The façade boundary {#facade-boundary}

`server` resolves all MusicBrainz, Cover Art Archive, and artist-image data **through**
`metadata-service` rather than calling MB itself. The HTTP client lives in
`apps/server/src/musicbrainz/client.ts`; its base URL is `STACCATO_METADATA_URL`
(default `http://localhost:8290/v1`, the constant `FACADE_BASE`).

Why the indirection:

- **One throttle, one normaliser.** The service maps raw MB `ws/2` JSON into the stable DTOs
  in `packages/shared/src/types/zod/metadata` (e.g. `MetadataRecording`, `MetadataReleaseDetail`,
  `MetadataArtistDetail`). The server codes against those DTOs, not MB's wire format.
- **Swap-able upstream.** Pointing at a self-hosted MB mirror vs. the public API is a config
  change in one place (`MB_MIRROR_URL` in the service).
- **Popularity ranking** (via ListenBrainz) is injected into search results in the service,
  not the server.

Calls from `server` go through a shared `p-queue` (`mbQueue`) with priority lanes
(`MB_PRIORITY`: `INTERACTIVE` > `PAGE_LOAD` > `BACKGROUND`) and configurable throttling
(`MB_CONCURRENCY`, `MB_INTERVAL_CAP`, `MB_RATE_LIMIT_MS`). See
[Metadata Service](/architecture/metadata-service) for the endpoint catalogue.

A handful of external calls are made by `server` **directly** (not via the façade), each in its
own client module: AcoustID (`library/evidence/acoustid.ts`), ListenBrainz
(`listenbrainz/client.ts`), lrclib lyrics (`lyrics/client.ts`), Lidarr (`lidarr/client.ts`),
and Deezer/iTunes previews (`preview/`).

## Dev workflow

From the repo root:

```bash
pnpm dev          # turbo run dev — starts all apps in parallel (persistent)
pnpm build        # turbo run build — builds in dependency order (packages first)
pnpm lint         # turbo run lint
pnpm check-types  # turbo run check-types
pnpm studio       # drizzle-kit studio — browse the DB
```

Ports and inspectors during `turbo dev`:

| App                    | Port              | Node inspector |
| ---------------------- | ----------------- | -------------- |
| `server`               | `8280`            | `9329`         |
| `metadata-service`     | `8290`            | `9330`         |
| `web` (Vite)           | Vite default      | —              |
| `mobile` (Expo/Metro)  | `8081`            | —              |
| `docs` (public)        | VitePress default | —              |
| `internal-docs` (this) | `5174`            | —              |

::: warning Build order
`@staccato/shared` must be built before `server` and `web` consume it. Turborepo handles this
for `build` via `"dependsOn": ["^build"]`; in dev, `packages/shared` runs `tsc --watch`.
:::

## Where to go next

- The hardest subsystem: **[Import & Resolution pipeline](/pipelines/import-resolution)**.
- The shape of the data: **[Data Model](/architecture/data-model)**.
- The MB façade in detail: **[Metadata Service](/architecture/metadata-service)**.
