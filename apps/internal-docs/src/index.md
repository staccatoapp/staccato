# Staccato — Internal Developer Docs

Documentation for people working **on** Staccato (not people running it). It explains
how the system is put together and how its trickier subsystems actually behave, so you
don't have to reverse-engineer them from source every time.

::: info Local-only
This site is never deployed. It is separate from `apps/docs` (the public, user-facing
VitePress site). Run it locally:

```bash
pnpm --filter @staccato/internal-docs dev
# then open http://localhost:5174
```

It also comes up automatically as part of `turbo dev`, on port `5174`.
:::

## What's here

- **[Architecture › Overview](/architecture/overview)** — the monorepo, the four apps,
  how they talk to each other at runtime, and the dev workflow. **Start here.**
- **[Architecture › Data Model](/architecture/data-model)** — the SQLite/Drizzle schema and
  the shared-vs-per-user split. _(stub)_
- **[Architecture › Metadata Service](/architecture/metadata-service)** — the MusicBrainz
  façade. _(stub)_
- **[Pipelines › Import & Resolution](/pipelines/import-resolution)** — the multi-stage
  music import and metadata-resolution pipeline. The most complex part of the system.
- **[Pipelines › Recommendations](/pipelines/recommendations)** — recommendation sources and
  cache warming. _(stub)_
- **[Reference › Environment Variables](/reference/environment)** — env var catalogue. _(stub)_
- **[Reference › Debug Tools](/reference/debug-tools)** — the `apps/server/tools/` scripts. _(stub)_

## Scope and relationship to other docs

This is the human-facing complement to the machine-facing context already in the repo:

- `CLAUDE.md` — project conventions and working practices (logging, zod, etc.).
- `.claude/rules/*.md` — short canonical notes on server architecture, the import pipeline,
  and documentation layout. The deep-dives here expand on those rules; where they overlap,
  the rule files are the source of truth for intent and this site for detail.

Out of scope for now (planned): an onboarding/setup guide and ADR-style decision records.
