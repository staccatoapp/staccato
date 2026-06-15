# Preview Clips

30-second preview clips let users audition non-library tracks (recommendations, search results) before
requesting a download. Clips come from third-party catalogues — they are **not** part of the local library
and are never persisted as audio.

## Resolution: `resolvePreview`

`apps/server/src/preview/index.ts` exposes:

```ts
resolvePreview(recordingMbid, artistName, trackTitle): Promise<{
  previewUrl: string | null;
  source: "deezer" | "itunes" | "none";
}>
```

It resolves in order, short-circuiting on the first hit:

| Step | Source                  | Notes                                                             |
| ---- | ----------------------- | ----------------------------------------------------------------- |
| 1    | `preview_cache` (table) | Primary-key lookup by recording MBID. **No TTL** (see below).     |
| 2    | Deezer track search     | `lookupDeezerPreview` — `api.deezer.com/search/track`, limit 1.   |
| 3    | iTunes search           | `lookupItunesPreview` — `itunes.apple.com/search`, song, limit 1. |
| 4    | Negative cache          | On a total miss, writes `source: "none"`, `previewUrl: null`.     |

Every hit (including the negative case) is written to `preview_cache`
(`apps/server/src/db/schema/preview-cache.ts`): `musicbrainz_recording_id` (PK), `deezer_track_id`,
`itunes_track_id`, `preview_url`, `source`, `cached_at`.

## The staleness problem

Deezer/iTunes preview URLs are **time-limited**: the CDN URL carries an expiry token
(`…?hdnea=exp=…~hmac=…`) and returns 4xx once it lapses. But `preview_cache` has **no TTL** —
`getCachedPreview` is an unconditional PK lookup and the `cached_at` column is written but never read. So a
cached `preview_url` can be long expired by the time anything uses it.

The consequence (and the bug this design exists to prevent): **a client that plays a resolved `previewUrl`
directly will silently fail on an expired token.** This previously happened on mobile recommended tracks,
whose `previewUrl` was baked into the recommendation cache payload at refresh time (up to 6h old, often
older via the no-TTL cache) and played directly.

## The fix: always stream through the proxy

`GET /api/preview/:recordingMbid/stream?artistName=&trackTitle=` (`apps/server/src/routes/preview.ts`) is
the **only** supported playback path:

1. `resolvePreview(...)` → upstream URL (possibly stale from cache). 404 if none.
2. `guardedFetch` — SSRF guard: `new URL` parse, **https-only**, `isPublicHost` DNS check, and
   `redirect: "manual"` so a poisoned URL can't bounce to an internal address after the host check.
3. **Self-heal:** if the upstream is non-OK, `deleteCachedPreview(recordingMbid)` evicts the proven-stale
   entry and `resolvePreview` runs again (now cache-busted → fresh Deezer/iTunes URL); the fresh URL is
   fetched. If the retry also fails → 404; if both fetches fail at the network level → 502.
4. Buffers the upstream body — bounded at `MAX_PREVIEW_BYTES` (10 MB) by a fast-path check on the declared
   `Content-Length` _and_ by the actual bytes read (defends against an upstream that lies about / omits the
   header) — then serves it **range-aware**, mirroring the track-stream route (`routes/tracks.ts`):
   `Accept-Ranges: bytes`, `Content-Type: audio/mpeg`, `Cache-Control: public, max-age=3600`, and either a
   `206` with `Content-Range`/`Content-Length` for a `Range` request (`416` with `Content-Range: bytes */N`
   when unsatisfiable) or a `200` with the true `Content-Length`.

Range support is **load-bearing for client UX, not just an optimisation**: native players (expo-audio →
AVPlayer on iOS, ExoPlayer on Android) issue a range request to build a _seekable_ timeline. Served a plain
`200` with no `Accept-Ranges`, the clip still plays but the player can't establish position, so
`playbackStatusUpdate` reports `currentTime: 0` and the preview progress bar stays pinned at 0. (This was a
regression when mobile moved from playing the CDN URL directly — those CDNs support ranges — to this proxy.)
Buffering the whole clip is cheap here because it's already capped at 10 MB; it lets ranges be sliced from
the in-memory buffer rather than forwarded upstream, decoupling client range support from the CDN.

Because the proxy corrects staleness on demand, the cache is **kept without a TTL on purpose**: its value is
saving the expensive Deezer/iTunes _search_, and a TTL would only guess at the upstream token lifetime.

There is no non-streaming "lazy resolver" route — clients never receive a raw URL to play. `previewUrl` is
not carried on any wire payload: the recommendations payload omits it (see
[Recommendations](/pipelines/recommendations)) and search results never had it; previews are resolved
on demand at stream time, keyed by `recordingMbid` + `artistName` + `title`.

## Clients

| Client | How it streams                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web    | `usePreviewAudio` sets `<audio src>` to the `/stream` route; the same-origin session cookie authenticates.                                                                                 |
| Mobile | `PreviewProvider` calls expo-audio `replace({ uri, headers })` with `Authorization: Bearer`, absolutising the server-relative path against the session — mirroring authed track streaming. |

Never attach the user's bearer token to a raw third-party CDN URL (it would leak the token to the third
party). Both clients show the play affordance **optimistically** (there is no up-front previewability
signal) and surface a 404 / load failure as "preview unavailable" — on mobile, a one-session-only disabled
"preview off" glyph that blocks re-tapping until reload.
