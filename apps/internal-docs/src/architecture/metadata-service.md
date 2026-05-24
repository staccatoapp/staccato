# Metadata Service

> **Stub.** Headings and source pointers only — to be written out in a later pass.
>
> Source of truth: `apps/metadata-service/src/`. See also the façade boundary section in
> [Architecture Overview](/architecture/overview#facade-boundary).

## Role

> A stateless Fastify façade in front of a MusicBrainz `ws/2` mirror. No database of its own;
> every call is forwarded to the mirror, normalised, and returned as a shared DTO. Why it
> exists: single throttle, single normaliser, swap-able upstream, popularity ranking injected
> here.

## Endpoint catalogue (`/v1/*`)

> Document each route in `apps/metadata-service/src/routes/`: recordings (`:mbid` + search),
> releases (`:mbid` + search), release-groups (`:mbid`), artists (`:mbid` + `/image`),
> cover-art (`/cover-art/release-group/:mbid`), and the unified `/search` fan-out. Note what
> `inc=` params each uses and which server call site consumes it.

## Mirror client and throttling

> `mirror/client.ts` `mirrorFetch()` and the `MIRROR_CONCURRENCY` / `MIRROR_INTERVAL_CAP` /
> `MIRROR_INTERVAL_MS` knobs (`config.ts`). Contrast with the server-side `mbQueue` throttle.

## MB → DTO mapping

> `mirror/schemas.ts` (raw MB zod shapes) and `mirror/map.ts` (transforms to the
> `MetadataXxx` DTOs in `packages/shared/src/types/zod/metadata`). Also `mirror/pickRelease.ts`
> `pickBestRelease()` and its `TYPE_RANK`.

## Popularity ranking

> `listenbrainz/popularity.ts` + `search/rank.ts`: how ListenBrainz signals re-rank search
> results, the `POPULARITY_*` config, and the in-memory cache/TTL.
