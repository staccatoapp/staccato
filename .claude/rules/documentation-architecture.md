---
paths:
  - "apps/docs/**/*.md"
  - "apps/internal-docs/**/*.md"
  - ".claude/rules/**/*.md"
---

### Documentation Site

The docs site is a VitePress static site that lives in `apps/docs`. This is the PUBLIC documentation site (internal, developer-facing documentation lives in `apps/internal-docs`). It is built and deployed independently from the main application — it is NOT included in the Docker image that users pull. Docs cover setup/installation guides, configuration reference, API documentation, and user guides.

### Documentation surfaces

Staccato documents itself in three places, separated by audience:

- `.claude/rules/*.md` — machine-facing canonical notes for AI sessions, governed by their `paths:` frontmatter. Terse and dense: prose, no tables or code blocks. A rule is self-sufficient — it carries everything a session needs, so a session never has to open the internal docs.
- `apps/internal-docs/` — human-facing deep-dives for developers working *on* Staccato. The most detailed surface (tables, code snippets, examples). Local-only, never deployed.
- `apps/docs/` — public, user-facing docs for people *running* Staccato. Deployed separately (see above).

### Keeping rules and internal-docs in sync

The two developer surfaces are independent and do NOT reference each other — a rule stays self-contained (no session should need to load the docs), and an internal-doc reads on its own (no developer should be sent back to the rules). But many subsystems are documented by both, and the two must never contradict each other: **when you change a subsystem, update every surface that documents it.** A rule and its internal-doc companion share a kebab-case slug (e.g. `listen-events.md` in both `.claude/rules/` and `apps/internal-docs/src/architecture/`), so the pairing is mechanical rather than linked.
