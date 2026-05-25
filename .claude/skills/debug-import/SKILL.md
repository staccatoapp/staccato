---
name: debug-import
description: Diagnose the cause of an incorrectly imported track, release, or artist by inspecting the tags, fingerprint, and responses from MusicBrainz and AcoustID. Use when the user reports an incorrect match or missing metadata after import, and you need to understand why the pipeline produced that result.
allowed-tools: Bash WebFetch EnterPlanMode
---

User has prompted with an example of an incorrectly imported track, release, or artist. Your task is to diagnose the cause by inspecting the relevant data and responses from MusicBrainz and AcoustID.

If at any point you need more information from the user to continue, specify exactly what you need and why.

## Guidelines

The general approach will be to follow the flow of the import pipeline stages to understand where an incorrect match or missing metadata could have been introduced. You will need to inspect the database entries for the track/release/artist, the embedded tags on the file(s), and the responses from MusicBrainz and AcoustID that led to the final committed metadata.

These are some steps you can follow to investigate the issue. You must always do steps 1 and 2 first. The rest are situational based on additional context the user may have already provided. You can deviate from this order as needed based on what you find.

**Two common failure classes — know which one you're chasing:**

- **Wrong _recording_ match** (the wrong song or version was committed): the problem is in identification — the fingerprint, the AcoustID/search candidates, or scoring (steps 5–7).
- **Right recording but wrong _artist_ or _album_ identity** (the recording MBID on the track is correct, but the artist/album is mislabeled — e.g. an artist showing under a collaborator's name): this almost always lives in commit-time canonicalization (`apps/server/src/library/commit.ts` — `resolveArtistRow`, `commitAlbum`), **not** in identification. If `tracks.musicbrainz_id` is correct but the joined artist/album row is wrong, skip ahead to the commit logic (step 7) and how artist/album rows are reused across tracks.

1. **Locate the media files involved**

The user may hand you a file (for a track) or a directory (for a release/artist) directly. If they gave only a database ID, or an artist/album/track name, recover the file paths from the database first — `tracks.file_path` stores the absolute path for every track, so you can go from the artist/album/track row to its files without asking (see step 3). Only stop and ask the user if the paths cannot be recovered from the DB (e.g. the row does not exist) or the files are not accessible on disk.

2. **Understand the import process**

A high-level overview is available at ".claude\rules\import-pipeline.md". Familiarize yourself with the stages of the pipeline: boot and reconcile, discovery, resolution, match and commit, and background work. This will help you know where to look for data and what to expect at each stage.

3. **Query the database entries for the incorrectly imported track, release, or artist**

`sqlite3` CLI is available in this environment. Run `sqlite3 <path-to-db>` then issue SQL. The DB path is usually `apps/server/data/data/staccato.db`. If this fails, you will need to infer the path from the server config (`STACCATO_DB_PATH` in `apps/server/.env*` - using a local env file if one is present).

Alternatively, you can use the bundled read-only query helper, which resolves the DB path from the server config and prints rows as formatted objects:

```
pnpm --filter @staccato/server sql "SELECT * FROM tracks WHERE id = '<track-id>'"
```

(For interactive human browsing, `pnpm --filter @staccato/server studio` opens Drizzle Studio.)

The schema stores albums in the `albums` table — there is no `releases` table. Tracks reference their album via `tracks.album_id` and their primary artist via `tracks.artist_id`. For a release or artist, start from that row and join to its tracks:

```sql
SELECT * FROM albums  WHERE id = '<album-id>';             -- or: SELECT * FROM artists WHERE id = '<artist-id>';
SELECT * FROM tracks  WHERE album_id = '<album-id>';       -- or: WHERE artist_id = '<artist-id>';
SELECT * FROM track_artists WHERE track_id = '<track-id>'; -- full ordered artist credits (lead at position 0, guests after)
```

If the user gave no IDs, find the row(s) by `file_path` (the same path from step 1). Note the committed MusicBrainz IDs, resolution method and confidence on each row — this is the pipeline's final output, and the wrong value here is what you are explaining.

4. **Inspect tags on the incorrect imports**

If the user has provided the result of running this, you can skip this step.

Use `pnpm --filter @staccato/server inspect-tags` and pass the file path to the incorrectly imported track. For releases or artists, repeat for any tracks associated only if this follows the flow of the import pipeline. This will show you the embedded tags that were read during discovery and resolution. Compare these tags to the metadata that was ultimately committed. Are there any discrepancies? For example, were there MusicBrainz IDs in the tags that were ignored? Or were there no useful tags and it had to rely on fingerprinting?

5. **Inspect the fingerprint and AcoustID candidates**

If the user has provided the result of running this, you can skip this step.

Run `pnpm --filter @staccato/server fingerprint "<file path>"`. It produces the Chromaprint fingerprint with `fpcalc`, then performs the **same** AcoustID lookup the pipeline uses (`candidatesFromAcoustid`, `meta=recordings`) and prints each candidate recording with its inline title, duration, `acoustidScore` and **`artistCredits`**. Compare these to what was committed: did the fingerprint match a different recording than expected? Did AcoustID return the wrong recording — or the right recording with a wrong/misleading `artistCredits[0]`? Did it fail to fingerprint at all? For a release/artist, repeat on the specific tracks whose committed metadata is wrong.

The tool loads the server env, so it picks up `ACOUSTID_API_KEY` from `apps/server/.env*` automatically. If that key is not configured it prints the fingerprint and skips the lookup (saying so). Candidates reflect AcoustID's current data, which can differ from import time if the underlying AcoustID/MusicBrainz data has changed since.

6. **Inspect metadata-service (façade) and MusicBrainz responses**

If the user has provided these responses, you can skip this step.

Resolution no longer calls MusicBrainz directly. It now goes through the **metadata-service façade** (`STACCATO_METADATA_URL`, default `http://localhost:8290/v1`) — see `apps/server/src/library/mbLookup.ts` and `FACADE_BASE` in `apps/server/src/musicbrainz/client.ts`. The recording/release/artist data the pipeline actually consumed came from the façade, so replicate the façade call, e.g.:

```
curl -s "http://localhost:8290/v1/recordings/<recording-mbid>"
curl -s "http://localhost:8290/v1/releases/<release-mbid>"
```

The façade can transform or flatten MusicBrainz data, and that transformation can itself be the bug — for example it returns a single `artistMbid`/`artistName` for releases and release-groups even when MusicBrainz credits multiple artists. When façade output looks wrong, compare it against the raw MusicBrainz mirror (`http://localhost:5000/ws/2/<entity>/<mbid>?fmt=json`, or musicbrainz.org) to tell whether the problem is upstream data, the façade, or the pipeline. If the façade or mirror is unavailable, stop and ask the user to make it available.

Note: `tools/debug-resolution.ts` queries musicbrainz.org directly and predates the façade — treat its output as upstream source data, not as what the pipeline consumed.

7. **Inspect candidate scoring and commit logic**

If nothing has seemed out of place so far, the issue may be in how the pipeline scored candidates and chose which one to commit. Review the code for candidate scoring and commit logic in the import pipeline. Compare this logic to the metadata that was committed for this track/release/artist. Is there any reason why the pipeline would have chosen the wrong candidate based on the scoring?

## Output

### If you have identified the cause of the incorrect import

1. Explain what it was and why it happened.
2. Explore potential fixes.
3. If there is a clear winning fix, enter plan mode and suggest an implementation.
4. If there is no clear winning fix, explain the tradeoffs of potential fixes and what additional information you would need to determine the best path forward.

**Any fix must not compromise the integrity of the import pipeline or lead to worse outcomes for other tracks. If a fix would involve a tradeoff, be sure to explain it clearly.**

### If you have NOT identified the cause of the incorrect import

Explain what you found and what additional information you would need to continue investigating.

Finally - regardless of the outcome - provide feedback on the use of this skill. Was it helpful? What could be improved? This will help us make it better for next time.
