---
paths:
  - "apps/mobile/src/app/**/*.tsx"
  - "apps/mobile/src/components/album/**/*.tsx"
  - "apps/mobile/src/components/playlist/**/*.tsx"
---

# Mobile Navigation & Detail Screens

The mobile app (`apps/mobile`, Expo + expo-router, SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`). The root layout `src/app/_layout.tsx` is a `<Stack>` with two auth-guarded branches via `Stack.Protected`: `(auth)` when signed out, `(home)` when signed in. The `(home)` group's layout renders `AppTabs` (`components/app-tabs.tsx`) — `NativeTabs` from `expo-router/unstable-native-tabs`, one screen file per tab (`index`, `explore`, `library`, `settings`).

## Detail screens push within a tab's own Stack (keep the tab bar visible)

A detail screen (album and playlist today; artist is a pending TODO that must follow this) must **push within its tab so the native tab bar stays visible** — it must NOT be a root-Stack sibling (that covers the tab bar). The pattern is "Stack inside native tabs": a tab that hosts detail screens is a **folder** with its own `_layout.tsx` (`<Stack>`), an `index.tsx` (the tab screen), and the detail routes nested under it. So `library.tsx`/`explore.tsx` became `library/index.tsx`+`library/_layout.tsx` and `explore/index.tsx`+`explore/_layout.tsx`, each with `album/[albumKey].tsx` and `playlist/[playlistKey].tsx`. The `index`/`settings` tabs stay flat files (no detail pushes), so home-screen tiles don't open detail screens today. Each tab `_layout` sets `unstable_settings = { initialRouteName: "index" }`.

The album screen is shared across both tab stacks via one `components/album/album-screen.tsx`; the per-tab route files are thin wrappers passing their own `basePath` (`/(home)/library/album/[albumKey]` or `/(home)/explore/album/[albumKey]`) so a "More by artist" tap pushes the sibling onto the *same* tab stack. The playlist screen (`components/playlist/playlist-screen.tsx`) is shared the same way, but its wrappers pass a `mode` (`"recommended"` from explore, `"inLibrary"` from library) rather than a basePath, since it has no sibling-push rail. Navigate to a detail from a tab's content using that tab's pathname.

Typed routes are on (`app.json` → `experiments.typedRoutes`). Navigate to a **dynamic** route with the object form — `router.push({ pathname: "/(home)/library/album/[albumKey]", params: { albumKey } })`. The string-interpolation form (`/album/${id}`) is not generated for dynamic segments and fails `tsc`. After adding/moving routes, route types regenerate on `expo export` (the build) or a running dev server.

Wrap a screen body in `<Screen>` (`components/ui/screen.tsx`) for the `stacScreenIn` entrance animation; the Stacks use `animation: "none"` because screens own their own entrance.

## Album detail conventions

`:albumKey` is either a local cuid2 album id (owned albums, opened from the library grid / in-library search) or a MusicBrainz release-group MBID (explore-search albums). `GET /api/albums/:albumKey` resolves either to a `source: "local" | "external"` `UnifiedAlbumDetail`. Fetch via `hooks/use-album-detail.ts`; the "More by artist" rail fetches the artist's discography via `hooks/use-artist-detail.ts` (local artistId or MB artistMbid).

Availability is **album-level**, not per-track — the API gives no per-track ownership. `lib/album-view-model.ts` derives it: local with `pendingTrackCount === 0` → in-library; local with pending > 0 → partial (`N of M`); external → found-on-MusicBrainz. Pure view-model helpers (availability, totals, eyebrow, `albumTrackRows`, `playableTrackIds`) live there and are unit-tested; keep new album logic pure and tested there rather than in components.

Lidarr requests are album-level (release-group MBID) and reuse explore's `LidarrSheet` + `subjectFrom*` helpers (`components/explore/lidarr-sheet.tsx`). A subject is only buildable for **external** albums — local album detail omits `artistMbid` — so the request affordance is external-only.

## Playlist detail conventions

Two data sources feed one screen, chosen by `mode`. **Recommended** (explore): selected by id out of the cached `useRecommendedPlaylists` list — the list embeds every playlist's full tracklist with live `inLibrary`/`localTrackId`, so no extra fetch (`hooks/use-recommended-playlist.ts`). **In-library** (library): `GET /api/playlists/:id` via `hooks/use-playlist-detail.ts`; every track is owned. Pure mapping + tests live in `lib/playlist-view-model.ts` (`playlistViewFrom{Recommended,Library}` → one `PlaylistView`); keep new playlist logic there. The server's playlist-detail/list/update responses carry a `coverArtUrls` mosaic (up to 4) and per-track `recordingMbid`; the hero renders the mosaic via `AlbumArt artUrls` (recommended uses the single `coverArtUrl`).

Per-track Lidarr requests (recommended, not-in-library rows) reuse `LidarrSheet` + `subjectFromPlaylistTrack`. The recommended hero's "Add all to library" button + `AddAllSheet` are a **visual stub** (no bulk endpoint exists). In-library playlists end with a `PlaylistSuggestions` block (`GET /api/playlists/:id/suggestions`): three picks, +/× to request-or-dismiss, refresh to re-roll; slot rotation state is kept in component state (no refs during render).

## Shared TrackRow plays the whole album or playlist

`components/explore/track-row.tsx` is the one track row for explore, search, album, and playlist screens. It takes optional `queueTrackIds` + `queueIndex`: when present on an owned row, tapping replaces the queue with the whole album/playlist starting at that track (`usePlayback().playTracks(ids, startIndex)`); omit them for single-track contexts (explore/search keep single-track playback). External rows stay preview-only via `usePreview`.

Mobile tests use **jest** (`jest-expo`, `@testing-library/react-native`), not Vitest. `expo-router` and `react-native-safe-area-context` are mocked (the latter globally in `jest-setup.js`).
