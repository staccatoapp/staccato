# Triage & File (shared workflow)

How a **standalone** reviewer skill turns its findings into GitHub issues. The `codebase-audit` orchestrator does NOT use this file — it runs its own cross-reviewer dedup and single approval gate.

> **If you were dispatched by the `codebase-audit` orchestrator (findings-only mode):** STOP after emitting your JSON findings array. Do not triage, do not file. The orchestrator handles dedup, the approval gate, and filing. The rest of this file does not apply to you.

## Standalone flow

### 1. Triage

Within your single area, merge near-duplicate findings (same root cause/location) into one, keeping the highest severity. Sort by severity, then confidence.

### 2. APPROVAL GATE (mandatory — never skip)

Present the triaged list to the user as markdown grouped by severity. For each item show: title, severity, location(s), one-line description, recommendation. Then **STOP and ask the user to approve, edit, drop, or re-severity items.**

**Do NOT create any GitHub issue or touch the board before explicit approval.** Issue creation is outward-facing and has no bulk-undo. If the user is silent, ask — do not assume.

Offer a severity floor (e.g. "file High/Critical individually, collapse Low into one tracking issue?") so the board isn't flooded.

### 3. File approved items

Follow `.claude/audit/create-issues.md`.

### 4. Report

List created issue numbers/URLs grouped by severity, the count added to the board, and anything skipped as already-filed.
