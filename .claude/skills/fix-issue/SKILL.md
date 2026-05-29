---
name: fix-issue
description: Use when the user wants a GitHub issue taken end-to-end in the Staccato repo — from an issue number/URL through a verified PR. Triggers include "turn issue #N into a PR", "implement/fix/address this issue". Not for ad-hoc bugs with no issue (use systematic-debugging) or reviewing an existing diff (use code-review).
---

# Issue to PR

## Overview

Take one GitHub issue in the Staccato monorepo from specification to a verified pull request: load it, clarify, plan, implement, test, verify, and open the PR. Uses the **`gh` CLI** (the rest of this repo's GitHub tooling does — see `.claude/audit/create-issues.md`), run through the **Bash tool** so multi-line bodies parse correctly.

**Core principle:** two human gates — requirements and plan — come *before* any code, and nothing is claimed green without command output to back it.

This skill is whitelisted in `CLAUDE.md` to run git commands; outside it, the no-git-history rule still applies.

## When to Use

- The user gives an issue number/URL and wants it implemented end-to-end.
- "Turn issue #N into a PR", "implement/fix/address this issue".

**Not for:** a bug with no tracking issue (use `superpowers:systematic-debugging`); reviewing a branch/PR diff (use `code-review`); a known refactor with no issue (just do it under the normal workflow).

## Prerequisites

- `gh` authenticated; working directory is the `staccatoapp/staccato` repo (the remote infers owner/name — no `--owner` needed for `gh issue`/`gh pr`; `gh project` calls still need `--owner staccatoapp`).
- Run all `gh` and `git` commands through the **Bash tool**, not PowerShell — multi-line `--body`/commit bodies and `\` continuations don't parse in PS 5.1.

## Workflow

```dot
digraph issue_to_pr {
  "Load issue (gh issue view)" [shape=box];
  "Requirements clear?" [shape=diamond];
  "Clarify with user (GATE)" [shape=box];
  "Plan, present via plan mode (GATE)" [shape=box];
  "Plan approved?" [shape=diamond];
  "Branch (agent/<n>-<slug>) + implement" [shape=box];
  "Add/update tests" [shape=box];
  "Verify: lint, check-types, test, build" [shape=box];
  "All green?" [shape=diamond];
  "Commit, push, gh pr create" [shape=box];

  "Load issue (gh issue view)" -> "Requirements clear?";
  "Requirements clear?" -> "Clarify with user (GATE)" [label="no / ambiguous"];
  "Clarify with user (GATE)" -> "Requirements clear?";
  "Requirements clear?" -> "Plan, present via plan mode (GATE)" [label="yes"];
  "Plan, present via plan mode (GATE)" -> "Plan approved?";
  "Plan approved?" -> "Plan, present via plan mode (GATE)" [label="revise"];
  "Plan approved?" -> "Branch (agent/<n>-<slug>) + implement" [label="approved"];
  "Branch (agent/<n>-<slug>) + implement" -> "Add/update tests" -> "Verify: lint, check-types, test, build" -> "All green?";
  "All green?" -> "Branch (agent/<n>-<slug>) + implement" [label="fix"];
  "All green?" -> "Commit, push, gh pr create" [label="yes"];
}
```

Follow the phases in order. Do not skip the two gates.

### Phase 1 — Load the issue

1. Get the issue number/URL from the user if not given.
2. `gh issue view <n> --comments` for title, body, labels, and discussion. Read linked issues/PRs if referenced.
3. Summarise the issue back to the user.

### Phase 2 — Clarify requirements (GATE)

**REQUIRED SUB-SKILL:** when the issue is open-ended (a feature, a vague report, multiple interpretations), use `superpowers:brainstorming` to surface intent before planning.

Stop and ask the user if **any** of these hold: expected behaviour under-specified, edge cases unaddressed, affected modules unclear, multiple readings possible, or it leans on context not in the repo. If it's genuinely clear and self-contained, say so and proceed.

### Phase 3 — Plan (GATE)

**REQUIRED SUB-SKILL:** use `superpowers:writing-plans` to produce the plan after researching the relevant code, patterns, and existing tests.

Cover: files created/modified, the change per file, tests to add/update, and how it'll be verified. **Present the plan through plan mode (`ExitPlanMode`)** so approval is an explicit gate — no code changes until approved. Revise and re-present on feedback.

> **Note:** `writing-plans` defaults to saving plans under `docs/superpowers/plans/`. When plan mode is active, the plan mode system message specifies its own file path — use that path instead.

### Phase 4 — Implement on a branch

**REQUIRED SUB-SKILL:** use `superpowers:using-git-worktrees` to create an isolated workspace. Consent is implicit — skip the consent gate and go straight to Step 1. Use branch name `agent/<issue#>-<short-slug>` (e.g. `agent/42-queue-race`). If the native `EnterWorktree` tool is available, prefer it (Step 1a).

**WORKTREE PATH DISCIPLINE** — once `EnterWorktree` runs, the session cwd is the worktree (e.g. `C:\Projects\staccato\.claude\worktrees\agent+10-…`). Every subsequent operation must stay inside that path:
- **Bash**: do not prefix commands with `cd /c/Projects/staccato &&` or any path to the main repo checkout — run `pnpm`, `git`, and `gh` directly so they resolve from the worktree cwd.
- **Explore agents**: pass the worktree path as the search root, not the main repo path. The worktree path is printed in `EnterWorktree`'s output — use it explicitly in agent prompts.
- **Read / Edit / Write**: use absolute paths rooted at the worktree, not at `C:\Projects\staccato\`. Translate any main-repo paths returned by explorers before using them.

Violating this causes all edits to land in the main repo's working tree, defeating the isolation and forcing a manual branch creation at commit time.

1. Make surgical changes that follow existing patterns; no unrelated churn.
3. Honour Staccato conventions (`CLAUDE.md`):
   - Cross-app-boundary types use **zod** in `packages/shared/src/types/zod`, with validation at use sites; prefer the shared package for non-project-specific helpers.
   - **Logging:** every `catch` logs; every external call site (MusicBrainz/AcoustID/Lidarr/Cover Art) logs failures with context. Object-first: `log.warn({ err, operation, ...ids }, "message")` — never string interpolation. Pick the level per the log-level guidance in `CLAUDE.md`.

### Phase 5 — Tests

**REQUIRED SUB-SKILL:** use `superpowers:test-driven-development` for new or changed logic.

Add unit tests (and integration tests where the change crosses a boundary) covering the edge cases identified in Phase 2. Match the repo's existing test layout and framework (Vitest, run via `pnpm test`).

### Phase 6 — Verify

**REQUIRED BACKGROUND:** `superpowers:verification-before-completion` — show command output; never claim green from assumption.

Run and confirm each passes, fixing and re-running on failure:

```bash
pnpm lint:fix --force  # --force bypasses turbo cache so lint runs on every package, not just ones turbo considers dirty
pnpm check-types       # tsc across the monorepo
pnpm test              # vitest
pnpm build         # production build
```

If something genuinely can't be verified here (missing service/dep), state exactly what and why — don't fabricate results.

### Phase 7 — Commit and open the PR

1. Commit with a message referencing the issue (e.g. `fix: resolve queue race (#42)`), ending with the `Co-Authored-By:` trailer the harness mandates. Prefer focused commits when the change decomposes naturally.
2. `git push -u origin agent/<issue#>-<short-slug>`.
3. Open the PR with `gh pr create --base main`. Fill the repo template at `.github/PULL_REQUEST_TEMPLATE/pull-request-template.md` ("What's being changed and why?" + "Verification steps") and include `Closes #<n>`. Write the body to a UTF-8 file and pass `--body-file` (inline non-ASCII gets mangled at the shell boundary) — end it with the `🤖 Generated with [Claude Code]` line.
4. Optional: add the issue to the Staccato Development board / move its card using the `gh project ... --owner staccatoapp` recipe in `.claude/audit/create-issues.md`.
5. Give the user the PR URL.

## Guardrails

- Never skip the Phase 2 and Phase 3 gates — even if the issue "looks obvious."
- Never push to `main`; always the `agent/<issue#>-…` branch. Never open the PR before verification passes.
- Never commit secrets/tokens. Never fabricate test results. Never merge the PR — leave that to review/CI.
- If the issue is large, propose splitting it into smaller PRs and confirm scope before implementing.
- Uncertain at any point? Stop and ask rather than guess.

## Common Mistakes

- **Skipping the worktree setup** — Phase 4 always starts with `superpowers:using-git-worktrees`. Don't fall back to a bare `git checkout -b`.
- **Summarising the issue and diving straight to code** — skips both gates; the most common failure. Confirm requirements, then get plan approval.
- **Running `gh`/`git` through PowerShell** — multi-line bodies and `\` continuations break. Use the Bash tool.
- **Inlining the PR body** — em-dashes/curly quotes mangle on the command line. Use `--body-file` with a UTF-8 file. Pass an **absolute path** to `--body-file`; `gh` does not resolve relative paths from the repo root when invoked via Bash.
- **Claiming "tests pass" without output** — run `pnpm test`/`lint`/`check-types`/`build` and show it.
- **Re-deriving planning/TDD/clarify logic inline** — defer to the referenced sub-skills instead of duplicating them.
- **Generic branch names** (`fix/...`, `patch-1`) — this repo uses `agent/<issue#>-<slug>`.
- **Skipping a `catch`/external-call log** — fails review under the Staccato logging rules; add it during Phase 4, not after.
