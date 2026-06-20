---
paths:
  - "apps/mobile/src/hooks/use-api-client.ts"
  - "apps/mobile/src/hooks/use-authed-query.ts"
  - "apps/mobile/src/hooks/use-authed-infinite-list.ts"
  - "apps/mobile/src/hooks/use-authed-mutation.ts"
---

# Mobile Data Access (authed query/mutation hooks)

The mobile app (`apps/mobile`, Expo SDK 56 — read the v56 docs per `apps/mobile/AGENTS.md`) routes every server call through one small hook family in `src/hooks/`, so no screen talks to `fetch` or `createApiClient` directly. The seam is split by read vs write, not by HTTP verb.

`useApiClient()` returns an `ApiClient` bound to the active session (memoised on `serverUrl` + `token`), or `null` when signed out. `useSession` is the single source of session truth; both query and mutation hooks gate on it.

`useAuthedQuery(key, path, schema, options?)` wraps `useQuery` for GET: it namespaces the key as `[...key, serverUrl]`, disables until there is a session, validates the response with the passed zod schema through the client, and forwards pass-through options (`staleTime`, `enabled`, …). `useAuthedInfiniteList(key, endpoint, itemSchema, options?)` is the offset-paged analog for `{ items, total }` endpoints: same server-scoped key and session gating, each page validated with `paginatedSchema(itemSchema)`, returning flattened `items` and `total`. Default page size 50.

`useAuthedMutation(key, mutationFn, options?)` is the write counterpart: runs through the same client, optionally applies an `optimisticUpdate` to the cache entry under the server-scoped `key` (rolled back on error), and invalidates on settle.

## The server-URL namespace is invisible but load-bearing

Every key is silently suffixed with the active `serverUrl`. Always pass the bare key (`["library","playlists",sort]`) and let the hook append the URL — never hand-append it. React Query's `invalidateQueries` matches by **prefix**, so the suffix is transparent to matching but means two different servers never share a cache entry.

## Invalidate the keys the surfaces actually read, not just the mutation's own key

A mutation's primary `key` is for its optimistic-update target and home-screen list — it is **not** necessarily the key the affected screens read from. `invalidateQueries({ queryKey })` matches by prefix, and these key families do not overlap: a write that changes playlist contents must invalidate `["library","playlists"]` (Library tab / pickers via `useAuthedInfiniteList`) and `["playlist", id]` (detail via `useAuthedQuery`) — not just `["playlists"]` (home). Invalidating only the primary key leaves the other surfaces stale until `staleTime` lapses, with no visible error.

For this, `useAuthedMutation` takes an `invalidateKeys` option — a static `QueryKey[]` or a `(variables) => QueryKey[]` function (use the function form for per-id detail keys derived from the mutation variables). On settle it invalidates the primary namespaced key **plus** each extra key, each server-scoped the same way. When adding a mutation, enumerate every screen that displays the mutated data, find each one's hook key, and list them in `invalidateKeys`. `useAddTrackToPlaylist` is the worked example.
