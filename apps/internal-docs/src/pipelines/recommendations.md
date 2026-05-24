# Recommendations

> **Stub.** Headings and source pointers only — to be written out in a later pass.
>
> Source of truth: `apps/server/src/recommendations/` and the `recommendation_cache` table
> (`apps/server/src/db/schema/recommendation-cache.ts`).

## Sources

> The pluggable source registry (`source.ts`, `sources/index.ts`) and the concrete sources in
> `sources/` — ListenBrainz collaborative-filtering tracks and ListenBrainz playlists. Document
> the source `kind`s and how new sources register.

## Cache warming and the refresher

> `refresher.ts` (`startRefresher()`, `tick()`) and the per-user/per-source cache lifecycle
> (`warming` → `ready` → `error`). How boot backfill seeds warming rows for users with a
> ListenBrainz token (`apps/server/src/index.ts`), and `resetInflightOnBoot()`.

## In-library matching

> `in-library.ts` — how recommended recordings are matched back to local tracks (by MBID) so
> the UI can distinguish "play now" from "request download".

## Serving

> The `/api/recommendations` route and how the web app consumes it (`useRecommendations`).
