---
paths:
  - "apps/mobile/src/stores/**/*.ts"
  - "apps/mobile/src/providers/**/*.tsx"
  - "apps/mobile/src/components/sheets/global-sheet-host.tsx"
  - "apps/mobile/src/app/_layout.tsx"
---

# Mobile Shared State (Provider vs zustand store)

The mobile app (`apps/mobile`, Expo SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`) shares cross-screen *client* state two ways, and which one to use is a decision, not a preference. (Server data is separate — it goes through the authed query/mutation hook family in `src/hooks/`; this rule is only about local/UI state.)

## The decision

If the thing owns a **native resource or a React hook that must run inside the tree** — e.g. `useAudioPlayer()` from expo-audio, whose player object is tied to component lifecycle and cannot live outside React — it is a **Provider** component in `src/providers/`. `playback-provider` and `preview-provider` are Providers for exactly this reason and must stay that way.

If it is **plain shared state with no native object** — open/close flags, selections, ephemeral UI — it is a **zustand store** in `src/stores/`, not a new Provider. Do **not** add another `createContext`/Provider for this case. Two costs drive the rule: a context re-renders *every* consumer whenever its value changes, while a store with per-slice selectors re-renders only the components that read the changed slice; and each Provider adds a level of tree nesting in `_layout.tsx` while a store adds none.

## Global sheets are the worked example

App-global bottom sheets (opened imperatively from many screens, must float above the mini player and toasts) live in `stores/sheet-store.ts` and are rendered once by `components/sheets/global-sheet-host.tsx` — a single flat sibling in `_layout.tsx` (sits beside `PlayerOverlayRoot`, no provider wrapping). `GlobalSheetHost` is a dumb mount point (no props, no UI of its own); the "Host" suffix mirrors `StaccatoToastHost` and signals exactly that. Each sheet's store state is the subject it's open for, or null = closed, matching the `subject`/`view` prop the sheet component already takes. Adding a global sheet is a store field + two actions + one line in the host — never a new Provider, never another wrapper in `_layout.tsx`.

Call-site hooks (`useLidarrSheet`, `useAddAllSheet`) are drop-in replacements for the old context hooks: same `{ open, close }` shape, so consumers only changed their import. They select each action **individually** and assemble the returned object in the hook body.

## zustand v5 gotcha (load-bearing)

zustand v5 dropped snapshot caching, so a selector that returns a **new object or array** every call (`(s) => ({ open, close })`, `(s) => [...]`) triggers an infinite render loop. Always select primitives or individual stable refs (actions are stable) and build any composite object in the hook body, outside the selector. The comment in `sheet-store.ts` guards this — don't "tidy" it back into an object selector.

## What stays local, not global

Not every sheet belongs in the store. A sheet opened from a single place keeps local `open` state where it's mounted — `AddToPlaylistSheet` lives inside `NowPlayingPanel` with `useState`, not the store, because only the Now Playing "+" opens it. Promote to the store only when a sheet is opened from several screens or must render above every overlay.
