# Environment Variables

> **Stub.** Headings and source pointers only — to be written out in a later pass.
>
> Source of truth: `apps/server/src/env.ts` + `paths.ts`, `apps/metadata-service/src/env.ts` +
> `config.ts` (zod-validated), and `docker-compose.yml` / `.env.example`. Both apps load env via
> `dotenv-flow` keyed on `STACCATO_ENV`.

## Server (`apps/server`)

> Tabulate: `PORT` (8280), `STACCATO_SERVER_SESSION_SECRET`, `STACCATO_DATA_DIR`, `STACCATO_SERVER_MUSIC_DIR`, `STACCATO_ENV`,
> `STACCATO_LOG_LEVEL` / `STACCATO_LOG_FORMAT`, `STACCATO_METADATA_URL`, the MB throttle knobs
> (`MB_CONCURRENCY` / `MB_INTERVAL_CAP` / `MB_RATE_LIMIT_MS`), the library queue concurrency
> knobs (`STACCATO_SERVER_LIBRARY_DISCOVERY_CONCURRENCY` / `STACCATO_SERVER_LIBRARY_WORKER_CONCURRENCY` /
> `STACCATO_SERVER_LIBRARY_ENRICHMENT_CONCURRENCY`), `STACCATO_SERVER_ACOUSTID_API_KEY`, and `STACCATO_SERVER_FPCALC_PATH`. Note defaults and
> which are required.

## Metadata service (`apps/metadata-service`)

> Tabulate: `PORT` (8290), `MB_MIRROR_URL`, the mirror throttle knobs (`MIRROR_CONCURRENCY` /
> `MIRROR_INTERVAL_CAP` / `MIRROR_INTERVAL_MS`), `LISTENBRAINZ_API_URL`, and the `POPULARITY_*`
> knobs.

## Docker

> `DATA_PATH` / `MUSIC_PATH` host mounts and the production env set in `docker-compose.yml`.
