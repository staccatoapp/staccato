---
paths:
  - "apps/mobile/src/lib/session.tsx"
  - "apps/mobile/src/lib/session-bootstrap.ts"
  - "apps/mobile/src/components/offline/**/*.tsx"
---

# Mobile Offline State

The mobile app (`apps/mobile`, Expo SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`) runs in a degraded **offline** mode when it holds credentials but can't reach the server, so a user with downloads keeps working instead of being bounced to login. Two axes, deliberately separate: `session: Session | null` means "we hold credentials" (set whenever a token + serverUrl exist, even unverified; cleared only on explicit 401 or sign-out), and `connectionStatus: "online" | "offline" | "reconnecting"` means reachability. Both live on `useSession`; `useIsOnline()` is the convenience selector.

`loadInitialSession` (`session-bootstrap.ts`) returns a discriminated `BootstrapResult`: `authenticated` (token accepted), `offline` (network/timeout — keeps the token + session), or `unauthenticated` (no creds, or a 401 that cleared the token). The distinction is load-bearing: only a 401 logs you out; an unreachable server keeps you in the app.

Because `session` is set even offline, the root gating in `app/_layout.tsx` is unchanged — `RootNavigator` shows `(protected)`, `PlaybackRoot` mounts playback/preview (downloads play), and the mini-player overlay persists. `SessionProvider` owns the reachability machinery: `probeConnection()` hits `/api/auth/me` (sets `reconnecting`, then `online` + `invalidateQueries()` on success, `signOut` on 401, back to `offline` otherwise), guarded against overlap by a ref; while `offline` an interval re-probes every 15s; `retryConnection()` exposes a manual probe for the UI. Server reads pause offline centrally via the authed read hooks (see [[mobile-data-access]]); downloaded art still renders via the cache-aware image path (see [[mobile-storage]]).

Offline UI lives under `components/offline/`. `OfflineHome` (rendered by the Home route `(protected)/(home)/index.tsx` when `connectionStatus !== "online"`, ahead of the online body so its data hooks don't run) composes `OfflineIndicator` (a banner with a WifiOff tile, status copy, and a `retryConnection` "Try again" button that swaps to a spinner while reconnecting) over `AvailableOfflineGrid` (a 2-column grid of `useDownloadedCollections()` — the fully-downloaded manifest entries, see [[mobile-storage]] — reusing `QuickStartGrid` cell styling, with the "downloaded" badge as the existing `CloudCheck` glyph, no new accent color). Grid cells are visual-only for now; tap/playback and offline treatment of the other tabs are the next iteration. `OfflineIndicator` is intentionally in the shared offline dir, not under home, so those screens can reuse it.

Tests: jest (`jest-expo`). Any `useSession` mock must now include `connectionStatus` (`"online"` for normal-path tests), or the read hooks stay disabled.
