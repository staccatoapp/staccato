---
name: review-structure
description: Use when reviewing the Staccato codebase for structure and maintainability — layering/boundary violations (domain logic in route handlers or React components), packages/shared becoming a dumping ground, ownership boundaries, and worthwhile code duplication (DRY). Run standalone for a focused structure pass or dispatched by the codebase-audit orchestrator. Not for single-PR diff review.
---

# Review: Structure (architecture + duplication)

Focused review of code organisation: layering, boundaries, ownership, and duplication. Read first: `.claude/audit/conventions.md` and `.claude/audit/rubric.md` (load `server-architecture.md` and `database.md` rules in particular). Review **read-only — never edit code**.

## Brief

### Architecture & boundaries
- **Domain/business logic in the wrong layer**: logic in Fastify route handlers that belongs in a service/library module; data-fetching or business rules baked into React components instead of hooks/query layer.
- **`packages/shared` as a dumping ground**: server-only or app-specific code in `shared` (e.g. `*Row` DB types, which `database.md` says are **server-internal only**, DB access, Node-only deps in a package consumed by web/mobile). `shared` holds cross-boundary zod types and generic helpers — nothing else.
- **Ownership boundaries**: cross-app imports that bypass `shared`; web importing server internals; the metadata-service façade boundary being bypassed (resolution should go through the façade, not call MusicBrainz directly).
- **Response-boundary mapping**: route handlers should map `*Row` → zod API type at the boundary; flag handlers returning raw rows.

### Duplication (DRY) — strict guardrails to avoid nitpick noise
Only flag duplication **worth the abstraction cost**:
- A logic block of **~15+ lines** duplicated, OR a smaller block repeated **3+ times**, with copies likely to drift.
- **Cross-package / cross-app duplication** of non-trivial logic that should live in `packages/shared` (the highest-value finding here).

**Do NOT flag:** 2–3 line repeats, test arrange/boilerplate, type/interface declarations, config objects, similar-looking code with genuinely different intent, or anything where extraction would couple unrelated modules. Premature abstraction is worse than duplication — when in doubt, leave it out. Each duplication finding must list **every** copy and name the concrete extraction target.

Out of scope: response *shape* (api-contract); the *types* themselves (type-safety); runtime cost (performance).

## Output

Emit findings as one fenced `json` array per the schema in `rubric.md`, `area: "structure"`, ids prefixed `STRUCT`. Add a one-paragraph summary.

## Modes

- **Standalone** (default): after producing findings, follow `.claude/audit/triage-and-file.md`.
- **Findings-only** (dispatched by `codebase-audit`): stop after the JSON array; the orchestrator dedups and files.
