# Import & Resolution Pipeline

The library pipeline turns audio files on disk into resolved tracks linked to canonical
MusicBrainz artists, albums, and recordings. It is the most complex subsystem in Staccato.
It lives entirely in `apps/server/src/library/`.

## Design principles

- **The file on disk is the source of truth.** Nothing is carried in memory across a queue
  boundary; every stage re-reads the file. The pipeline is therefore fully restart-resumable —
  a crash mid-scan just re-derives state on the next boot.
- **Staged queues.** Cheap local work (discovery) runs ahead of slow network work (resolution),
  so tracks become visible quickly and identification catches up behind them.
- **Best-effort enrichment is off the critical path.** Cover art, artist images, and richer
  metadata never block a scan from completing.

## Boot and reconcile

Entry points: `startLibraryPipeline(musicDir)` for normal startup and `startManualScan(musicDir)`
for a full re-scan (both in `apps/server/src/library/index.ts`).

On boot the pipeline checks optional support — `fpcalc` availability
(`evidence/fingerprint.ts`) and `STACCATO_SERVER_ACOUSTID_API_KEY` (`evidence/acoustid.ts`), warning if either
is missing — then runs `reconcile(musicDir)` (`reconcile.ts`):

- Files **on disk but not in the DB** → `enqueueDiscovery()`.
- Files **in the DB but not on disk** → marked pending-removal.
- Rows **already pending** (known but unresolved) → sent straight to `enqueueResolution()`,
  skipping re-discovery.
- Rows stuck in `resolving` (a previous crash) → reset to `pending`.

After reconcile, `startWatcher()` begins; the initial drain is awaited in the background so the
process can record scan completion while the watcher keeps the pipeline alive for new files.

## Continuous watching

`startWatcher(musicDir)` (`watcher.ts`) uses `chokidar`. `add`/`change` events enqueue
discovery; `unlink` marks the path pending-removal. A janitor timer hard-deletes rows whose
pending-removal timestamp is old enough — this debounce means a quick move/rename doesn't lose
the row (the rename is reattached by fingerprint at commit time instead).

## The queues

Defined in `apps/server/src/library/queue.ts` using `p-queue`. Concurrency is env-tunable:

| Queue      | Default | Env var                                          | Why                                                      |
| ---------- | ------- | ------------------------------------------------ | -------------------------------------------------------- |
| Discovery  | `8`     | `STACCATO_SERVER_LIBRARY_DISCOVERY_CONCURRENCY`  | Local IO (stat + tag read + insert); fast, run wide.     |
| Resolution | `6`     | `STACCATO_SERVER_LIBRARY_WORKER_CONCURRENCY`     | MusicBrainz-bound; also gated by the shared MB throttle. |
| Enrichment | `2`     | `STACCATO_SERVER_LIBRARY_ENRICHMENT_CONCURRENCY` | Best-effort background backfill.                         |

`drain()` awaits discovery-idle **then** resolution-idle. Enrichment is intentionally excluded
from `drain()` so eventual-consistency work never blocks scan completion.

## Discovery

`discoverFile(filePath)` (`worker.ts`):

1. `fs.stat()` — an unchanged, already-resolved file short-circuits on mtime/size.
2. `extractTags()` (`evidence/tags.ts`, via `music-metadata`) reads title, artist, album
   artist, track/disc number, duration, year, file format, and any embedded MB IDs
   (`musicbrainz_recordingid`, `musicbrainz_albumid`, `musicbrainz_releasegroupid`,
   `musicbrainz_albumartistid`, `musicbrainz_artistid`).
3. Upserts placeholder artist/album rows from the tags and creates a `pending` `tracks` row.
4. Enqueues the path for resolution.

## Resolution

`resolveTrack(filePath)` (`worker.ts`) re-reads tags from disk, then branches.

### Fast path

If the file carries **all four** MB IDs (recording, album/release, release-group, album-artist),
the resolver trusts them: it synthesises a winner + resolved release locally at confidence
`1.0`, commits immediately, and queues background enrichment. No network call on the critical
path.

### Normal path

Otherwise it gathers **evidence** and builds **candidates** in parallel:

- **Fingerprint** — `fingerprintFile()` (`evidence/fingerprint.ts`) shells out to `fpcalc`
  (Chromaprint) for `{ duration, fingerprint }`.
- **Candidates** come from up to three generators (`library/candidates/`):
  - `fromTags.ts` — if a recording MBID tag exists, verify it against the façade and pull the
    full release graph.
  - `fromAcoustid.ts` — `lookupFingerprint()` against the AcoustID API (rate-limited to
    3 req/s), top candidates by score, releases not yet enriched.
  - `fromSearch.ts` — a Lucene query (`artist:"…" AND recording:"…" AND release:"…"`) against
    the façade `/recordings/search`, with cleaned-title and album-clause variants.

## Scoring and winner selection

`scoring.ts` — `scoreCandidates()` then `pickWinner()`.

- **`tag_mbid` candidates score `1.0`** (`TAG_VERIFIED_SCORE`) — a verified embedded MBID is
  trusted fully.
- **Other candidates** get a weighted blend. When an AcoustID score is present it carries the
  largest single weight (`0.4` before renormalisation), with title similarity, artist
  similarity, and duration agreement sharing the remainder. When there is no AcoustID score,
  the blend is title + artist + duration, with **duration weighted highest**. Weights are
  renormalised to sum to 1, so the absence of a signal doesn't deflate the score. (See
  `scoreCandidate()` for the exact arithmetic.)
  - Title/artist similarity is a normalised Levenshtein ratio (`stringSimilarity`).
  - Duration agreement falls off linearly to 0 at a 5-second difference.
- **Signal-agreement bonus:** when two independent methods (e.g. acoustid + search) point at the
  same `recordingMbid`, every candidate for that MBID gets `+0.1` (capped at `1.0`).

`AUTO_COMMIT_THRESHOLD` is `0.85`; tracks below it are still committed but flagged as
low-confidence and can be retried via `retryResolution({ scope: "low_confidence" })`. A track
with no usable candidate is marked `failed` rather than partially resolved.

## Release disambiguation (`pickRelease`)

A recording usually belongs to many releases (original, reissues, comps, regional pressings).
`pickRelease(winner, tags)` (`graphWalk.ts`) walks a ladder and records **how far down it had to
go** as a confidence score:

| Step | Rule                                                                                            | Confidence     |
| ---- | ----------------------------------------------------------------------------------------------- | -------------- |
| 1    | File's `mbAlbumId` tag matches a release MBID exactly                                           | `1.0`          |
| 1.5  | File's album **title** tag matches a release title (Official preferred; year-matched preferred) | `0.95` / `0.9` |
| 2    | Exactly one Official album-type release (excludes Compilation/Live/Remix/Soundtrack/etc.)       | `0.8`          |
| 3    | Earliest release date wins among the candidate pool                                             | `0.7` / `0.6`  |
| 4    | Country tiebreak (prefer releases with a country set)                                           | `0.5`          |
| 5    | Digital-media preference, when the source file is a digital format                              | `0.4`          |
| —    | Fallback: first remaining, recorded as ambiguous                                                | `0.3`          |

The title-match step (1.5) is deliberately above the studio-album heuristic: user tagging is
strong evidence, it correctly keeps genuine compilations (e.g. "Greatest Hits"), and it makes
every track in a folder converge on the **same** release group instead of each picking its own
studio album. The chosen release's release-group MBID is inherited from the pick, not derived
independently.

## Commit

`commitResolution(input)` (`commit.ts`) does all canonical writes in **one SQLite transaction**:

- `resolveArtistRow()` — MBID-keyed find-or-create for the lead credit. Keying on MBID (not
  name) prevents last-writer-wins corruption when a shared folder's final track has a different
  credit (the "MF Doom / MF Grimm" class of bug).
- `commitAlbum()` — merges into an existing album row if the same `releaseMbid` is already known
  under a different local album.
- `replaceTrackArtists()` — writes the full ordered credit list to `track_artists`.
- `updateTrackByTrackId()` + `markTrackResolved()` — point the track at its final artist/album
  and stamp `musicbrainzId`, `canonicalTitle`, `confidenceScore`, `resolutionMethod`, and the
  audio fingerprint; status → `resolved`.
- Recompute `albums.artistId` as the dominant lead artist across all the album's resolved
  tracks.
- `upsertTrackFts()` — update the `tracks_fts` FTS5 index.

Rename detection also happens here: if the same audio fingerprint reappears at a new path, the
existing track row is reattached instead of creating a duplicate.

Then, **after** the transaction (async, non-blocking):

- `populateAlbumArtists()` fetches the release's full `artistCredits[]` from the façade and
  classifies each as a co-owner vs. a guest (below), writing `album_artists`.
- `ensureCoverOnDisk()` and `ensureArtistImageOnDisk()` fetch and cache assets under
  `${STACCATO_DATA_DIR}/metadata/`.

## Album artists and the primary/guest split {#album-artists}

Release-level credits drive whether an album appears in an artist's **Discography** (primary)
or under **Appears On** (guest). The classifier is `computePrimaryFlags()` in
`packages/shared/src/artist-credit.ts`:

- MusicBrainz stores a join phrase **after** each credit (`" & "`, `" feat. "`, `", "`).
- A **feature** connector (`feat.` / `ft.` / `featuring`, matched by `FEATURE_JOIN_RE`) marks
  the artist it introduces — and everyone after — as **guests**.
- Every other connector (`&`, `and`, `with`, `x`, `vs.`, comma, `+`) keeps the credited artists
  as **co-owners**.

Examples: `["MF Doom & MF Grimm"]` → `[true, true]`; `["A feat. B"]` → `[true, false]`;
`["A & B feat. C"]` → `[true, true, false]`.

## Background enrichment

`enrichTrack()` (`worker.ts`), fed only by fast-path commits, backfills what the fast path
skipped: a Chromaprint fingerprint (for future rename detection) and richer MB metadata
(full artist credits, canonical title). It runs at low concurrency and never blocks `drain()`.

## Retry and orphan sweep

- `retryResolution({ scope })` re-enqueues `failed` tracks, or `low_confidence` tracks below a
  threshold (default `0.85`), after resetting them to `pending`.
- After a drain, `sweepOrphans()` deletes orphan albums then orphan artists (albums first, so an
  artist whose only album just dropped is collected in the same pass).

## Debugging

When a track resolves wrong or not at all:

- Use the **`debug-import` skill**, which walks tags, fingerprint, and MB/AcoustID responses.
- Reach for the scripts in `apps/server/tools/` — see [Debug Tools](/reference/debug-tools)
  (e.g. `debug-resolution.ts`, `fingerprint.ts`, `verify-pickrelease.ts`, `check-failed.ts`).
