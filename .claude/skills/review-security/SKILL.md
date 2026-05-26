---
name: review-security
description: Use when reviewing the Staccato codebase for security issues — auth/session/API-token handling, multi-user data isolation, path traversal near the data dir, SSRF in outbound calls (MusicBrainz/AcoustID/Lidarr/façade), and secret handling. Run standalone for a focused security pass or dispatched by the codebase-audit orchestrator. Wraps the security-review skill. Not for single-PR diff review.
---

# Review: Security

Focused security review of the Staccato codebase. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md`. Review **read-only — never edit code**.

## Brief

Use the built-in `security-review` skill as your **methodology guide** only. It is diff-scoped ("pending changes on the current branch"), so on a clean committed tree it has nothing to scan — **do not invoke it when there's no diff** (it would burn the pass for no result). Invoke it only if there are uncommitted changes worth a diff pass. Either way, the substance of this review is an independent audit of your scoped paths (see `conventions.md`) for Staccato's risk surface:

- **Auth**: session handling (`@fastify/session`), Bearer API-token validation, admin-only routes, the invite/create-account flow. Missing/inconsistent auth checks on `/api` routes.
- **Multi-user isolation**: per-user data (playlists, history, ListenBrainz creds, download requests) must be scoped by `user_id`; flag any query that could leak one user's data to another.
- **Path traversal / file serving**: anything deriving paths from input near `STACCATO_DATA_DIR`, plus the catch-all SPA handler.
- **SSRF / outbound**: calls to MusicBrainz, AcoustID, Cover Art Archive, Lidarr, the metadata-service façade — unvalidated URLs, secrets in logs.
- **Secrets**: API keys (`ACOUSTID_API_KEY`, Lidarr), ListenBrainz credentials at rest, `passwordHash` exposure.

Out of scope: pure logic bugs (correctness), generic typing (type-safety) — unless they create the vulnerability.

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "security"`, ids prefixed `SEC`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
