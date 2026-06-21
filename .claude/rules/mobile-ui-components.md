---
paths:
  - "apps/mobile/src/components/ui/**/*.tsx"
  - "apps/mobile/src/components/sheets/**/*.tsx"
  - "apps/mobile/src/components/staccato-image.tsx"
  - "apps/mobile/src/components/home/album-art.tsx"
  - "apps/mobile/src/components/explore/track-row.tsx"
  - "apps/mobile/src/components/explore/lidarr-sheet.tsx"
  - "apps/mobile/src/components/explore/add-album-sheet.tsx"
  - "apps/mobile/src/components/playlist/add-all-sheet.tsx"
  - "apps/mobile/src/components/downloads/**/*.tsx"
---

# Mobile Shared UI Components

The mobile app (`apps/mobile`, Expo + expo-router, SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`). This rule owns the shared, reusable presentational and interactive component layer that screens compose. The overarching invariant: **there is one shared component per job — don't reintroduce per-screen variants.** Navigation, routing, and the detail-screen scaffolds (collapsing hero, scroll insets) live in [[mobile-navigation]]; cross-screen client state (sheet store, downloads store) in [[mobile-state]].

## Image layer (StaccatoImage → AlbumArt)

`StaccatoImage` (`components/staccato-image.tsx`) is the single auth-aware image and the only place server artwork is fetched with credentials: it absolutises server-relative `/metadata/...` URLs against the **active session's** server URL, attaches the bearer token, prefers a locally-pinned offline copy when one exists, and falls back to a `fallback` node on load failure. Never fetch `/metadata` art with a bare `Image` — route it through here so auth, offline, and fallback stay consistent.

`AlbumArt` (`components/home/album-art.tsx`) is the universal square art primitive and the most-reused component in the app (~15 consumers). It paints a 135° gradient placeholder (centred music glyph + top highlight), swapped for the real artwork via `StaccatoImage` once `artUrl` is available; given **exactly 4** `artUrls` it renders a 2×2 mosaic (the playlist cover convention). Don't hand-roll art placeholders — pass a `gradientKey`/`artUrl(s)` to `AlbumArt`.

## Shared MediaTile for album/playlist grid + carousel cells

`components/ui/media-tile.tsx` is the one square art-tile (art over a two-line title/subtitle caption, pressable to open detail) for both the Home carousels (`components/home/carousel.tsx`) and the Library grid (`app/(protected)/library/index.tsx`). It takes a normalized presentational `MediaTileItem` (`{ id, title, subtitle, gradientKey, artUrl?, artUrls? }`) plus `size` + `onPress`, staying ignorant of the shared zod and Home view-model types — each screen maps its own data into it (Library inline via `pickGradient(id)`; Home in its mappings). Don't reintroduce per-screen tile components. Out of scope: `ArtistCell` (round avatar) and `QuickStartGrid` (horizontal row tile) keep their own layouts; `HeroRec` keeps its richer `HomeRecPlaylist` type.

## Shared TrackRow plays the whole album or playlist

`components/explore/track-row.tsx` is the one track row for explore, search, album, and playlist screens. The **whole row** is the play affordance (a single `Pressable` wrapping index + art + text), not just the artwork; `trailing` (duration / Lidarr button / suggestion +×) and the album more-button sit outside it so their taps don't trigger playback. It takes optional `queueTrackIds` + `queueIndex`: when present on an owned row, tapping replaces the queue with the whole album/playlist starting at that track (`usePlayback().playTracks(ids, startIndex)`); omit them for single-track contexts (explore/search keep single-track playback). External rows stay preview-only via `usePreview`. The `album` prop hides the artwork (the hero already shows it) and appends a non-functional 3-dot "more options" button after `trailing`.

## Design-system control set (`components/ui/`)

The form/control primitives in `components/ui/` are the shared DS layer used across the auth, admin, and detail screens — use them instead of hand-rolling inputs/buttons so focus rings, busy states, and spacing stay uniform. `Screen` (`screen.tsx`) is the full-bleed container with the `stacScreenIn` entrance animation (slide or fade variant, optional scroll); wrap a screen body in it (the Stacks use `animation: "none"` because screens own their entrance — see [[mobile-navigation]]). `PrimaryButton` is the CTA with idle/busy/ok phases and uses `Spinner` internally; `Spinner` is the standalone 2px-ring loader. `TextField` is the DS input (raised surface, orange focus ring, red error border, optional trailing slot), labelled by `FieldLabel` (uppercase muted) and paired with `ErrorBanner` (reserves its slot height so the layout doesn't jump when an error toggles). `SearchField` is the search input (leading magnifier + trailing clear, `compact` flag for 32 vs 36px). `ListGroup` and `ServerRow` are connect-screen primitives (single consumer today) but belong to the same set.

## Bottom sheet architecture

Bottom sheets follow a three-tier structure. `BottomSheet` (`components/ui/bottom-sheet.tsx`) is a generic animated primitive (Reanimated `translateY` + backdrop, handle bar, card shell) with no content opinions. `LidarrSheet` (`components/explore/lidarr-sheet.tsx`) is a shared layout base for Lidarr-flavoured sheets: it renders an art-header, info block (`variant: "primary"` → orange banner; `"muted"` → grey block), optional error, CTA, and optional cancel button inside a `BottomSheet`. `AddAlbumSheet` (`components/explore/add-album-sheet.tsx`) and `AddAllSheet` (`components/playlist/add-all-sheet.tsx`) derive from it by marshalling their own data into its slot props. Both derived sheets are app-global: opened through the sheet store (`stores/sheet-store.ts`) and rendered once by `GlobalSheetHost` at root, so they always render above the mini player overlay. The Provider-vs-store decision behind this is its own rule ([[mobile-state]]).

Not every sheet needs `LidarrSheet` or the global sheet store. `AddToPlaylistSheet` (`components/sheets/add-to-playlist-sheet.tsx`) derives straight from `BottomSheet` (search field, no-op "New Playlist" row, FlatList of `PlaylistListItem`) and is mounted inside `NowPlayingPanel` like `QueueSheet` — local `open` state, not the store, since only the Now Playing "+" opens it. It lists the user's playlists via `useLibraryPlaylists` (enabled only while open) and appends the current track with `useAddTrackToPlaylist` (`POST /api/playlists/:id/tracks`), closing immediately and confirming via toast.

## Toasts

The app's only toast surface is `components/ui/staccato-toast.tsx`, wrapping `react-native-toast-message` (pure-JS, no native code). Mount `StaccatoToastHost` once — it's the last sibling in `app/_layout.tsx` after `PlayerOverlayRoot`, so toasts float above the full-screen player; positioned `top`, offset below the notch. Trigger via the `staccatoToast.success(msg)` / `.error(msg)` helper only — never call `Toast.show` directly, so every toast keeps one OLED-pill look.

## DownloadButton

`DownloadButton` (`components/downloads/download-button.tsx`) is the shared ghost circle button that cycles idle → downloading (determinate `DownloadRing`, `download-ring.tsx`) → downloaded (CloudCheck); it sits in the album and playlist heroes. The button is just the affordance — the per-collection download feature it drives is its own subsystem ([[mobile-storage]]).

Mobile tests use **jest** (`jest-expo`, `@testing-library/react-native`), not Vitest — these shared components are the prime candidates for component tests. `expo-router` and `react-native-safe-area-context` are mocked (the latter globally in `jest-setup.js`).
