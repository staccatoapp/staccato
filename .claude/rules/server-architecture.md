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

## Authentication

- Session-based auth (`@fastify/session`) for web
- Long-lived API tokens (Bearer header) for mobile clients
- Admin user created on first launch, can invite/create additional accounts
- OIDC will be implemented at a later date.

## Metadata-service client auth

The server passes `Authorization: Bearer <key>` on all calls to the metadata-service façade when `STACCATO_METADATA_API_KEY` is set. Added in `apps/server/src/musicbrainz/client.ts` `throttledFetch`. An empty key disables auth (local dev default). The metadata-service side uses `METADATA_SERVICE_API_KEY` and checks via a Fastify `preHandler` hook on its `/v1` scope.
