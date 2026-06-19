---
paths:
  - "apps/mobile/src/lib/storage/**/*.ts"
  - "apps/mobile/src/providers/playback-provider.tsx"
---

# Mobile Persistent Storage (blob store + artwork cache)

The mobile app (`apps/mobile`, Expo SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`) keeps a generic on-disk cache under `src/lib/storage/`. It exists because lock screens fetch artwork URLs themselves and cannot attach the `Authorization: Bearer` header that Staccato's server-relative cover URLs (`/metadata/covers/<mbid>.jpg`, served behind `requireAuth`) require, and the server exposes no unauthenticated/query-token cover endpoint. So the app must download cover bytes itself (with the header) to a local file and hand the lock screen a `file://` path.

## The blob-store primitive (`blob-store.ts`)

`createBlobStore(config, fs?)` returns `{ ensure(key, url, opts?), remove(key), clear() }`. `config` is `{ name, baseDir: "cache" | "document", indexKey, maxBytes? }`. `baseDir` chooses `Paths.cache` (OS-evictable; artwork) or `Paths.document` (durable; reserved for offline downloads). `ensure` downloads `url` (with optional `opts.headers`) to a deterministic file and returns its `file://` uri; concurrent calls for the same key share one in-flight promise (dedup map). A cache hit that finds the indexed file missing on disk (OS reclaimed `Paths.cache`) re-downloads. Filenames are an FNV-1a hex hash of the key plus `.jpg` (a cache key, not a security boundary; the lock screen sniffs content regardless of extension). When `maxBytes` is set, after each add it evicts least-recently-used entries (by `lastAccessedAt`) until under the cap, never evicting below one entry. A hit refreshes `lastAccessedAt` so hot entries survive.

The index (`key → { filename, bytes, lastAccessedAt }`) is a single JSON value in async-storage under `config.indexKey` — kilobytes of metadata only; image bytes never go in async-storage. It is lazily loaded once and persisted after every mutation. Corrupt/missing index parses to empty.

Filesystem access goes through a small injectable `BlobFs` adapter (`ensureDir`, `uriFor`, `exists`, `download`, `remove`), defaulting to an expo-file-system implementation (`new File(Paths.cache, name)`, `File.downloadFileAsync(url, dest, { headers })`, `file.exists`, `file.size`, `file.delete()`). Tests inject a fake `BlobFs` so the index/dedup/eviction logic is exercised without the native module.

## The artwork cache policy (`artwork-cache.ts`)

A single module-level `createBlobStore({ name: "artwork", baseDir: "cache", indexKey: "staccato.artworkCache.index", maxBytes: 50MB })`. `ensureArtworkFile(coverArtUrl, session)` runs the URL through `resolveImageSource` (`../image-source.ts`) — which absolutises server-relative paths and attaches the Bearer header, passes absolute façade URLs through verbatim with NO header (never leak the token to a third party), and returns null for nulls/sentinels — then `store.ensure`s the resolved uri (keyed by that uri, so every track on an album shares one file). Returns null on no cover / no session / download failure (logged via `console.warn`), so callers just render no art.

## Playback-provider wiring

`playback-provider.tsx`'s track-change effect sets text-only lock-screen metadata first (instant), then fires `ensureArtworkFile(track.coverArtUrl, authSession)` and, when it resolves, re-calls `player.setActiveForLockScreen(true, { ...metadata, artworkUrl: fileUri })` (`AudioMetadata.artworkUrl`, expo-audio). A per-effect `cancelled` flag (set in the effect cleanup) suppresses a stale previous-track download from clobbering newer metadata; it never blocks the new track's own update. This runs while the device is locked because background audio (`shouldPlayInBackground: true`) keeps the JS engine alive — the same context the 5s position-sync interval and `didJustFinish` auto-advance use — and the queue advance flips `currentTrackIndex` via an optimistic update with no network dependency.

## Handoff for the imminent offline-downloads feature

The durable store is just another `createBlobStore({ baseDir: "document" })` instance (no `maxBytes`; pinned, user-deleted) plus its own manifest/queue — reuse this primitive, don't rebuild it. The index is deliberately swappable: async-storage suits the transient cache, but the downloads manifest will likely want `expo-sqlite` for richer querying (owned content, per-album/playlist grouping, sizes).

`useCachedImageSource` was deliberately deferred to that feature, not dropped. Its real value is offline rendering (show art with no network when expo-image's own disk cache may have been evicted), which needs the durable store that does not exist yet — pointing it at the transient cache would be wrong (an evicted entry means no art exactly when offline needs it). Shape it as an async hook `useCachedImageSource(coverArtUrl)` resolving durable-store-first → transient artwork cache → `resolveImageSource` fallback, wired into now-playing art + mini-player first (also removes the one duplicate fetch of the current cover that exists today: the blob store fetches a copy while expo-image fetches its own). Do NOT make `resolveImageSource` itself cache-aware — it is sync and called inline in render by many components, so going async would ripple a loading state everywhere and risk placeholder flicker.

## Native build gotcha (expo-file-system prebuilt ABI)

`apps/mobile/package.json` sets `expo.autolinking.ios.buildFromSource: ["expo-file-system"]` (and the same under `android`). The platform-nested `ios`/`android` placement is required — a top-level `buildFromSource` is not the documented form (autolinking reads `autolinking.ios` for the Apple platform). This is load-bearing, not optional. EAS enables precompiled Expo modules by default (`EXPO_USE_PRECOMPILED_MODULES=1` + prebuilt React Native), and `expo-file-system@56.0.8` ships a prebuilt `ExpoFileSystem.xcframework` compiled against an older `expo-modules-core` whose `Record` API was `from(dictionary:appContext:)`. The project resolves `expo-modules-core@56.0.14` (pulled up by newer modules like `expo-router`), which renamed that to `convert(from:)`. Linking the stale prebuilt against core 56.0.14 makes the app abort at launch with a dyld "Symbol not found: ExpoModulesCore.Record.from(dictionary:appContext:)" before any JS runs — and `eas build --clear-cache` does NOT fix it, because prebuilt binaries are not recompiled. `buildFromSource` forces the module to compile from source against the real core. If the offline-downloads feature adds more native modules, watch for the same prebuilt-vs-core ABI skew.

## Tests

Mobile uses jest (`jest-expo`), not Vitest. `expo-file-system` and async-storage are mocked globally in `jest-setup.js`. Storage logic is tested with an injected fake `BlobFs`; `artwork-cache` tests mock `./blob-store` and capture the store instance the module built at import; the provider test mocks `@/lib/storage/artwork-cache`.
