# Severity Rubric & Finding Schema

Shared by every audit reviewer and the `codebase-audit` orchestrator. Reviewers MUST use this rubric and schema verbatim — consistency is what makes cross-reviewer dedup possible.

## Severity rubric

| Severity | Meaning |
|----------|---------|
| **Critical** | Exploitable security hole, data loss/corruption, or broken user-visible functionality. Fix before anything else. |
| **High** | Likely bug, unsafe migration, missing auth check, or boundary violation that will cause incidents or block refactors. |
| **Medium** | Real maintainability/correctness/perf issue with limited blast radius; should fix but not urgent. |
| **Low** | Minor improvement, style, or nice-to-have. Candidate for batching into a single tracking issue. |

## Grounding (mandatory)

Every finding must be grounded in code you have **actually read** — never inferred from a filename, a guess, or another finding.

- Before emitting a finding, **re-read the lines at each location** to confirm they still say what you think and the line numbers are right. If a line number is approximate, give a small range (e.g. `:42-48`) rather than a wrong exact line.
- Populate `evidence` with the **actual code quoted verbatim** at the primary location (a few lines). If you cannot quote it, you have not verified it — **drop the finding.**

A finding without verified evidence is noise. Omit it.

## Finding schema

Each reviewer emits a single fenced `json` array of objects in this shape:

```json
{
  "id": "SEC-1",
  "title": "Imperative, specific, <80 chars",
  "severity": "Critical | High | Medium | Low",
  "area": "security | structure | type-safety | performance | database | api-contract | observability | correctness | tests",
  "locations": ["apps/server/src/foo.ts:42", "packages/shared/src/bar.ts:10-25"],
  "evidence": "The exact code at the primary location, quoted verbatim (a few lines).",
  "description": "What it is and why it matters.",
  "recommendation": "Concrete fix direction.",
  "confidence": "high | medium | low"
}
```

## Output format

Write your one-paragraph summary **first**, then the findings as a single fenced `json` array. That json block **MUST be the last fenced code block in your output** so the orchestrator can extract it deterministically. Emit `[]` if you found nothing — never omit the block.

## Merged finding (orchestrator only)

After cross-reviewer dedup, the orchestrator represents each consolidated item in this shape — a superset of the per-reviewer finding. **Standalone reviewers do not produce this**; they only emit the per-reviewer schema above.

```json
{
  "ids": ["SEC-1", "TYPE-4"],
  "title": "Imperative, specific, <80 chars",
  "severity": "Critical | High | Medium | Low",
  "areas": ["security", "type-safety"],
  "locations": ["apps/server/src/foo.ts:42"],
  "evidence": "Clearest verbatim quote among the merged findings.",
  "description": "Synthesised; may note the secondary lenses that also flagged it.",
  "recommendation": "Concrete fix direction.",
  "confidence": "high | medium | low"
}
```

Transforms vs the per-reviewer schema: `id` → `ids[]` (every contributing finding), `area` → `areas[]` (every lens that flagged it, deduped), `severity` and `confidence` take the **highest** among merged findings, `locations` are the **union**, `evidence` is the clearest single quote. When filing, the issue gets **all** of `areas` as labels; the **single highest** `severity` drives GitHub's native `Priority` issue field (Critical→Urgent, High→High, Medium→Medium, Low→Low) — not a label. See `create-issues.md`.

## Reviewer id prefixes

Keeps findings traceable through dedup.

| Area | Prefix |
|------|--------|
| security | `SEC` |
| structure | `STRUCT` |
| type-safety | `TYPE` |
| performance | `PERF` |
| database | `DB` |
| api-contract | `API` |
| observability | `OBS` |
| correctness | `CORR` |
| tests | `TEST` |
