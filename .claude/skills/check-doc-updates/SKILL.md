---
name: check-doc-updates
description: Use when work is complete or about to be claimed complete — code has been added, changed, or deleted during this session and documentation or rules may be out of date. Triggers include finishing an implementation task, reaching a verify step, or any point where changes are ready to be committed or reviewed.
---

# Check Doc Updates

## Overview

After any session that changes code, check whether `.claude/rules/` files or `apps/internal-docs/` files need updating and make those updates in place.

**Core principle:** Doc drift is silent. Check every time, and explicitly confirm even when nothing needs updating.

## When to Use

- About to claim work complete, commit, or open a PR
- Reached a verification step after making changes
- Any session where files were added, changed, or deleted

**Not for:** Sessions with no code changes (doc-only edits, reading or researching only).

## Algorithm — Reflect and Match

**Step 1: Enumerate changed subsystems**

Reflect on what you changed this session. For each changed module or directory, derive a kebab-case slug:

- `apps/server/src/recommendations/` → `recommendations`
- `apps/server/src/scanner/` or `apps/server/src/metadata/` → `import-pipeline`
- `packages/shared/src/types/` → no named subsystem (skip)

**Step 2: Enumerate loaded rules**

Reflect on which `.claude/rules/` files were read during this session — either explicitly via the Read tool or auto-loaded because their `paths:` frontmatter matched a file being edited. Add their slugs to the candidate list.

**Step 3: Build candidate list**

Take the union of slug-matched files and loaded rule slugs.

**Step 4: Check and update each candidate**

For each slug in the candidate list:

1. Check `.claude/rules/<slug>.md` — if it exists, read it and update to reflect what changed
2. Check `apps/internal-docs/src/architecture/<slug>.md` — if it exists, read it and update

Both surfaces must be updated if both exist. They must never contradict each other after an update.

Surface constraints:

- **Rules** (`.claude/rules/`): prose only, no tables or code blocks, terse and dense, self-sufficient per session
- **Internal docs** (`apps/internal-docs/`): tables, code snippets, and examples are appropriate; most detailed surface

**Step 5: Report outcomes**

Always report one of:

- Updates made → state what changed and why, file by file
- Nothing needed → "Checked [list of candidates]. No updates needed."
- Undocumented subsystem changed → "Changed [subsystem] has no corresponding rule or internal doc — consider adding one."

Silence is not acceptable as evidence of a complete check.

## Common Mistakes

| Mistake                                       | Correct approach                                      |
| --------------------------------------------- | ----------------------------------------------------- |
| Staying silent when nothing needs updating    | Always report explicitly                              |
| Updating only one surface when both exist     | Both must stay in sync                                |
| Adding code blocks or tables to a rule file   | Rules are prose-only                                  |
| Creating new docs for undocumented subsystems | Flag it, don't create                                 |
| Skipping the loaded-rules reflection          | Rules loaded during the session are always candidates |
