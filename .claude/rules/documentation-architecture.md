---
paths:
  - "apps/docs/**/*.md"
---

### Documentation Site

The docs site is a VitePress static site that lives in `apps/docs`. This is the PUBLIC documentation site (internal, developer-facing documentation lives in `apps/internal-docs`). It is built and deployed independently from the main application — it is NOT included in the Docker image that users pull. Docs cover setup/installation guides, configuration reference, API documentation, and user guides.
