# Debug Tools

> **Stub.** Headings and source pointers only — to be written out in a later pass.
>
> Source of truth: the scripts in `apps/server/tools/`. Most run via `tsx` from the server
> workspace. See also the `debug-import` skill, which orchestrates several of these.

## Resolution / matching

> - `debug-resolution.ts` — simulate the search pass for `"Artist" "Title" ["Album"] [Year]`;
>   shows candidate scores and hint matches.
> - `verify-pickrelease.ts` — fetch a recording and run `pickRelease()` to show which release
>   would win and at what confidence.
> - `check-failed.ts` — sample unresolved tracks from the DB against MB and report rates.
> - `reresolve-folder.ts` — reset tracks matching a path pattern to `pending` and re-resolve.

## Fingerprinting / tags

> - `fingerprint.ts` — run `fpcalc` + AcoustID via the real pipeline code path.
> - `inspect-tags.js` — dump all `music-metadata` output for a file (also `pnpm inspect-tags`).
> - `count-files-with-tag.js` — stats on how many library files carry which MB tags.

## Raw DB access

> - `sql.ts` — ad-hoc Drizzle queries against the live DB.

> For each script, document the exact invocation, required env (`ACOUSTID_API_KEY`,
> `STACCATO_METADATA_URL`), and example output.
