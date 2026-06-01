## Project Overview

Staccato is a self-hosted music player app for home labs, emphasising music discovery. The core experience closely emulates Spotify or Apple Music — users listen to a local music library, manage playlists, receive tailored song recommendations, preview recommended/searched songs via 30-second clips, and request new music for download via Lidarr integration. The app does NOT handle downloading directly.

## Architecture

- **Monorepo**: Turborepo with deployable applications in `apps/` and shared libraries in `packages/`
- **Language**: TypeScript everywhere
- **Backend apps**: Node.js + Fastify
- **Database**: SQLite (WAL mode) via Drizzle ORM with `better-sqlite3` driver
- **Web**: React SPA built with Vite, styled with shadcn/ui and Tailwind CSS, data fetching via TanStack Query
- **Documentation**: VitePress (static site, deployed separately from the main app)
- **Mobile** (future): Expo (React Native) with react-native-track-player for audio
- **Deployment**: Docker

## Commands

- `turbo dev` -> start the dev server
- `turbo lint` -> lint all apps/packages
- `turbo build` -> production build

# Conventions

- Use zod for any shared types that cross an app boundary (for example, from apps/server to apps/web), and include validation when using these types. Place these in `packages/shared/src/types/zod`.
- Prefer using shared package for any helper functions not project-specific

## External Service Integrations

### MusicBrainz — Canonical Metadata Source

All music metadata is normalised to MusicBrainz IDs (MBIDs). MBIDs are the universal glue that connects local library tracks, recommendations, search results, and download requests. MusicBrainz provides artist, album, track, genre/tag, and relationship data. Cover art comes from the Cover Art Archive (coverartarchive.org), keyed by release MBID.

## Working Practices

- Don't run `git commit`, `git push`, or any command that creates or modifies git history, even when executing an implementation plan. The exception to this is when running the "fix-issue" skill, which is white-listed to modify git history.

- Prefer adding a log over omitting one. Every `catch` block should log something. Every external API call site should log failures with enough context to debug from the log alone.

- whenever a user-created rule is loaded from .claude/rules or a skill is used from .claude/skills, provide feedback on the use of the rule or skill. Was it helpful? What could be improved? This will help us make it better for next time.

### Testing

For new or changed logic, use `superpowers:test-driven-development`. Add unit tests (and integration tests where the change crosses a boundary). Framework: Vitest, run via `pnpm test`.

### Before claiming work complete

1. Invoke `check-doc-updates` to assess whether any changed subsystem's rules or internal docs need updating.
2. Run and confirm each passes (fix and re-run on failure). Show command output — never assert green without evidence (`superpowers:verification-before-completion`):
   ```bash
   pnpm lint:fix --force  # --force bypasses turbo cache
   pnpm check-types
   pnpm test
   pnpm build
   ```
   If something genuinely can't be verified (missing service/dep), state exactly what and why — never fabricate results.

### Log Level guidance

- `error` — unrecoverable failures, fatal errors, anything that breaks user-visible functionality.
- `warn` — recoverable failures (silent catches in external clients returning null), degraded operating mode (missing optional integration like AcoustID), rate-limit backoffs that affect throughput, 4xx responses worth noting (auth failures, conflicts).
- `info` — lifecycle events (server up, scan started/complete, pass started with counts), state transitions, successful user-visible actions (user logged in, download queued). Fastify already auto-logs every HTTP request/response at INFO — do not duplicate.
- `debug` — per-item events (per-file scan, per-track resolution), polling tick details, deduplication skips, anything high-volume that would drown INFO. Default STACCATO_LOG_LEVEL hides these.

### Log call format

Always use the object-first pattern: `log.error({ err, context }, "message")`, not string interpolation. Include the actual `Error` under the `err` key so Pino's serializer captures stack traces. Surrounding context (ids, paths, counts, operation name) goes alongside.

```ts
// good
log.warn(
  { err, operation: "lookupRecording", recordingMbid: mbid },
  "mb recording lookup failed",
);

// bad
log.warn(`mb recording lookup failed for ${mbid}: ${err}`);
```
