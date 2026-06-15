---
paths:
  - "apps/server/src/preview/**/*.ts"
  - "apps/server/src/routes/preview.ts"
---

# Preview Clips

30-second preview clips for non-library tracks (recommendations, search results) come from third-party
catalogues, fronted by `resolvePreview(recordingMbid, artistName, trackTitle)` in
`apps/server/src/preview/index.ts`. It returns `{ previewUrl, source }` and resolves in order: the
`preview_cache` table (keyed by recording MBID), then a Deezer track search, then an iTunes search;
a miss writes a permanent negative-cache row (`source: "none"`, `previewUrl: null`).

## The staleness invariant (load-bearing)

Deezer/iTunes preview URLs are **time-limited** — they carry an expiry token and 4xx after a while.
`preview_cache` has **no TTL**: `getCachedPreview` is an unconditional primary-key lookup; `cachedAt` is
written but never read. So a cached `previewUrl` can be expired by the time it's used.

Therefore **clients must never play a resolved `previewUrl` directly.** All preview playback goes through
the proxy `GET /api/preview/:recordingMbid/stream?artistName=&trackTitle=` (`routes/preview.ts`). The
proxy resolves the URL, fetches it under the SSRF guard (`guardedFetch`: https-only, public host via
`isPublicHost`, `redirect: "manual"`), and on a non-OK upstream **evicts the cache entry
(`deleteCachedPreview`) and re-resolves once** — self-healing the stale token. It then buffers the clip
(capped at 10 MB by actual bytes, not just the declared length) and serves it **range-aware**, mirroring
the track-stream route: `Accept-Ranges: bytes`, a `206`/`Content-Range` slice for `Range` requests (`416`
when unsatisfiable), else a `200` with the true `Content-Length`; always `audio/mpeg`. Range support is
load-bearing — native players (expo-audio → AVPlayer/ExoPlayer) need it to build a seekable timeline, so
without it a preview plays but its progress bar stays pinned at 0. A track with no preview makes the route
404; clients treat that as unavailable.

The cache is kept deliberately (no TTL): it saves the expensive Deezer/iTunes *search*, and the proxy
already corrects staleness, so a TTL would only guess at the upstream token lifetime. There is no longer a
non-streaming lazy resolver route, and `previewUrl` is no longer carried on any payload — recommendations
([[recommendations]]) and search results both omit it, and previews are resolved on demand at stream time.

## Clients

Web `usePreviewAudio` points an `<audio>` at the `/stream` route (same-origin session cookie). Mobile
`PreviewProvider` streams it via expo-audio `replace({ uri, headers })` with `Authorization: Bearer`,
absolutising the server-relative path against the session — mirroring authed track streaming. Never attach
the user's bearer token to a raw third-party CDN URL (it would leak to the third party). Both clients show
the play affordance optimistically and surface a 404/load failure as "preview unavailable".
