---
name: check-doc-updates
description: Use when work is complete or about to be claimed complete — code has been added, changed, or deleted during this session and documentation or rules may be out of date. Triggers include finishing an implementation task, reaching a verify step, or any point where changes are ready to be committed or reviewed.
---

# Check Doc Updates

## Overview

After any session that changes code, check whether `.claude/rules/` files or `apps/internal-docs/` files need updating and make those updates in place.

**Core principle:** Doc drift is silent. Check every time, and explicitly confirm even when nothing needs updating.

**Rules stay lean.** A `.claude/rules/` file loads into agent context and must earn every line — keep it **under 100 lines**, prose only. Depth, tables, code, and examples belong in the internal doc, not the rule. When a subsystem you touched has no rule or doc yet, create one rather than just flagging it.

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

1. **Rule** — `.claude/rules/<slug>.md`:
   - If it exists, read it and update to reflect what changed.
   - If it doesn't exist and you changed a real subsystem (reusable knowledge a future session would need), **create it**. Add `paths:` frontmatter whose globs match the subsystem's source (e.g. `apps/server/src/library/**/*.ts`) so it auto-loads, then write terse prose. Model it on an existing rule like `import-pipeline.md`.
2. **Internal doc** — under `apps/internal-docs/src/`, organised into `architecture/`, `pipelines/`, and `reference/` subdirs (registered in `.vitepress/config.ts`). Locate the companion by **slug**, not a fixed subdir (e.g. the `recommendations` companion is `pipelines/recommendations.md`).
   - If it exists, read it and update.
   - If it doesn't exist and the subsystem warrants a deep-dive, **create it** using the same kebab-case slug as the rule (the pairing is mechanical — see the `documentation-architecture` rule), in the fitting subdir, and add it to the `.vitepress/config.ts` sidebar.

Both surfaces must be updated if both exist. They must never contradict each other after an update.

Surface constraints (governed by the `documentation-architecture` rule — read it before creating files):

- **Rules** (`.claude/rules/`): prose only, no tables or code blocks, terse and dense, self-sufficient per session, and **at most ~100 lines**. This is a hard ceiling, not a target — most rules should be far shorter.
- **Internal docs** (`apps/internal-docs/`): tables, code snippets, and examples are appropriate; most detailed surface. No size limit.

**Keep rules under the ceiling.** If updating (or creating) a rule pushes it past ~100 lines, do not let it grow — move the depth (detail, examples, edge cases) into the internal-doc companion and leave the rule with the dense essentials. Create the internal doc if it doesn't exist yet. A bloated rule you encounter while editing should be trimmed the same way, not left as-is.

**Step 5: Report outcomes**

Always report one of:

- Updates made → state what changed and why, file by file
- Files created → name the new rule/internal-doc and why the subsystem warranted one
- Detail relocated → note when content moved from a rule into its internal doc to stay under the line ceiling
- Nothing needed → "Checked [list of candidates]. No updates needed."
- Subsystem too trivial to document → "Changed [subsystem]; too minor/transient to warrant a rule or doc — skipped." (use sparingly; default to creating when in doubt)

Silence is not acceptable as evidence of a complete check.

## Common Mistakes

| Mistake                                       | Correct approach                                      |
| --------------------------------------------- | ----------------------------------------------------- |
| Staying silent when nothing needs updating    | Always report explicitly                              |
| Updating only one surface when both exist     | Both must stay in sync                                |
| Adding code blocks or tables to a rule file   | Rules are prose-only; put those in the internal doc   |
| Letting a rule grow past ~100 lines           | Hard ceiling — move depth into the internal doc        |
| Only flagging an undocumented subsystem       | Create the rule (and doc, if warranted) — don't just flag |
| Cramming a deep-dive into a new rule          | Rule = dense essentials; depth goes in the internal doc |
| Skipping the loaded-rules reflection          | Rules loaded during the session are always candidates |
