---
paths:
  - "apps/server/src/library/**/*.ts"
---

# Import Pipeline Architecture

The library pipeline is owned by `apps/server/src/library` and is entered through `startLibraryPipeline` for normal startup and `startManualScan` for a full re-scan. It is designed as a staged flow: discovery gets files into the database quickly, resolution does the slower matching work, and background tasks fill in extra metadata afterward.

## Boot And Reconcile

On startup, the pipeline checks optional fingerprinting and AcoustID support, reconciles the music directory against the database, requeues unfinished work, and starts the filesystem watcher. Reconciliation marks missing files as pending removal, enqueues brand-new files for discovery, and sends already-known pending tracks straight back to resolution.

## Discovery

Discovery is the cheap first queue stage. It walks the library during startup or reacts to watcher add/change events, reads file stats and embedded tags, upserts a discovered track row, and then enqueues that path for resolution. This stage is intentionally local and fast so tracks become visible before network-backed identification finishes.

## Resolution

Resolution is a separate queue stage that re-reads the file and treats the file itself as the source of truth. Fully MusicBrainz-tagged files take a fast path and are committed immediately from tags, with enrichment deferred. Everything else tries to fingerprint the audio and build candidates from trusted tag MBIDs, AcoustID, and MusicBrainz search.

## Match And Commit

Candidate matches are scored, the best recording is chosen, and a release is selected before the result is committed to canonical artist, album, and track rows. Release selection (`pickRelease` in `graphWalk.ts`) walks a disambiguation chain — exact tag match, album-title match, then Official status, album primary-type, earliest date, country, and digital-media heuristics — and the chosen release's release-group MBID is inherited from that pick rather than determined independently. This stage also handles rename detection by reattaching an existing track row when the same audio fingerprint appears at a new path. If no usable match is found, the track is marked failed rather than partially resolved.

## Background And Continuous Work

Fast-path commits can trigger best-effort enrichment to backfill fingerprints and richer MusicBrainz metadata. Cover art and artist images are fetched outside the main commit path, and they do not block the initial pipeline drain. After startup, `startWatcher` keeps feeding discovery for adds and changes, while removals are first marked as pending removal and only deleted later by the janitor sweep if no matching file returns.
