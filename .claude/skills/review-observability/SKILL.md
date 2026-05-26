---
name: review-observability
description: Use when reviewing the Staccato codebase for logging coverage and quality — silent catches, missing failure logs at external API call sites, the object-first log format, and correct log levels per CLAUDE.md. Run standalone for a focused observability pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Observability

Focused review of logging coverage and quality, per the **Log Level guidance** and **Log call format** in `CLAUDE.md`. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

- **Coverage**: every `catch` block logs something; every external API call site (MusicBrainz, AcoustID, Cover Art, Lidarr, façade) logs failures with enough context to debug from the log alone. Flag silent catches and swallowed errors.
- **Format**: object-first `log.level({ err, ...context }, "message")` — the actual `Error` under the `err` key (for Pino's serializer), context as fields. Flag string-interpolated logs (`` `failed for ${id}` ``) and a missing `err` key.
- **Levels**: error/warn/info/debug used per the rule (recoverable external-client failures = `warn`; lifecycle/state transitions = `info`; per-item/polling = `debug`). Flag mis-levelled logs and **duplicate INFO logging of HTTP requests** (Fastify already auto-logs request/response).

Out of scope: whether the error is *handled* correctly (correctness); the error *response* to the client (api-contract).

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "observability"`, ids prefixed `OBS`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
